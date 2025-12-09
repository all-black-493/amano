import { redis } from '@/lib/redis'
import { Elysia, t } from 'elysia'
import { nanoid } from 'nanoid'
import { authMiddleware } from './auth'
import z from 'zod'
import { Message, realtime } from '@/lib/realtime'
import {
    cors
} from '@elysiajs/cors'

const ROOM_TTL_SECONDS = 60 * 10

async function createRoomMeta() {
    console.log("Creating a new room ...")

    const roomId = nanoid();
    await redis.hset(`meta:${roomId}`, { connected: [], createdAt: Date.now() });
    await redis.expire(`meta:${roomId}`, ROOM_TTL_SECONDS);
    await redis.sadd("waiting_rooms", roomId);
    return roomId;
}


const rooms = new Elysia({
    prefix: "/room"
})
    .post("/create", async () => {

        const roomId = await createRoomMeta()
        return { roomId }

    })
    .post("/random", async ({ set }) => {
        // Try to pop a room from waiting rooms first
        let roomId = await redis.spop("waiting_rooms", 1);

        if (roomId) {
            const meta = await redis.hgetall<{ connected: string[]; createdAt: number }>(`meta:${roomId}`);

            // If room doesn't exist OR is already full (2 people), create new room
            if (!meta?.connected || meta.connected.length >= 2) {
                roomId = await createRoomMeta();
            }
            // If room has 1 person, perfect - we'll join it
        } else {
            // No waiting rooms at all, create new one
            roomId = await createRoomMeta();
        }

        // Generate a token for the user
        const token = nanoid();

        // Add user to the room immediately
        const meta = await redis.hgetall<{ connected: string[]; createdAt: number }>(`meta:${roomId}`);
        if (meta) {
            await redis.hset(`meta:${roomId}`, {
                connected: [...(meta.connected || []), token],
            });

            // If room now has 2 people, remove it from waiting rooms
            if (meta.connected && meta.connected.length === 1) {
                await redis.srem("waiting_rooms", roomId);
            }
        }

        // Set the cookie in the response
        set.headers['set-cookie'] = `x-auth-token=${token}; Path=/; HttpOnly; SameSite=Strict${process.env.NODE_ENV === 'production' ? '; Secure' : ''
            }`;

        return { roomId };
    })
    .use(authMiddleware)
    .get("/ttl", async ({ auth }) => {
        const ttl = await redis.ttl(`meta:${auth.roomId}`)
        return { ttl: ttl > 0 ? ttl : 0 }
    }, {
        query: z.object({
            roomId: z.string()
        })
    })
    .delete("/", async ({ auth }) => {

        await realtime.channel(auth.roomId).emit("chat.destroy", { isDestroyed: true })

        await Promise.all([
            redis.srem("waiting_rooms", auth.roomId),
            redis.del(auth.roomId),
            redis.del(`meta:${auth.roomId}`),
            redis.del(`messages:${auth.roomId}`)
        ])

    }, {
        query: z.object({ roomId: z.string() })
    })


const messages = new Elysia({
    prefix: "/messages"
})
    .use(authMiddleware)
    .post("/",
        async ({ body, auth }) => {

            const { sender, text } = body

            const { roomId } = auth

            const roomExists = await redis.exists(`meta:${roomId}`)

            if (!roomExists) {
                throw new Error("Room does not exist")
            }

            const message: Message = {
                id: nanoid(),
                sender,
                text,
                timestamp: Date.now(),
                roomId
            }

            await redis.rpush(`messages:${roomId}`, { ...message, token: auth.token })
            await realtime.channel(roomId).emit("chat.message", message)

            const remaining = await redis.ttl(`meta:${roomId}`)

            await Promise.all([
                redis.expire(`messages:${roomId}`, remaining),
                redis.expire(`history:${roomId}`, remaining),
                redis.expire(roomId, remaining)
            ])

        },
        {
            query: z.object({
                roomId: z.string()
            }),

            body: z.object({
                sender: z.string().max(100),
                text: z.string().max(1000)
            })
        })
    .get("/", async ({ auth }) => {
        const messages = await redis.lrange<Message>(`messages:${auth.roomId}`, 0, -1)
        return {
            messages: messages.map((m) => ({
                ...m,
                token: m.token === auth.token ? auth.token : undefined
            })),
        }

    }, {
        query: z.object({ roomId: z.string() })
    })

const app = new Elysia({ prefix: '/api' })
    .use(cors())
    .use(rooms)
    .use(messages)

export const GET = app.fetch
export const POST = app.fetch
export const DELETE = app.fetch

export type App = typeof app


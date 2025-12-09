// message, destroy

import { InferRealtimeEvents, Realtime } from "@upstash/realtime";
import z from "zod";
import { redis } from "@/lib/redis"
import type { SignalData } from "simple-peer"


const signalDataSchema: z.ZodType<SignalData> = z.custom<SignalData>(
  (val) => {
    return typeof val === 'string' || 
           (val !== null && typeof val === 'object')
  },
  {
    message: "Invalid signal data"
  }
)

const message = z.object({
    id: z.string(),
    sender: z.string(),
    text: z.string(),
    timestamp: z.number(),
    roomId: z.string(),
    token: z.string().optional()
})

const schema = {
    chat: {
        message,
        destroy: z.object({
            isDestroyed: z.literal(true)
        })
    },
    webrtc: {
        signal: z.object({
            roomId: z.string(),
            from: z.string(),              
            signal: signalDataSchema,          
        }),
    },
}

export const realtime = new Realtime({ schema, redis })
export type RealtimeEvents = InferRealtimeEvents<typeof realtime>
export type Message = z.infer<typeof message>
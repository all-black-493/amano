import { redis } from "@/lib/redis";

export async function cleanWaitingRooms() {
    try {
        console.log("[cleanup] Starting waiting-rooms cleanp ...");
        const roomIds = await redis.smembers("waiting_rooms");
        console.log(`[cleanup] Found ${roomIds.length} waiting rooms`);

        let removed = 0;

        for (const roomId of roomIds) {
            const exists = await redis.exists(`meta:${roomId}`);
            if (!exists) {
                console.log(`[cleanup] Removing stale room ${roomId}`);
                await redis.srem("waiting_rooms", roomId);
                removed++;
            }
        }
        console.log(`[cleanup] Cleanup done — removed ${removed} entries`);
        process.exit(0);
    } catch (error) {
        console.error("Error during cleanup:", error);
        process.exit(1);
    }

}


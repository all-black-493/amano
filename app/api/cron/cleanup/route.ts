import { NextResponse } from "next/server";
import { cleanWaitingRooms } from "@/scripts/clean-up";

export async function GET() {
    try {
        await cleanWaitingRooms();
        return NextResponse.json({ success: true });
    } catch (err) {
        console.error("Cron cleanup failed:", err);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}

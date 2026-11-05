import { NextResponse } from "next/server";
import { expireOverdueTickets } from "@/lib/farmerStorage";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/expire-tickets
 * Vercel Cron Job — เปลี่ยนตั๋วที่เลย expiresAt เป็น EXPIRED
 * เรียกทุกวันตี 1 (ตั้งค่าใน vercel.json)
 *
 * ป้องกันการเรียกจากภายนอก: ตรวจ CRON_SECRET header
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const { expiredCount } = await expireOverdueTickets();
    console.log(`[Cron] Expired ${expiredCount} tickets at ${new Date().toISOString()}`);
    return NextResponse.json({
      ok: true,
      expiredCount,
      runAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("[Cron] expire-tickets error:", error);
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}

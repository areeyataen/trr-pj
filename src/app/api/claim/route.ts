import { NextResponse } from "next/server";
import { claimTicketAtomic } from "@/lib/farmerStorage";
import { checkRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/**
 * POST /api/claim — ชาวไร่สแกน QR รับแต้ม
 *
 * รับ: { token, lineUserId }
 *
 * ป้องกัน:
 * - Rate limit ต่อ IP และ lineUserId กันการ brute-force สุ่มเดาโทเคน
 * - มีโทเคนหรือไม่
 * - status เป็น UNCLAIMED หรือไม่
 * - ยังไม่เลย expiresAt หรือไม่
 * - lineUserId ตรงกับเจ้าของตั๋วหรือไม่
 * - Atomic claim ใน SQL UPDATE ... WHERE status = 'UNCLAIMED'
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { token, lineUserId } = body;

    if (!token || typeof token !== "string" || token.length < 10) {
      return NextResponse.json({ message: "กรุณาระบุ token ที่ถูกต้อง" }, { status: 400 });
    }
    if (!lineUserId || typeof lineUserId !== "string") {
      return NextResponse.json(
        { message: "กรุณาล็อกอิน LINE ก่อนรับแต้ม" },
        { status: 401 }
      );
    }

    // ดึง IP สำหรับ audit log & rate limit
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";

    // Rate Limit ต่อ IP (สูงสุด 20 ครั้ง/นาที)
    const ipLimit = checkRateLimit(`claim:ip:${ip}`, 20, 60_000);
    if (!ipLimit.success) {
      return NextResponse.json(
        { message: `คุณทำรายการถี่เกินไป กรุณารออีก ${ipLimit.resetInSeconds} วินาที` },
        { status: 429 }
      );
    }

    // Rate Limit ต่อ lineUserId (สูงสุด 10 ครั้ง/นาที)
    const userLimit = checkRateLimit(`claim:user:${lineUserId}`, 10, 60_000);
    if (!userLimit.success) {
      return NextResponse.json(
        { message: `บัญชีนี้ทำรายการถี่เกินไป กรุณารออีก ${userLimit.resetInSeconds} วินาที` },
        { status: 429 }
      );
    }

    const result = await claimTicketAtomic(token, lineUserId, ip);

    if (!result.success) {
      return NextResponse.json({ message: result.message, ticket: result.ticket }, { status: 400 });
    }

    return NextResponse.json({
      message: result.message,
      pointsAdded: result.pointsAdded,
      newTotal: result.newTotal,
      ticket: result.ticket
        ? {
            ticketNo: result.ticket.ticketNo,
            farmerName: result.ticket.farmerName,
            weightTons: result.ticket.weightTons,
            points: result.ticket.points,
            claimedAt: result.ticket.claimedAt,
          }
        : undefined,
    });
  } catch (error: any) {
    console.error("POST /api/claim Error:", error);
    return NextResponse.json({ message: error.message || "เกิดข้อผิดพลาด" }, { status: 500 });
  }
}

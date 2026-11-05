import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-guard";
import {
  createTicketSecure,
  getTicketByToken,
  POINTS_PER_TON,
  MAX_WEIGHT_TONS,
  getFarmerByLineUserId,
} from "@/lib/farmerStorage";

export const dynamic = "force-dynamic";

const createTicketSchema = z.object({
  farmerId: z.string().min(1, "กรุณาระบุ farmerId"),
  weightTons: z.coerce
    .number()
    .positive("น้ำหนักต้องมากกว่า 0")
    .max(MAX_WEIGHT_TONS, `น้ำหนักเกินเพดาน ${MAX_WEIGHT_TONS} ตัน`),
  plateNo: z
    .string()
    .trim()
    .min(2, "ทะเบียนรถต้องมีอย่างน้อย 2 ตัวอักษร")
    .max(20, "ทะเบียนรถต้องไม่เกิน 20 ตัวอักษร"),
  grossKg: z.coerce.number().positive().optional().nullable(),
  tareKg: z.coerce.number().positive().optional().nullable(),
});

/** GET /api/tickets?token=... — ดูข้อมูลตั๋ว (ไม่ต้อง auth — ใช้สำหรับ claim page) */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    if (!token) return NextResponse.json({ message: "กรุณาระบุ token" }, { status: 400 });

    const ticket = await getTicketByToken(token);
    if (!ticket) return NextResponse.json({ message: "ไม่พบข้อมูลตั๋วนี้" }, { status: 404 });

    // คืนเฉพาะ fields ที่จำเป็น — ไม่คืน lineUserId เพื่อป้องกัน info leak
    return NextResponse.json(
      {
        ticketNo: ticket.ticketNo,
        farmerName: ticket.farmerName,
        weightTons: ticket.weightTons,
        plateNo: ticket.plateNo,
        points: ticket.points,
        status: ticket.status,
        expiresAt: ticket.expiresAt,
        isClaimed: ticket.isClaimed || ticket.status === "CLAIMED",
        claimedTime: ticket.claimedTime,
        createdAt: ticket.createdAt,
      },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  } catch (error: any) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}

/**
 * POST /api/tickets — เจ้าหน้าที่ออกตั๋วใหม่ (admin เท่านั้น)
 * รับ: farmerId, weightTons, plateNo, grossKg?, tareKg?
 * เซิร์ฟเวอร์คำนวณ: points, ticketNo, token, expiresAt
 */
export async function POST(request: Request) {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const json = await request.json().catch(() => ({}));
    const parseResult = createTicketSchema.safeParse(json);

    if (!parseResult.success) {
      const errorMsg = parseResult.error.issues.map((i) => i.message).join(", ");
      return NextResponse.json({ message: errorMsg }, { status: 400 });
    }

    const { farmerId, weightTons, plateNo, grossKg, tareKg } = parseResult.data;

    // ดึงข้อมูลชาวไร่จาก DB (ไม่เชื่อ client)
    const farmer = await getFarmerByLineUserId(String(farmerId));
    if (!farmer) {
      return NextResponse.json({ message: "ไม่พบข้อมูลชาวไร่ในระบบ" }, { status: 404 });
    }

    const { ticket } = await createTicketSecure({
      farmerId: String(farmerId),
      lineUserId: farmer.lineUserId,
      farmerName: farmer.fullName,
      weightTons,
      plateNo,
      grossKg: grossKg ? Number(grossKg) : undefined,
      tareKg: tareKg ? Number(tareKg) : undefined,
      issuedBy: "admin",
    });

    return NextResponse.json({
      message: "ออกตั๋วสำเร็จ",
      ticket: {
        id: ticket.id,
        ticketNo: ticket.ticketNo,
        token: ticket.token,
        farmerName: ticket.farmerName,
        weightTons: ticket.weightTons,
        plateNo: ticket.plateNo,
        grossKg: ticket.grossKg,
        tareKg: ticket.tareKg,
        points: ticket.points,
        pointsPerTon: POINTS_PER_TON,
        status: ticket.status,
        expiresAt: ticket.expiresAt,
        createdAt: ticket.createdAt,
      },
    });
  } catch (error: any) {
    console.error("POST Tickets Error:", error);
    // ส่ง message ที่ friendly สำหรับ duplicate
    if (error.message?.includes("ตั๋วซ้ำ")) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }
    return NextResponse.json({ message: error.message || "เกิดข้อผิดพลาด" }, { status: 500 });
  }
}

/** PUT /api/tickets — backward compat (ไม่ใช้แล้ว ใช้ POST /api/claim แทน) */
export async function PUT() {
  return NextResponse.json(
    { message: "กรุณาใช้ POST /api/claim เพื่อรับแต้มสะสม" },
    { status: 410 }
  );
}

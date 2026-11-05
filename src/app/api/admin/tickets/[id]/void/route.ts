import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";
import { voidTicket } from "@/lib/farmerStorage";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/tickets/[id]/void
 * Body: { reason: string }
 * ยกเลิกตั๋วเฉพาะที่มีสถานะ UNCLAIMED
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const reason = String(body.reason || "").trim();

    if (!reason) {
      return NextResponse.json({ message: "กรุณาระบุเหตุผลในการยกเลิกตั๋ว" }, { status: 400 });
    }
    if (!id || isNaN(Number(id))) {
      return NextResponse.json({ message: "รหัสตั๋วไม่ถูกต้อง" }, { status: 400 });
    }

    const session = await getServerSession(authOptions);
    const adminId = (session?.user as any)?.email || "admin";

    const result = await voidTicket(id, adminId, reason);
    if (!result.success) {
      return NextResponse.json({ message: result.message }, { status: 400 });
    }

    return NextResponse.json({ message: result.message, ticket: result.ticket });
  } catch (error: any) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}

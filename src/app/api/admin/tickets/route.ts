import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";
import { getAllTickets } from "@/lib/farmerStorage";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/tickets
 * Query params:
 *   startDate: YYYY-MM-DD
 *   endDate: YYYY-MM-DD
 *   status: ALL | CLAIMED | UNCLAIMED | EXPIRED | VOIDED
 *   search: ชื่อชาวไร่, ทะเบียนรถ, หรือเลขตั๋ว
 */
export async function GET(request: Request) {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate") || undefined;
    const endDate = searchParams.get("endDate") || undefined;
    const status = searchParams.get("status") || undefined;
    const search = searchParams.get("search") || undefined;

    const tickets = await getAllTickets({
      startDate,
      endDate,
      status,
      search,
    });

    return NextResponse.json(tickets, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  } catch (error: any) {
    console.error("GET /api/admin/tickets error:", error);
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}

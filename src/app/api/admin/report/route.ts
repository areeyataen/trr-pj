import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";
import { getDailyReport } from "@/lib/farmerStorage";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/report?date=YYYY-MM-DD
 * สรุปรายวัน แยกตามเจ้าหน้าที่ ตั๋วค้างรับ พ้อยท์ที่แจก
 */
export async function GET(request: Request) {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date") || undefined;

    // Validate date format
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ message: "รูปแบบวันที่ไม่ถูกต้อง (YYYY-MM-DD)" }, { status: 400 });
    }

    const report = await getDailyReport(date);
    return NextResponse.json(report, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: any) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}

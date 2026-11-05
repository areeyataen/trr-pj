import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";
import {
  getFarmers,
  searchFarmers,
  createFarmer,
  updateFarmer,
  deleteFarmer,
  getFarmerByLineUserId,
} from "@/lib/farmerStorage";

export const dynamic = "force-dynamic";

/**
 * GET /api/farmers
 * - ?q=... (admin เท่านั้น) ค้นหา สูงสุด 8 รายการ
 * - ?lineUserId=... (ชาวไร่ดูของตัวเอง — ไม่ต้อง auth แต่คืนเฉพาะ record ของ lineUserId นั้น)
 * - ไม่มี query (admin เท่านั้น) คืนทั้งหมด
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");
  const lineUserId = searchParams.get("lineUserId");

  // ถ้าเป็น query ด้วย lineUserId → ชาวไร่ดูของตัวเอง (ไม่ต้อง admin)
  if (lineUserId) {
    try {
      const farmer = await getFarmerByLineUserId(lineUserId);
      if (!farmer) return NextResponse.json(null, { status: 404 });
      // คืนเฉพาะ fields ที่จำเป็น (ไม่ส่ง idCard, quotaNumber ให้ไม่จำเป็น)
      return NextResponse.json(
        {
          id: farmer.id,
          lineUserId: farmer.lineUserId,
          lineDisplayName: farmer.lineDisplayName,
          linePictureUrl: farmer.linePictureUrl,
          fullName: farmer.fullName,
          phone: farmer.phone,
          points: farmer.points,
          userRole: farmer.userRole,
          createdAt: farmer.createdAt,
        },
        {
          headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
        }
      );
    } catch (error: any) {
      return NextResponse.json({ message: error.message }, { status: 500 });
    }
  }

  // ทุก request อื่น — ต้องเป็น admin
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    if (q) {
      // ค้นหา (เจ้าหน้าที่ใช้ในหน้าออกตั๋ว)
      const results = await searchFarmers(q, 8);
      return NextResponse.json(
        results.map((f) => ({
          id: f.id,
          _id: f._id,
          lineUserId: f.lineUserId,
          lineDisplayName: f.lineDisplayName,
          fullName: f.fullName,
          phone: f.phone,
          points: f.points,
          hasLine: !!f.lineUserId && !f.lineUserId.startsWith("U_ADMIN_"),
        })),
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    // คืนรายชื่อทั้งหมด (admin เท่านั้น)
    const list = await getFarmers();
    return NextResponse.json(list, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  } catch (error: any) {
    console.error("GET Farmers Error:", error);
    return NextResponse.json([], { status: 500 });
  }
}

/** POST /api/farmers — admin เพิ่มผู้ใช้ใหม่ */
export async function POST(request: Request) {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const body = await request.json();
    if (!body.fullName || !body.phone) {
      return NextResponse.json({ message: "กรุณาระบุชื่อ-นามสกุล และเบอร์โทรศัพท์" }, { status: 400 });
    }
    const farmer = await createFarmer({
      fullName: body.fullName.trim(),
      phone: body.phone.trim(),
      quotaNumber: body.quotaNumber?.trim(),
      userRole: body.userRole?.trim(),
      idCard: body.idCard?.trim(),
      points: typeof body.points === "number" ? body.points : 0,
      lineDisplayName: body.lineDisplayName?.trim(),
    });
    return NextResponse.json({ message: "เพิ่มผู้ใช้ใหม่สำเร็จ", farmer });
  } catch (error: any) {
    return NextResponse.json({ message: "เกิดข้อผิดพลาด: " + error.message }, { status: 500 });
  }
}

/** PUT /api/farmers — admin แก้ไขข้อมูลผู้ใช้ */
export async function PUT(request: Request) {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const body = await request.json();
    const targetId = body.id || body._id || body.lineUserId;
    if (!targetId) {
      return NextResponse.json({ message: "ไม่พบรหัสผู้ใช้ที่ต้องการแก้ไข" }, { status: 400 });
    }
    const result = await updateFarmer(String(targetId), {
      fullName: body.fullName?.trim(),
      phone: body.phone?.trim(),
      quotaNumber: body.quotaNumber?.trim(),
      userRole: body.userRole?.trim(),
      idCard: body.idCard?.trim(),
      points: typeof body.points === "number" ? body.points : undefined,
      lineDisplayName: body.lineDisplayName?.trim(),
    });
    if (!result.success) return NextResponse.json({ message: "ไม่พบผู้ใช้ในระบบ" }, { status: 404 });
    return NextResponse.json({ message: "แก้ไขข้อมูลสำเร็จ", farmer: result.farmer });
  } catch (error: any) {
    return NextResponse.json({ message: "เกิดข้อผิดพลาด: " + error.message }, { status: 500 });
  }
}

/** DELETE /api/farmers?id=... — admin ลบผู้ใช้ */
export async function DELETE(request: Request) {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    let targetId = searchParams.get("id");
    if (!targetId) {
      const body = await request.json().catch(() => ({}));
      targetId = body.id || body._id || body.lineUserId;
    }
    if (!targetId) return NextResponse.json({ message: "กรุณาระบุรหัสผู้ใช้ที่ต้องการลบ" }, { status: 400 });
    const success = await deleteFarmer(String(targetId));
    if (!success) return NextResponse.json({ message: "ไม่สามารถลบได้ หรือไม่พบผู้ใช้" }, { status: 404 });
    return NextResponse.json({ message: "ลบผู้ใช้เรียบร้อยแล้ว" });
  } catch (error: any) {
    return NextResponse.json({ message: "เกิดข้อผิดพลาด: " + error.message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getFarmers, createFarmer, updateFarmer, deleteFarmer } from "@/lib/farmerStorage";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const list = await getFarmers();
    return NextResponse.json(list, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  } catch (error: any) {
    console.error("GET Farmers Error:", error);
    return NextResponse.json([], { status: 500 });
  }
}

// แอดมินเพิ่มผู้ใช้ใหม่
export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.fullName || !body.phone) {
      return NextResponse.json(
        { message: "กรุณาระบุชื่อ-นามสกุล และเบอร์โทรศัพท์" },
        { status: 400 }
      );
    }

    const farmer = await createFarmer({
      fullName: body.fullName.trim(),
      phone: body.phone.trim(),
      quotaNumber: body.quotaNumber?.trim(),
      userRole: body.userRole?.trim(),
      idCard: body.idCard?.trim(),
      points: typeof body.points === "number" ? body.points : 100,
      lineDisplayName: body.lineDisplayName?.trim(),
    });

    return NextResponse.json({
      message: "เพิ่มผู้ใช้ใหม่สำเร็จ",
      farmer,
    });
  } catch (error: any) {
    console.error("POST Farmers Error:", error);
    return NextResponse.json({ message: "เกิดข้อผิดพลาด: " + error.message }, { status: 500 });
  }
}

// แอดมินแก้ไขข้อมูลผู้ใช้
export async function PUT(request: Request) {
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

    if (!result.success) {
      return NextResponse.json({ message: "ไม่พบผู้ใช้ในระบบ" }, { status: 404 });
    }

    return NextResponse.json({
      message: "แก้ไขข้อมูลสำเร็จ",
      farmer: result.farmer,
    });
  } catch (error: any) {
    console.error("PUT Farmers Error:", error);
    return NextResponse.json({ message: "เกิดข้อผิดพลาด: " + error.message }, { status: 500 });
  }
}

// แอดมินลบผู้ใช้
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    let targetId = searchParams.get("id");

    if (!targetId) {
      const body = await request.json().catch(() => ({}));
      targetId = body.id || body._id || body.lineUserId;
    }

    if (!targetId) {
      return NextResponse.json({ message: "กรุณาระบุรหัสผู้ใช้ที่ต้องการลบ" }, { status: 400 });
    }

    const success = await deleteFarmer(String(targetId));
    if (!success) {
      return NextResponse.json({ message: "ไม่สามารถลบได้ หรือไม่พบผู้ใช้" }, { status: 404 });
    }

    return NextResponse.json({ message: "ลบผู้ใช้เรียบร้อยแล้ว" });
  } catch (error: any) {
    console.error("DELETE Farmers Error:", error);
    return NextResponse.json({ message: "เกิดข้อผิดพลาด: " + error.message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { registerOrUpdateFarmer } from "@/lib/farmerStorage";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body.fullName || !body.phone) {
      return NextResponse.json(
        { message: "กรุณากรอกชื่อ-นามสกุล และเบอร์โทรศัพท์" },
        { status: 400 }
      );
    }

    const { farmer, isNew } = await registerOrUpdateFarmer({
      lineUserId: body.lineUserId || "U_FALLBACK_" + Date.now(),
      lineDisplayName: body.lineDisplayName,
      linePictureUrl: body.linePictureUrl,
      fullName: body.fullName,
      phone: body.phone,
      idCard: body.idCard,
      quotaNumber: body.quotaNumber,
      userRole: body.userRole,
    });

    if (!isNew) {
      return NextResponse.json({
        message: "บัญชี LINE นี้ได้ลงทะเบียนไปแล้ว (1 บัญชีลงทะเบียนได้ 1 ครั้ง)",
        alreadyRegistered: true,
        farmer,
      });
    }

    return NextResponse.json({
      message: "ลงทะเบียนชาวไร่สำเร็จ ได้รับโบนัส 100 พ้อยท์!",
      alreadyRegistered: false,
      farmer,
    });
  } catch (error: any) {
    console.error("Register Error:", error);
    return NextResponse.json(
      { message: "เกิดข้อผิดพลาดในการบันทึกข้อมูล: " + error.message },
      { status: 500 }
    );
  }
}

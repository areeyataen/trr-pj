import { NextResponse } from "next/server";
import { addFarmerPoints } from "@/lib/farmerStorage";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body.lineUserId || !body.points) {
      return NextResponse.json(
        { message: "ข้อมูลไม่ครบถ้วน (ต้องการ lineUserId และ points)" },
        { status: 400 }
      );
    }

    const result = await addFarmerPoints(body.lineUserId, Number(body.points));

    if (!result.success) {
      return NextResponse.json(
        { message: "ไม่พบข้อมูลสมาชิกชาวไร่ในระบบ" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      message: `เพิ่ม ${body.points} พ้อยท์สำเร็จ!`,
      previousPoints: result.previousPoints,
      addedPoints: Number(body.points),
      totalPoints: result.totalPoints,
      ticketNo: body.ticketNo,
      weightTons: body.weightTons,
      farmerName: result.farmer?.fullName,
    });
  } catch (error: any) {
    console.error("add-points error:", error);
    return NextResponse.json(
      { message: "เกิดข้อผิดพลาดในการเพิ่มแต้ม: " + error.message },
      { status: 500 }
    );
  }
}

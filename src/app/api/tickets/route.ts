import { NextResponse } from "next/server";
import { createTicket, getTicketByToken, claimTicket } from "@/lib/farmerStorage";

export const dynamic = "force-dynamic";

// ดึงข้อมูลตั๋วตาม token
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json({ message: "กรุณาระบุ token" }, { status: 400 });
    }

    const ticket = await getTicketByToken(token);
    if (!ticket) {
      return NextResponse.json({ message: "ไม่พบข้อมูลตั๋วนี้" }, { status: 404 });
    }

    return NextResponse.json(ticket, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  } catch (error: any) {
    console.error("GET Tickets Error:", error);
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}

// สร้างตั๋วใหม่ลง Cloud Database
export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.ticketNo || !body.token || !body.lineUserId || !body.farmerName) {
      return NextResponse.json({ message: "ข้อมูลตั๋วไม่ครบถ้วน" }, { status: 400 });
    }

    const savedTicket = await createTicket({
      ticketNo: body.ticketNo,
      token: body.token,
      lineUserId: body.lineUserId,
      farmerName: body.farmerName,
      weightTons: Number(body.weightTons) || 0,
      points: Number(body.points) || 0,
    });

    return NextResponse.json({
      message: "สร้างตั๋วสะสมพ้อยท์เรียบร้อย",
      ticket: savedTicket,
    });
  } catch (error: any) {
    console.error("POST Tickets Error:", error);
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}

// รับแต้มสะสมจากตั๋ว (สแกนรับแต้ม)
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const token = body.token;

    if (!token) {
      return NextResponse.json({ message: "กรุณาระบุ token" }, { status: 400 });
    }

    const result = await claimTicket(token);
    if (!result.success) {
      return NextResponse.json({ message: result.message, ticket: result.ticket }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("PUT Tickets Claim Error:", error);
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}

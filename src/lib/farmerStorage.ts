import { neon } from "@neondatabase/serverless";

// ระบบจัดการฐานข้อมูล รองรับทั้ง Vercel Postgres / Neon SQL จริง และ Fallback Cloud DB
export interface FarmerRecord {
  id?: number | string;
  _id?: string;
  lineUserId: string;
  lineDisplayName: string;
  linePictureUrl?: string;
  fullName: string;
  phone: string;
  idCard?: string;
  quotaNumber?: string;
  userRole: string;
  points: number;
  createdAt: string;
}

export interface TicketRecord {
  _id?: string;
  ticketNo: string;
  token: string;
  lineUserId: string;
  farmerName: string;
  weightTons: number;
  points: number;
  isClaimed: boolean;
  claimedTime?: string | null;
  createdAt: string;
}

// เช็คว่ามี POSTGRES_URL หรือ DATABASE_URL หรือไม่
const POSTGRES_URL = process.env.POSTGRES_URL || process.env.DATABASE_URL;

// Endpoint สำรองสำหรับ CrudCrud
const FALLBACK_CRUDCRUD_ID = process.env.CRUDCRUD_API_KEY || "eaddecdea7ed49caace06fb84de2e0b7";
const CLOUD_DB_URL = `https://crudcrud.com/api/${FALLBACK_CRUDCRUD_ID}/farmers`;
const CLOUD_TICKETS_URL = `https://crudcrud.com/api/${FALLBACK_CRUDCRUD_ID}/tickets`;

// ฟังก์ชันเชื่อมต่อ Neon / Postgres
function getSql() {
  if (!POSTGRES_URL) return null;
  return neon(POSTGRES_URL);
}

// ตรวจสอบและสร้างตารางใน Postgres อัตโนมัติถ้ายังไม่มี
let tableInitPromise: Promise<void> | null = null;
async function ensureTables() {
  const sql = getSql();
  if (!sql) return;

  if (!tableInitPromise) {
    tableInitPromise = (async () => {
      try {
        await sql`
          CREATE TABLE IF NOT EXISTS farmers (
            id SERIAL PRIMARY KEY,
            line_user_id TEXT UNIQUE NOT NULL,
            line_display_name TEXT DEFAULT '',
            line_picture_url TEXT DEFAULT '',
            full_name TEXT NOT NULL,
            phone TEXT NOT NULL,
            id_card TEXT DEFAULT '',
            quota_number TEXT DEFAULT '',
            user_role TEXT DEFAULT 'ชาวไร่',
            points INTEGER DEFAULT 0,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          );
        `;
        await sql`
          CREATE TABLE IF NOT EXISTS tickets (
            id SERIAL PRIMARY KEY,
            ticket_no TEXT NOT NULL,
            token TEXT UNIQUE NOT NULL,
            line_user_id TEXT NOT NULL,
            farmer_name TEXT NOT NULL,
            weight_tons NUMERIC DEFAULT 0,
            points INTEGER DEFAULT 0,
            is_claimed BOOLEAN DEFAULT FALSE,
            claimed_time TEXT DEFAULT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          );
        `;
      } catch (err) {
        console.error("Postgres table init error:", err);
      }
    })();
  }
  return tableInitPromise;
}

// ============================== FARMERS FUNCTIONS ==============================

// ดึงรายชื่อทั้งหมด
export async function getFarmers(): Promise<FarmerRecord[]> {
  const sql = getSql();
  if (sql) {
    try {
      await ensureTables();
      const rows = await sql`
        SELECT 
          id,
          line_user_id AS "lineUserId",
          line_display_name AS "lineDisplayName",
          line_picture_url AS "linePictureUrl",
          full_name AS "fullName",
          phone,
          id_card AS "idCard",
          quota_number AS "quotaNumber",
          user_role AS "userRole",
          points,
          created_at AS "createdAt"
        FROM farmers 
        ORDER BY created_at DESC
      `;
      return rows.map((r: any) => ({
        id: String(r.id),
        _id: String(r.id),
        lineUserId: r.lineUserId || "",
        lineDisplayName: r.lineDisplayName || r.fullName || "ไม่ระบุชื่อ LINE",
        linePictureUrl: r.linePictureUrl || "",
        fullName: r.fullName || "ไม่ระบุชื่อ",
        phone: r.phone || "-",
        idCard: r.idCard || "-",
        quotaNumber: r.quotaNumber || "-",
        userRole: r.userRole || "ชาวไร่",
        points: typeof r.points === "number" ? r.points : 0,
        createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
      }));
    } catch (err) {
      console.error("Postgres getFarmers error:", err);
    }
  }

  // Fallback CrudCrud
  try {
    const res = await fetch(CLOUD_DB_URL, { cache: "no-store" });
    if (res.ok) {
      const data: any[] = await res.json();
      return data.map((item, idx) => ({
        ...item,
        id: item._id || idx + 1,
        _id: item._id || String(idx + 1),
        lineUserId: item.lineUserId || "",
        lineDisplayName: item.lineDisplayName || item.fullName || "ไม่ระบุชื่อ LINE",
        linePictureUrl: item.linePictureUrl || "",
        fullName: item.fullName || "ไม่ระบุชื่อ",
        phone: item.phone || "-",
        idCard: item.idCard || "-",
        quotaNumber: item.quotaNumber || "-",
        userRole: item.userRole || "ชาวไร่",
        points: typeof item.points === "number" ? item.points : 0,
        createdAt: item.createdAt || new Date().toISOString(),
      })).sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    }
  } catch (err) {
    console.error("Cloud DB GET error:", err);
  }
  return [];
}

// ลงทะเบียนหรืออัปเดตข้อมูลชาวไร่ (ผ่าน LINE)
export async function registerOrUpdateFarmer(data: {
  lineUserId: string;
  lineDisplayName?: string;
  linePictureUrl?: string;
  fullName: string;
  phone: string;
  idCard?: string;
  quotaNumber?: string;
  userRole?: string;
}): Promise<{ farmer: FarmerRecord; isNew: boolean }> {
  const sql = getSql();
  if (sql) {
    try {
      await ensureTables();
      const existing = await sql`
        SELECT * FROM farmers WHERE line_user_id = ${data.lineUserId} LIMIT 1
      `;
      if (existing.length > 0) {
        // บัญชี LINE นี้เคยลงทะเบียนไปแล้ว (1 แอคเคาท์ ลงได้ 1 ครั้ง)
        const r = existing[0];
        return {
          farmer: {
            id: String(r.id),
            _id: String(r.id),
            lineUserId: r.line_user_id,
            lineDisplayName: r.line_display_name,
            linePictureUrl: r.line_picture_url,
            fullName: r.full_name,
            phone: r.phone,
            idCard: r.id_card,
            quotaNumber: r.quota_number,
            userRole: r.user_role,
            points: r.points,
            createdAt: new Date(r.created_at).toISOString(),
          },
          isNew: false,
        };
      } else {
        // สมัครใหม่ แจก 100 แต้ม
        const rows = await sql`
          INSERT INTO farmers (
            line_user_id, line_display_name, line_picture_url, full_name, phone, id_card, quota_number, user_role, points
          ) VALUES (
            ${data.lineUserId},
            ${data.lineDisplayName || "สมาชิกชาวไร่"},
            ${data.linePictureUrl || ""},
            ${data.fullName},
            ${data.phone},
            ${data.idCard || ""},
            ${data.quotaNumber || ""},
            ${data.userRole || "ชาวไร่เจ้าของโควตา"},
            100
          )
          RETURNING *
        `;
        const r = rows[0];
        return {
          farmer: {
            id: String(r.id),
            _id: String(r.id),
            lineUserId: r.line_user_id,
            lineDisplayName: r.line_display_name,
            linePictureUrl: r.line_picture_url,
            fullName: r.full_name,
            phone: r.phone,
            idCard: r.id_card,
            quotaNumber: r.quota_number,
            userRole: r.user_role,
            points: r.points,
            createdAt: new Date(r.created_at).toISOString(),
          },
          isNew: true,
        };
      }
    } catch (err) {
      console.error("Postgres registerOrUpdateFarmer error:", err);
    }
  }

  // Fallback CrudCrud
  const existingList = await getFarmers();
  const existing = existingList.find((f) => f.lineUserId === data.lineUserId);

  if (existing && existing._id) {
    return { farmer: existing, isNew: false };
  } else {
    const newRecord: any = {
      lineUserId: data.lineUserId,
      lineDisplayName: data.lineDisplayName || "สมาชิกชาวไร่",
      linePictureUrl: data.linePictureUrl || "",
      fullName: data.fullName,
      phone: data.phone,
      idCard: data.idCard || "",
      quotaNumber: data.quotaNumber || "",
      userRole: data.userRole || "ชาวไร่เจ้าของโควตา",
      points: 100,
      createdAt: new Date().toISOString(),
    };

    try {
      const res = await fetch(CLOUD_DB_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newRecord),
      });
      if (res.ok) {
        const saved = await res.json();
        return { farmer: { ...saved, id: saved._id }, isNew: true };
      }
    } catch (err) {
      console.error("Cloud DB POST error:", err);
    }

    return { farmer: { ...newRecord, id: "temp_" + Date.now() }, isNew: true };
  }
}

// เพิ่มแต้มสะสม
export async function addFarmerPoints(lineUserId: string, points: number): Promise<{
  success: boolean;
  previousPoints: number;
  totalPoints: number;
  farmer?: FarmerRecord;
}> {
  const sql = getSql();
  if (sql) {
    try {
      await ensureTables();
      const current = await sql`SELECT * FROM farmers WHERE line_user_id = ${lineUserId} LIMIT 1`;
      if (current.length === 0) {
        return { success: false, previousPoints: 0, totalPoints: 0 };
      }
      const prev = current[0].points || 0;
      const newTotal = prev + points;
      const rows = await sql`
        UPDATE farmers SET points = ${newTotal} WHERE line_user_id = ${lineUserId} RETURNING *
      `;
      const r = rows[0];
      return {
        success: true,
        previousPoints: prev,
        totalPoints: newTotal,
        farmer: {
          id: String(r.id),
          _id: String(r.id),
          lineUserId: r.line_user_id,
          lineDisplayName: r.line_display_name,
          linePictureUrl: r.line_picture_url,
          fullName: r.full_name,
          phone: r.phone,
          idCard: r.id_card,
          quotaNumber: r.quota_number,
          userRole: r.user_role,
          points: r.points,
          createdAt: new Date(r.created_at).toISOString(),
        },
      };
    } catch (err) {
      console.error("Postgres addFarmerPoints error:", err);
    }
  }

  // Fallback CrudCrud
  const existingList = await getFarmers();
  const farmer = existingList.find((f) => f.lineUserId === lineUserId);

  if (!farmer || !farmer._id) {
    return { success: false, previousPoints: 0, totalPoints: 0 };
  }

  const prev = farmer.points || 0;
  const newTotal = prev + points;

  const updatedRecord: any = {
    lineUserId: farmer.lineUserId,
    lineDisplayName: farmer.lineDisplayName,
    linePictureUrl: farmer.linePictureUrl,
    fullName: farmer.fullName,
    phone: farmer.phone,
    idCard: farmer.idCard,
    quotaNumber: farmer.quotaNumber,
    userRole: farmer.userRole,
    points: newTotal,
    createdAt: farmer.createdAt,
  };

  try {
    await fetch(`${CLOUD_DB_URL}/${farmer._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updatedRecord),
    });
  } catch (err) {
    console.error("Cloud DB Points PUT error:", err);
  }

  return {
    success: true,
    previousPoints: prev,
    totalPoints: newTotal,
    farmer: { ...updatedRecord, _id: farmer._id, id: farmer._id },
  };
}

// แอดมินสร้างชาวไร่/ผู้ใช้ใหม่
export async function createFarmer(data: {
  fullName: string;
  phone: string;
  lineDisplayName?: string;
  lineUserId?: string;
  linePictureUrl?: string;
  quotaNumber?: string;
  userRole?: string;
  idCard?: string;
  points?: number;
}): Promise<FarmerRecord> {
  const sql = getSql();
  if (sql) {
    try {
      await ensureTables();
      const lineId = data.lineUserId || "U_ADMIN_" + Date.now();
      const rows = await sql`
        INSERT INTO farmers (
          line_user_id, line_display_name, line_picture_url, full_name, phone, id_card, quota_number, user_role, points
        ) VALUES (
          ${lineId},
          ${data.lineDisplayName || data.fullName},
          ${data.linePictureUrl || ""},
          ${data.fullName},
          ${data.phone},
          ${data.idCard || ""},
          ${data.quotaNumber || ""},
          ${data.userRole || "ชาวไร่"},
          ${typeof data.points === "number" ? data.points : 100}
        )
        RETURNING *
      `;
      const r = rows[0];
      return {
        id: String(r.id),
        _id: String(r.id),
        lineUserId: r.line_user_id,
        lineDisplayName: r.line_display_name,
        linePictureUrl: r.line_picture_url,
        fullName: r.full_name,
        phone: r.phone,
        idCard: r.id_card,
        quotaNumber: r.quota_number,
        userRole: r.user_role,
        points: r.points,
        createdAt: new Date(r.created_at).toISOString(),
      };
    } catch (err) {
      console.error("Postgres createFarmer error:", err);
    }
  }

  // Fallback CrudCrud
  const newRecord: any = {
    lineUserId: data.lineUserId || "U_ADMIN_" + Date.now(),
    lineDisplayName: data.lineDisplayName || data.fullName,
    linePictureUrl: data.linePictureUrl || "",
    fullName: data.fullName,
    phone: data.phone,
    idCard: data.idCard || "",
    quotaNumber: data.quotaNumber || "",
    userRole: data.userRole || "ชาวไร่",
    points: typeof data.points === "number" ? data.points : 100,
    createdAt: new Date().toISOString(),
  };

  try {
    const res = await fetch(CLOUD_DB_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newRecord),
    });
    if (res.ok) {
      const saved = await res.json();
      return { ...saved, id: saved._id };
    }
  } catch (err) {
    console.error("Cloud DB createFarmer error:", err);
  }

  return { ...newRecord, id: "temp_" + Date.now() };
}

// แอดมินแก้ไขข้อมูลชาวไร่/ผู้ใช้
export async function updateFarmer(
  idOrKey: string,
  data: Partial<FarmerRecord>
): Promise<{ success: boolean; farmer?: FarmerRecord }> {
  const sql = getSql();
  if (sql) {
    try {
      await ensureTables();
      const isNum = !isNaN(Number(idOrKey));
      const rows = await sql`
        UPDATE farmers SET
          full_name = COALESCE(${data.fullName ?? null}, full_name),
          phone = COALESCE(${data.phone ?? null}, phone),
          line_display_name = COALESCE(${data.lineDisplayName ?? null}, line_display_name),
          line_picture_url = COALESCE(${data.linePictureUrl ?? null}, line_picture_url),
          id_card = COALESCE(${data.idCard ?? null}, id_card),
          quota_number = COALESCE(${data.quotaNumber ?? null}, quota_number),
          user_role = COALESCE(${data.userRole ?? null}, user_role),
          points = COALESCE(${typeof data.points === "number" ? data.points : null}, points)
        WHERE (id = ${isNum ? Number(idOrKey) : -1} OR line_user_id = ${idOrKey})
        RETURNING *
      `;
      if (rows.length > 0) {
        const r = rows[0];
        return {
          success: true,
          farmer: {
            id: String(r.id),
            _id: String(r.id),
            lineUserId: r.line_user_id,
            lineDisplayName: r.line_display_name,
            linePictureUrl: r.line_picture_url,
            fullName: r.full_name,
            phone: r.phone,
            idCard: r.id_card,
            quotaNumber: r.quota_number,
            userRole: r.user_role,
            points: r.points,
            createdAt: new Date(r.created_at).toISOString(),
          },
        };
      }
    } catch (err) {
      console.error("Postgres updateFarmer error:", err);
    }
  }

  // Fallback CrudCrud
  const existingList = await getFarmers();
  const target = existingList.find(
    (f) => String(f._id) === idOrKey || String(f.id) === idOrKey || f.lineUserId === idOrKey
  );

  if (!target || !target._id) {
    return { success: false };
  }

  const updatedRecord: any = {
    lineUserId: data.lineUserId !== undefined ? data.lineUserId : target.lineUserId,
    lineDisplayName: data.lineDisplayName !== undefined ? data.lineDisplayName : target.lineDisplayName,
    linePictureUrl: data.linePictureUrl !== undefined ? data.linePictureUrl : target.linePictureUrl,
    fullName: data.fullName !== undefined ? data.fullName : target.fullName,
    phone: data.phone !== undefined ? data.phone : target.phone,
    idCard: data.idCard !== undefined ? data.idCard : target.idCard,
    quotaNumber: data.quotaNumber !== undefined ? data.quotaNumber : target.quotaNumber,
    userRole: data.userRole !== undefined ? data.userRole : target.userRole,
    points: typeof data.points === "number" ? data.points : target.points,
    createdAt: target.createdAt || new Date().toISOString(),
  };

  try {
    const res = await fetch(`${CLOUD_DB_URL}/${target._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updatedRecord),
    });
    if (!res.ok) {
      console.error("Cloud DB updateFarmer failed:", res.status);
    }
  } catch (err) {
    console.error("Cloud DB updateFarmer error:", err);
  }

  return {
    success: true,
    farmer: { ...updatedRecord, _id: target._id, id: target._id },
  };
}

// แอดมินลบชาวไร่/ผู้ใช้
export async function deleteFarmer(idOrKey: string): Promise<boolean> {
  const sql = getSql();
  if (sql) {
    try {
      await ensureTables();
      const isNum = !isNaN(Number(idOrKey));
      await sql`
        DELETE FROM farmers WHERE id = ${isNum ? Number(idOrKey) : -1} OR line_user_id = ${idOrKey}
      `;
      return true;
    } catch (err) {
      console.error("Postgres deleteFarmer error:", err);
    }
  }

  // Fallback CrudCrud
  const existingList = await getFarmers();
  const target = existingList.find(
    (f) => String(f._id) === idOrKey || String(f.id) === idOrKey || f.lineUserId === idOrKey
  );

  if (!target || !target._id) {
    return false;
  }

  try {
    const res = await fetch(`${CLOUD_DB_URL}/${target._id}`, {
      method: "DELETE",
    });
    return res.ok;
  } catch (err) {
    console.error("Cloud DB deleteFarmer error:", err);
    return false;
  }
}

// ============================== TICKETS FUNCTIONS ==============================

// บันทึกตั๋วชั่งใหม่
export async function createTicket(ticket: {
  ticketNo: string;
  token: string;
  lineUserId: string;
  farmerName: string;
  weightTons: number;
  points: number;
}): Promise<TicketRecord> {
  const sql = getSql();
  if (sql) {
    try {
      await ensureTables();
      const rows = await sql`
        INSERT INTO tickets (
          ticket_no, token, line_user_id, farmer_name, weight_tons, points, is_claimed, claimed_time
        ) VALUES (
          ${ticket.ticketNo},
          ${ticket.token},
          ${ticket.lineUserId},
          ${ticket.farmerName},
          ${ticket.weightTons},
          ${ticket.points},
          FALSE,
          NULL
        )
        RETURNING *
      `;
      const r = rows[0];
      return {
        _id: String(r.id),
        ticketNo: r.ticket_no,
        token: r.token,
        lineUserId: r.line_user_id,
        farmerName: r.farmer_name,
        weightTons: Number(r.weight_tons),
        points: r.points,
        isClaimed: r.is_claimed,
        claimedTime: r.claimed_time,
        createdAt: new Date(r.created_at).toISOString(),
      };
    } catch (err) {
      console.error("Postgres createTicket error:", err);
    }
  }

  // Fallback CrudCrud
  const record: any = {
    ...ticket,
    isClaimed: false,
    claimedTime: null,
    createdAt: new Date().toISOString(),
  };

  try {
    const res = await fetch(CLOUD_TICKETS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    });
    if (res.ok) {
      const saved = await res.json();
      return saved;
    }
  } catch (err) {
    console.error("Cloud DB createTicket error:", err);
  }

  return record;
}

// ค้นหาตั๋วตาม token
export async function getTicketByToken(token: string): Promise<TicketRecord | null> {
  const sql = getSql();
  if (sql) {
    try {
      await ensureTables();
      const rows = await sql`
        SELECT * FROM tickets WHERE token = ${token} LIMIT 1
      `;
      if (rows.length > 0) {
        const r = rows[0];
        return {
          _id: String(r.id),
          ticketNo: r.ticket_no,
          token: r.token,
          lineUserId: r.line_user_id,
          farmerName: r.farmer_name,
          weightTons: Number(r.weight_tons),
          points: r.points,
          isClaimed: r.is_claimed,
          claimedTime: r.claimed_time,
          createdAt: new Date(r.created_at).toISOString(),
        };
      }
      return null;
    } catch (err) {
      console.error("Postgres getTicketByToken error:", err);
    }
  }

  // Fallback CrudCrud
  try {
    const res = await fetch(CLOUD_TICKETS_URL, { cache: "no-store" });
    if (res.ok) {
      const list: any[] = await res.json();
      const found = list.find((t) => t.token === token);
      return found || null;
    }
  } catch (err) {
    console.error("Cloud DB getTicketByToken error:", err);
  }
  return null;
}

// ดำเนินการรับแต้มสะสมจากตั๋ว
export async function claimTicket(token: string): Promise<{
  success: boolean;
  message: string;
  ticket?: TicketRecord;
  pointsAdded?: number;
  newTotal?: number;
}> {
  const ticket = await getTicketByToken(token);
  if (!ticket) {
    return { success: false, message: "ไม่พบข้อมูล QR Code นี้ในระบบ" };
  }

  if (ticket.isClaimed) {
    return {
      success: false,
      message: "QR Code นี้ถูกใช้งานไปแล้ว ไม่สามารถสแกนซ้ำได้",
      ticket,
    };
  }

  // บวกแต้มให้ชาวไร่
  const pointsRes = await addFarmerPoints(ticket.lineUserId, ticket.points);

  const claimedTimeStr = new Date().toLocaleTimeString("th-TH");
  const sql = getSql();
  if (sql && ticket._id) {
    try {
      await ensureTables();
      await sql`
        UPDATE tickets SET is_claimed = TRUE, claimed_time = ${claimedTimeStr} WHERE token = ${token}
      `;
    } catch (err) {
      console.error("Postgres claimTicket update error:", err);
    }
  } else if (ticket._id) {
    const updatedTicket: any = {
      ticketNo: ticket.ticketNo,
      token: ticket.token,
      lineUserId: ticket.lineUserId,
      farmerName: ticket.farmerName,
      weightTons: ticket.weightTons,
      points: ticket.points,
      isClaimed: true,
      claimedTime: claimedTimeStr,
      createdAt: ticket.createdAt,
    };
    try {
      await fetch(`${CLOUD_TICKETS_URL}/${ticket._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedTicket),
      });
    } catch (err) {
      console.error("Cloud DB claimTicket update error:", err);
    }
  }

  return {
    success: true,
    message: "รับแต้มสะสมสำเร็จ!",
    ticket: { ...ticket, isClaimed: true, claimedTime: claimedTimeStr },
    pointsAdded: ticket.points,
    newTotal: pointsRes.totalPoints,
  };
}

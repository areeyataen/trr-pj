import { neon } from "@neondatabase/serverless";
import crypto from "crypto";

// ============================================================
// CONSTANTS (ฝั่ง Server เท่านั้น — ห้ามส่งให้ client คำนวณ)
// ============================================================
export const POINTS_PER_TON = 10; // 1 ตัน = 10 พ้อยท์
export const TICKET_EXPIRES_HOURS = 1; // ตั๋วหมดอายุใน 1 ชั่วโมง
export const DUPLICATE_WINDOW_MINUTES = 60; // กัน duplicate ภายใน 60 นาที
export const MAX_WEIGHT_TONS = 999; // น้ำหนักสูงสุดต่อตั๋ว

// ============================================================
// TYPES
// ============================================================
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

export type TicketStatus = "UNCLAIMED" | "CLAIMED" | "EXPIRED" | "VOIDED";

export interface TicketRecord {
  id?: number | string;
  _id?: string;
  ticketNo: string;
  token: string;
  lineUserId: string;
  farmerName: string;
  weightTons: number;
  plateNo?: string;
  grossKg?: number;
  tareKg?: number;
  points: number;
  status: TicketStatus;
  expiresAt: string;
  issuedBy?: string;
  claimedAt?: string | null;
  claimedBy?: string | null;
  voidedAt?: string | null;
  voidedBy?: string | null;
  voidReason?: string | null;
  createdAt: string;
  // backward compat
  isClaimed?: boolean;
  claimedTime?: string | null;
}

export interface AuditLog {
  id?: number;
  action: string;
  actorId?: string;
  targetId?: string;
  detail?: string;
  ip?: string;
  createdAt?: string;
}

// ============================================================
// DB CONNECTION
// ============================================================
const POSTGRES_URL = process.env.POSTGRES_URL || process.env.DATABASE_URL;

// Fallback CrudCrud (ยังคงไว้สำหรับ compatibility)
const FALLBACK_CRUDCRUD_ID = process.env.CRUDCRUD_API_KEY || "eaddecdea7ed49caace06fb84de2e0b7";
const CLOUD_DB_URL = `https://crudcrud.com/api/${FALLBACK_CRUDCRUD_ID}/farmers`;
const CLOUD_TICKETS_URL = `https://crudcrud.com/api/${FALLBACK_CRUDCRUD_ID}/tickets`;

function getSql() {
  if (!POSTGRES_URL) return null;
  return neon(POSTGRES_URL);
}

// ============================================================
// TABLE INIT (auto-migrate)
// ============================================================
let tableInitPromise: Promise<void> | null = null;

async function ensureTables() {
  const sql = getSql();
  if (!sql) return;

  if (!tableInitPromise) {
    tableInitPromise = (async () => {
      try {
        // farmers table
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

        // tickets table (เพิ่ม columns ใหม่)
        await sql`
          CREATE TABLE IF NOT EXISTS tickets (
            id SERIAL PRIMARY KEY,
            ticket_no TEXT UNIQUE NOT NULL,
            token TEXT UNIQUE NOT NULL,
            line_user_id TEXT NOT NULL,
            farmer_name TEXT NOT NULL,
            weight_tons NUMERIC DEFAULT 0,
            plate_no TEXT DEFAULT '',
            gross_kg NUMERIC DEFAULT 0,
            tare_kg NUMERIC DEFAULT 0,
            points INTEGER DEFAULT 0,
            status TEXT DEFAULT 'UNCLAIMED',
            expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
            issued_by TEXT DEFAULT '',
            claimed_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
            claimed_by TEXT DEFAULT NULL,
            voided_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
            voided_by TEXT DEFAULT NULL,
            void_reason TEXT DEFAULT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          );
        `;

        // Migrate old tickets (is_claimed → status) ถ้ายังมีคอลัมน์เก่า
        await sql`
          DO $$
          BEGIN
            IF EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name='tickets' AND column_name='is_claimed'
            ) THEN
              UPDATE tickets SET status = CASE WHEN is_claimed = TRUE THEN 'CLAIMED' ELSE 'UNCLAIMED' END
              WHERE status IS NULL OR status = '';
            END IF;
          EXCEPTION WHEN others THEN NULL;
          END $$;
        `;

        // Ensure all new columns exist on existing DBs
        await sql`
          ALTER TABLE tickets
            ADD COLUMN IF NOT EXISTS plate_no TEXT DEFAULT '',
            ADD COLUMN IF NOT EXISTS gross_kg NUMERIC DEFAULT 0,
            ADD COLUMN IF NOT EXISTS tare_kg NUMERIC DEFAULT 0,
            ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'UNCLAIMED',
            ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '1 hour'),
            ADD COLUMN IF NOT EXISTS issued_by TEXT DEFAULT '',
            ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
            ADD COLUMN IF NOT EXISTS claimed_by TEXT DEFAULT NULL,
            ADD COLUMN IF NOT EXISTS voided_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
            ADD COLUMN IF NOT EXISTS voided_by TEXT DEFAULT NULL,
            ADD COLUMN IF NOT EXISTS void_reason TEXT DEFAULT NULL;
        `;

        // audit_logs table
        await sql`
          CREATE TABLE IF NOT EXISTS audit_logs (
            id SERIAL PRIMARY KEY,
            action TEXT NOT NULL,
            actor_id TEXT DEFAULT '',
            target_id TEXT DEFAULT '',
            detail TEXT DEFAULT '',
            ip TEXT DEFAULT '',
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

// ============================================================
// HELPERS
// ============================================================

/** สร้าง ticketNo รูปแบบ TK-YYMMDD-XXXXX */
function generateTicketNo(): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const rand = crypto.randomBytes(3).toString("hex").toUpperCase(); // 6 hex chars
  return `TK-${yy}${mm}${dd}-${rand}`;
}

/** สร้าง secure token 128-bit (32 hex chars) */
function generateToken(): string {
  return crypto.randomBytes(16).toString("hex"); // 128-bit
}

function mapTicketRow(r: any): TicketRecord {
  const isClaimed = r.status === "CLAIMED" || r.is_claimed === true;
  return {
    id: String(r.id),
    _id: String(r.id),
    ticketNo: r.ticket_no,
    token: r.token,
    lineUserId: r.line_user_id,
    farmerName: r.farmer_name,
    weightTons: Number(r.weight_tons),
    plateNo: r.plate_no || "",
    grossKg: r.gross_kg ? Number(r.gross_kg) : undefined,
    tareKg: r.tare_kg ? Number(r.tare_kg) : undefined,
    points: r.points,
    status: (r.status as TicketStatus) || (isClaimed ? "CLAIMED" : "UNCLAIMED"),
    expiresAt: r.expires_at ? new Date(r.expires_at).toISOString() : new Date(Date.now() + 7 * 86400000).toISOString(),
    issuedBy: r.issued_by || "",
    claimedAt: r.claimed_at ? new Date(r.claimed_at).toISOString() : null,
    claimedBy: r.claimed_by || null,
    voidedAt: r.voided_at ? new Date(r.voided_at).toISOString() : null,
    voidedBy: r.voided_by || null,
    voidReason: r.void_reason || null,
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
    // backward compat
    isClaimed,
    claimedTime: r.claimed_at ? new Date(r.claimed_at).toLocaleTimeString("th-TH") : null,
  };
}

// ============================================================
// AUDIT LOG
// ============================================================
export async function writeAuditLog(log: AuditLog): Promise<void> {
  const sql = getSql();
  if (!sql) return;
  try {
    await ensureTables();
    await sql`
      INSERT INTO audit_logs (action, actor_id, target_id, detail, ip)
      VALUES (${log.action}, ${log.actorId || ""}, ${log.targetId || ""}, ${log.detail || ""}, ${log.ip || ""})
    `;
  } catch (err) {
    console.error("Audit log error:", err);
  }
}

// ============================================================
// FARMERS FUNCTIONS
// ============================================================

/** ดึงรายชื่อทั้งหมด (admin เท่านั้น) */
export async function getFarmers(): Promise<FarmerRecord[]> {
  const sql = getSql();
  if (sql) {
    try {
      await ensureTables();
      const rows = await sql`
        SELECT id, line_user_id, line_display_name, line_picture_url,
               full_name, phone, id_card, quota_number, user_role, points, created_at
        FROM farmers ORDER BY created_at DESC
      `;
      return rows.map(mapFarmerRow);
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
        lineDisplayName: item.lineDisplayName || item.fullName || "ไม่ระบุ",
        linePictureUrl: item.linePictureUrl || "",
        fullName: item.fullName || "ไม่ระบุ",
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

/** ค้นหาชาวไร่ด้วย query (ชื่อ/เบอร์/ชื่อ LINE) — คืนสูงสุด 8 รายการ */
export async function searchFarmers(q: string, limit = 8): Promise<FarmerRecord[]> {
  const sql = getSql();
  if (sql) {
    try {
      await ensureTables();
      const like = `%${q.trim()}%`;
      const rows = await sql`
        SELECT id, line_user_id, line_display_name, line_picture_url,
               full_name, phone, id_card, quota_number, user_role, points, created_at
        FROM farmers
        WHERE full_name ILIKE ${like}
           OR phone LIKE ${like}
           OR line_display_name ILIKE ${like}
        ORDER BY full_name ASC
        LIMIT ${limit}
      `;
      return rows.map(mapFarmerRow);
    } catch (err) {
      console.error("Postgres searchFarmers error:", err);
    }
  }
  // Fallback: search in all
  const all = await getFarmers();
  const lower = q.toLowerCase().trim();
  return all
    .filter(
      (f) =>
        (f.fullName || "").toLowerCase().includes(lower) ||
        (f.phone || "").includes(lower) ||
        (f.lineDisplayName || "").toLowerCase().includes(lower)
    )
    .slice(0, limit);
}

/** ค้นหาชาวไร่ด้วย lineUserId เดี่ยวๆ */
export async function getFarmerByLineUserId(lineUserId: string): Promise<FarmerRecord | null> {
  return getFarmerByIdOrLineUserId(lineUserId);
}

/** ค้นหาชาวไร่ด้วย ID หรือ lineUserId */
export async function getFarmerByIdOrLineUserId(key: string): Promise<FarmerRecord | null> {
  const sql = getSql();
  if (sql) {
    try {
      await ensureTables();
      const isNum = !isNaN(Number(key));
      const rows = await sql`
        SELECT id, line_user_id, line_display_name, line_picture_url,
               full_name, phone, id_card, quota_number, user_role, points, created_at
        FROM farmers
        WHERE line_user_id = ${key}
           OR (id = ${isNum ? Number(key) : -1})
        LIMIT 1
      `;
      if (rows.length > 0) return mapFarmerRow(rows[0]);
      return null;
    } catch (err) {
      console.error("Postgres getFarmerByIdOrLineUserId error:", err);
    }
  }
  const all = await getFarmers();
  return all.find((f) => f.lineUserId === key || String(f.id) === key || String(f._id) === key) || null;
}

function mapFarmerRow(r: any): FarmerRecord {
  return {
    id: String(r.id),
    _id: String(r.id),
    lineUserId: r.line_user_id || "",
    lineDisplayName: r.line_display_name || r.full_name || "ไม่ระบุ",
    linePictureUrl: r.line_picture_url || "",
    fullName: r.full_name || "ไม่ระบุ",
    phone: r.phone || "-",
    idCard: r.id_card || "-",
    quotaNumber: r.quota_number || "-",
    userRole: r.user_role || "ชาวไร่",
    points: typeof r.points === "number" ? r.points : 0,
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
  };
}

/** ลงทะเบียนหรืออัปเดตข้อมูลชาวไร่ (ผ่าน LINE) */
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
      const existing = await sql`SELECT * FROM farmers WHERE line_user_id = ${data.lineUserId} LIMIT 1`;
      if (existing.length > 0) {
        return { farmer: mapFarmerRow(existing[0]), isNew: false };
      }
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
          0
        ) RETURNING *
      `;
      return { farmer: mapFarmerRow(rows[0]), isNew: true };
    } catch (err) {
      console.error("Postgres registerOrUpdateFarmer error:", err);
    }
  }
  // Fallback CrudCrud
  const existingList = await getFarmers();
  const existing = existingList.find((f) => f.lineUserId === data.lineUserId);
  if (existing && existing._id) return { farmer: existing, isNew: false };
  const newRecord: any = {
    lineUserId: data.lineUserId,
    lineDisplayName: data.lineDisplayName || "สมาชิกชาวไร่",
    linePictureUrl: data.linePictureUrl || "",
    fullName: data.fullName,
    phone: data.phone,
    idCard: data.idCard || "",
    quotaNumber: data.quotaNumber || "",
    userRole: data.userRole || "ชาวไร่เจ้าของโควตา",
    points: 0,
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

/** เพิ่มแต้มสะสม */
export async function addFarmerPoints(
  lineUserId: string,
  points: number
): Promise<{ success: boolean; previousPoints: number; totalPoints: number; farmer?: FarmerRecord }> {
  const sql = getSql();
  if (sql) {
    try {
      await ensureTables();
      const rows = await sql`
        UPDATE farmers SET points = points + ${points}
        WHERE line_user_id = ${lineUserId}
        RETURNING *
      `;
      if (rows.length === 0) return { success: false, previousPoints: 0, totalPoints: 0 };
      const r = rows[0];
      return {
        success: true,
        previousPoints: r.points - points,
        totalPoints: r.points,
        farmer: mapFarmerRow(r),
      };
    } catch (err) {
      console.error("Postgres addFarmerPoints error:", err);
    }
  }
  // Fallback CrudCrud
  const existingList = await getFarmers();
  const farmer = existingList.find((f) => f.lineUserId === lineUserId);
  if (!farmer || !farmer._id) return { success: false, previousPoints: 0, totalPoints: 0 };
  const prev = farmer.points || 0;
  const newTotal = prev + points;
  const updatedRecord: any = { ...farmer, points: newTotal };
  try {
    await fetch(`${CLOUD_DB_URL}/${farmer._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updatedRecord),
    });
  } catch (err) {
    console.error("Cloud DB Points PUT error:", err);
  }
  return { success: true, previousPoints: prev, totalPoints: newTotal, farmer: { ...updatedRecord, _id: farmer._id, id: farmer._id } };
}

/** แอดมินสร้างชาวไร่/ผู้ใช้ใหม่ */
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
          ${lineId}, ${data.lineDisplayName || data.fullName}, ${data.linePictureUrl || ""},
          ${data.fullName}, ${data.phone}, ${data.idCard || ""},
          ${data.quotaNumber || ""}, ${data.userRole || "ชาวไร่"},
          ${typeof data.points === "number" ? data.points : 0}
        ) RETURNING *
      `;
      return mapFarmerRow(rows[0]);
    } catch (err) {
      console.error("Postgres createFarmer error:", err);
      throw err;
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
    points: typeof data.points === "number" ? data.points : 0,
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

/** แอดมินแก้ไขข้อมูลชาวไร่/ผู้ใช้ */
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
      if (rows.length > 0) return { success: true, farmer: mapFarmerRow(rows[0]) };
      return { success: false };
    } catch (err) {
      console.error("Postgres updateFarmer error:", err);
    }
  }
  // Fallback CrudCrud
  const existingList = await getFarmers();
  const target = existingList.find(
    (f) => String(f._id) === idOrKey || String(f.id) === idOrKey || f.lineUserId === idOrKey
  );
  if (!target || !target._id) return { success: false };
  const updatedRecord: any = {
    ...target,
    fullName: data.fullName !== undefined ? data.fullName : target.fullName,
    phone: data.phone !== undefined ? data.phone : target.phone,
    points: typeof data.points === "number" ? data.points : target.points,
  };
  try {
    await fetch(`${CLOUD_DB_URL}/${target._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updatedRecord),
    });
  } catch (err) {
    console.error("Cloud DB updateFarmer error:", err);
  }
  return { success: true, farmer: { ...updatedRecord, _id: target._id, id: target._id } };
}

/** แอดมินลบชาวไร่/ผู้ใช้ */
export async function deleteFarmer(idOrKey: string): Promise<boolean> {
  const sql = getSql();
  if (sql) {
    try {
      await ensureTables();
      const isNum = !isNaN(Number(idOrKey));
      await sql`DELETE FROM farmers WHERE id = ${isNum ? Number(idOrKey) : -1} OR line_user_id = ${idOrKey}`;
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
  if (!target || !target._id) return false;
  try {
    const res = await fetch(`${CLOUD_DB_URL}/${target._id}`, { method: "DELETE" });
    return res.ok;
  } catch (err) {
    console.error("Cloud DB deleteFarmer error:", err);
    return false;
  }
}

// ============================================================
// TICKETS FUNCTIONS
// ============================================================

/** สร้างตั๋วใหม่ — เซิร์ฟเวอร์คำนวณทุกอย่าง */
export async function createTicketSecure(params: {
  farmerId: string;      // DB id ของชาวไร่
  lineUserId: string;    // ยืนยันจาก DB ไม่ใช่จาก client
  farmerName: string;
  weightTons: number;
  plateNo: string;
  grossKg?: number;
  tareKg?: number;
  issuedBy?: string;
}): Promise<{ ticket: TicketRecord; isNew: boolean; duplicateWarning?: string }> {
  const sql = getSql();

  // คำนวณ points ฝั่ง server เท่านั้น
  const points = Math.round(params.weightTons * POINTS_PER_TON);
  const ticketNo = generateTicketNo();
  const token = generateToken();
  const expiresAt = new Date(Date.now() + TICKET_EXPIRES_HOURS * 3600 * 1000);

  if (sql) {
    await ensureTables();

    // ตรวจสอบ Duplicate: ทะเบียน+ชาวไร่+น้ำหนักเท่ากัน ภายใน DUPLICATE_WINDOW_MINUTES นาที
    const cutoffTime = new Date(Date.now() - DUPLICATE_WINDOW_MINUTES * 60 * 1000).toISOString();
    const dupCheck = await sql`
      SELECT id, ticket_no FROM tickets
      WHERE line_user_id = ${params.lineUserId}
        AND plate_no = ${params.plateNo}
        AND weight_tons = ${params.weightTons}
        AND status = 'UNCLAIMED'
        AND created_at > ${cutoffTime}
      LIMIT 1
    `;
    if (dupCheck.length > 0) {
      throw new Error(
        `ตั๋วซ้ำ: ทะเบียน ${params.plateNo} ชาวไร่คนนี้ น้ำหนัก ${params.weightTons} ตัน ถูกออกไปแล้วภายใน ${DUPLICATE_WINDOW_MINUTES} นาที (ตั๋วเลขที่ ${dupCheck[0].ticket_no})`
      );
    }

    const rows = await sql`
      INSERT INTO tickets (
        ticket_no, token, line_user_id, farmer_name,
        weight_tons, plate_no, gross_kg, tare_kg,
        points, status, expires_at, issued_by
      ) VALUES (
        ${ticketNo}, ${token}, ${params.lineUserId}, ${params.farmerName},
        ${params.weightTons}, ${params.plateNo}, ${params.grossKg ?? 0}, ${params.tareKg ?? 0},
        ${points}, 'UNCLAIMED', ${expiresAt.toISOString()}, ${params.issuedBy || "admin"}
      ) RETURNING *
    `;

    await writeAuditLog({
      action: "TICKET_CREATE",
      actorId: params.issuedBy || "admin",
      targetId: rows[0].ticket_no,
      detail: `ออกตั๋ว ${ticketNo} ชาวไร่ ${params.farmerName} น้ำหนัก ${params.weightTons} ตัน = ${points} pts`,
    });

    return { ticket: mapTicketRow(rows[0]), isNew: true };
  }

  // Fallback CrudCrud (ไม่ตรวจ duplicate เพราะไม่ safe พอ)
  const record: any = {
    ticketNo, token,
    lineUserId: params.lineUserId,
    farmerName: params.farmerName,
    weightTons: params.weightTons,
    plateNo: params.plateNo,
    grossKg: params.grossKg ?? 0,
    tareKg: params.tareKg ?? 0,
    points,
    status: "UNCLAIMED",
    expiresAt: expiresAt.toISOString(),
    issuedBy: params.issuedBy || "admin",
    isClaimed: false,
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
      return { ticket: { ...record, _id: saved._id, id: saved._id }, isNew: true };
    }
  } catch (err) {
    console.error("Cloud DB createTicket error:", err);
  }
  return { ticket: { ...record, _id: "tmp_" + Date.now() }, isNew: true };
}

/** Backward compat: สร้างตั๋วแบบเก่า (ใช้ค่าที่ส่งมา) */
export async function createTicket(ticket: {
  ticketNo: string;
  token: string;
  lineUserId: string;
  farmerName: string;
  weightTons: number;
  points: number;
}): Promise<TicketRecord> {
  const sql = getSql();
  const expiresAt = new Date(Date.now() + TICKET_EXPIRES_HOURS * 3600 * 1000);
  if (sql) {
    try {
      await ensureTables();
      const rows = await sql`
        INSERT INTO tickets (
          ticket_no, token, line_user_id, farmer_name, weight_tons, points,
          status, expires_at, plate_no
        ) VALUES (
          ${ticket.ticketNo}, ${ticket.token}, ${ticket.lineUserId}, ${ticket.farmerName},
          ${ticket.weightTons}, ${ticket.points}, 'UNCLAIMED', ${expiresAt.toISOString()}, ''
        ) RETURNING *
      `;
      return mapTicketRow(rows[0]);
    } catch (err) {
      console.error("Postgres createTicket error:", err);
      throw err;
    }
  }
  const record: any = { ...ticket, isClaimed: false, status: "UNCLAIMED", createdAt: new Date().toISOString(), expiresAt: expiresAt.toISOString() };
  try {
    const res = await fetch(CLOUD_TICKETS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    });
    if (res.ok) return await res.json();
  } catch {}
  return record;
}

/** ค้นหาตั๋วตาม token */
export async function getTicketByToken(token: string): Promise<TicketRecord | null> {
  const sql = getSql();
  if (sql) {
    try {
      await ensureTables();
      const rows = await sql`SELECT * FROM tickets WHERE token = ${token} LIMIT 1`;
      if (rows.length > 0) return mapTicketRow(rows[0]);
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
      return found ? mapTicketRow(found) : null;
    }
  } catch (err) {
    console.error("Cloud DB getTicketByToken error:", err);
  }
  return null;
}

/** Atomic Claim — ใช้ UPDATE WHERE status='UNCLAIMED' เพื่อกัน race condition */
export async function claimTicketAtomic(
  token: string,
  claimerLineUserId: string,
  ip?: string
): Promise<{
  success: boolean;
  message: string;
  ticket?: TicketRecord;
  pointsAdded?: number;
  newTotal?: number;
}> {
  const sql = getSql();

  // ก่อนอื่น ดึงข้อมูลตั๋ว
  const ticket = await getTicketByToken(token);
  if (!ticket) {
    return { success: false, message: "ไม่พบข้อมูล QR Code นี้ในระบบ" };
  }

  // ตรวจสถานะ
  if (ticket.status === "CLAIMED" || ticket.isClaimed) {
    return { success: false, message: "QR Code นี้ถูกใช้งานไปแล้ว ไม่สามารถสแกนซ้ำได้", ticket };
  }
  if (ticket.status === "EXPIRED") {
    return { success: false, message: "QR Code นี้หมดอายุแล้ว ไม่สามารถใช้งานได้", ticket };
  }
  if (ticket.status === "VOIDED") {
    return { success: false, message: "QR Code นี้ถูกยกเลิก (Voided) แล้ว ไม่สามารถใช้งานได้", ticket };
  }

  // ตรวจวันหมดอายุ
  if (ticket.expiresAt && new Date(ticket.expiresAt) < new Date()) {
    // Auto-expire
    if (sql) {
      await sql`UPDATE tickets SET status = 'EXPIRED' WHERE token = ${token} AND status = 'UNCLAIMED'`;
    }
    return { success: false, message: "QR Code นี้หมดอายุแล้ว", ticket };
  }

  // 1. ตรวจสอบว่าผู้ที่สแกนรับแต้มเป็นสมาชิกที่ลงทะเบียนในระบบแล้วหรือไม่
  const claimer = await getFarmerByLineUserId(claimerLineUserId);
  if (!claimer) {
    return {
      success: false,
      message: "ท่านยังไม่ได้ลงทะเบียนสมาชิกในระบบ กรุณากดลงทะเบียนก่อนรับแต้มครับ",
      ticket,
    };
  }

  // 2. ตรวจสอบความเป็นเจ้าของตั๋ว: บัญชี LINE ของผู้สแกน ต้องตรงกับเจ้าของตั๋วที่ออกให้เท่านั้น
  if (ticket.lineUserId && ticket.lineUserId !== claimerLineUserId) {
    await writeAuditLog({
      action: "CLAIM_OWNERSHIP_MISMATCH",
      actorId: claimerLineUserId,
      targetId: ticket.ticketNo,
      detail: `ผู้ใช้ ${claimer.fullName} (${claimerLineUserId}) พยายามสแกนตั๋วของ ${ticket.farmerName} (${ticket.lineUserId})`,
      ip,
    });
    return {
      success: false,
      message: `ตั๋วนี้ออกให้คุณ "${ticket.farmerName}" บัญชี LINE ของท่านไม่ตรงกับเจ้าของตั๋ว จึงไม่สามารถรับแต้มได้`,
      ticket,
    };
  }

  if (sql) {
    // Atomic UPDATE: อัปเดตสถานะ UNCLAIMED→CLAIMED ในคำสั่งเดียว
    // ถ้ามีคนอื่น claim ก่อนหน้าพร้อมกัน rows จะเป็น 0
    const claimedRows = await sql`
      UPDATE tickets
      SET status = 'CLAIMED',
          claimed_at = NOW(),
          claimed_by = ${claimerLineUserId}
      WHERE token = ${token}
        AND status = 'UNCLAIMED'
      RETURNING *
    `;

    if (claimedRows.length === 0) {
      // คนอื่น claim ก่อนแล้ว (race condition)
      return { success: false, message: "QR Code นี้ถูกใช้งานไปแล้ว (ถูก claim พร้อมกัน)", ticket };
    }

    // บวกแต้มให้เจ้าของตั๋วตัวจริง
    const pointsRes = await addFarmerPoints(ticket.lineUserId, ticket.points);

    await writeAuditLog({
      action: "TICKET_CLAIMED",
      actorId: claimerLineUserId,
      targetId: ticket.ticketNo,
      detail: `เจ้าของตั๋ว ${claimer.fullName} (${claimerLineUserId}) สแกนรับแต้ม ${ticket.points} pts จากตั๋ว ${ticket.ticketNo} สำเร็จ ยอดรวมล่าสุด ${pointsRes.totalPoints} pts`,
      ip,
    });

    return {
      success: true,
      message: "รับแต้มสะสมสำเร็จ!",
      ticket: mapTicketRow(claimedRows[0]),
      pointsAdded: ticket.points,
      newTotal: pointsRes.totalPoints,
    };
  }

  // Fallback CrudCrud: บวกแต้มให้เจ้าของตั๋วตัวจริง
  const pointsRes = await addFarmerPoints(ticket.lineUserId, ticket.points);
  const record: any = {
    ...ticket,
    status: "CLAIMED",
    isClaimed: true,
    claimedAt: new Date().toISOString(),
    claimedBy: claimerLineUserId,
  };
  try {
    await fetch(`${CLOUD_TICKETS_URL}/${ticket._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    });
  } catch {}
  return { success: true, message: "รับแต้มสะสมสำเร็จ!", ticket: record, pointsAdded: ticket.points, newTotal: pointsRes.totalPoints };
}

/** Backward compat claimTicket */
export async function claimTicket(token: string): Promise<{
  success: boolean;
  message: string;
  ticket?: TicketRecord;
  pointsAdded?: number;
  newTotal?: number;
}> {
  // เรียก atomic แต่ไม่ตรวจ ownership (backward compat เท่านั้น)
  const ticket = await getTicketByToken(token);
  if (!ticket) return { success: false, message: "ไม่พบข้อมูล QR Code นี้ในระบบ" };
  return claimTicketAtomic(token, ticket.lineUserId || "");
}

/** ยกเลิกตั๋ว (Void) — เฉพาะ UNCLAIMED */
export async function voidTicket(
  ticketId: string,
  voidedBy: string,
  reason: string
): Promise<{ success: boolean; message: string; ticket?: TicketRecord }> {
  const sql = getSql();
  if (!sql) return { success: false, message: "ไม่พบการเชื่อมต่อฐานข้อมูล" };

  await ensureTables();
  const rows = await sql`
    UPDATE tickets
    SET status = 'VOIDED',
        voided_at = NOW(),
        voided_by = ${voidedBy},
        void_reason = ${reason}
    WHERE id = ${Number(ticketId)}
      AND status = 'UNCLAIMED'
    RETURNING *
  `;

  if (rows.length === 0) {
    return { success: false, message: "ไม่พบตั๋ว หรือตั๋วนี้ไม่สามารถยกเลิกได้ (อาจถูก claim หรือ void ไปแล้ว)" };
  }

  await writeAuditLog({
    action: "TICKET_VOIDED",
    actorId: voidedBy,
    targetId: rows[0].ticket_no,
    detail: `เหตุผล: ${reason}`,
  });

  return { success: true, message: "ยกเลิกตั๋วเรียบร้อยแล้ว", ticket: mapTicketRow(rows[0]) };
}

/** Expire tickets ที่เลย expiresAt — ใช้ใน Vercel Cron */
export async function expireOverdueTickets(): Promise<{ expiredCount: number }> {
  const sql = getSql();
  if (!sql) return { expiredCount: 0 };
  await ensureTables();
  const rows = await sql`
    UPDATE tickets
    SET status = 'EXPIRED'
    WHERE status = 'UNCLAIMED'
      AND expires_at < NOW()
    RETURNING ticket_no
  `;
  if (rows.length > 0) {
    await writeAuditLog({
      action: "TICKETS_EXPIRED_CRON",
      detail: `Expired ${rows.length} tickets: ${rows.map((r: any) => r.ticket_no).join(", ")}`,
    });
  }
  return { expiredCount: rows.length };
}

/** สรุปรายวัน — ใช้ใน Admin Report */
export async function getDailyReport(dateStr?: string): Promise<{
  date: string;
  totalTickets: number;
  claimedTickets: number;
  unclaimedTickets: number;
  expiredTickets: number;
  voidedTickets: number;
  totalPointsIssued: number;
  totalPointsClaimed: number;
  byStaff: { issuedBy: string; count: number; points: number }[];
}> {
  const sql = getSql();
  const targetDate = dateStr || new Date().toISOString().slice(0, 10);

  if (!sql) {
    return {
      date: targetDate,
      totalTickets: 0, claimedTickets: 0, unclaimedTickets: 0,
      expiredTickets: 0, voidedTickets: 0,
      totalPointsIssued: 0, totalPointsClaimed: 0,
      byStaff: [],
    };
  }

  await ensureTables();

  const rows = await sql`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE status = 'CLAIMED') AS claimed,
      COUNT(*) FILTER (WHERE status = 'UNCLAIMED') AS unclaimed,
      COUNT(*) FILTER (WHERE status = 'EXPIRED') AS expired,
      COUNT(*) FILTER (WHERE status = 'VOIDED') AS voided,
      COALESCE(SUM(points), 0) AS total_points_issued,
      COALESCE(SUM(points) FILTER (WHERE status = 'CLAIMED'), 0) AS total_points_claimed
    FROM tickets
    WHERE DATE(created_at AT TIME ZONE 'Asia/Bangkok') = ${targetDate}
  `;

  const byStaffRows = await sql`
    SELECT issued_by, COUNT(*) AS cnt, COALESCE(SUM(points), 0) AS pts
    FROM tickets
    WHERE DATE(created_at AT TIME ZONE 'Asia/Bangkok') = ${targetDate}
    GROUP BY issued_by
    ORDER BY cnt DESC
  `;

  const r = rows[0];
  return {
    date: targetDate,
    totalTickets: Number(r.total),
    claimedTickets: Number(r.claimed),
    unclaimedTickets: Number(r.unclaimed),
    expiredTickets: Number(r.expired),
    voidedTickets: Number(r.voided),
    totalPointsIssued: Number(r.total_points_issued),
    totalPointsClaimed: Number(r.total_points_claimed),
    byStaff: byStaffRows.map((s: any) => ({
      issuedBy: s.issued_by,
      count: Number(s.cnt),
      points: Number(s.pts),
    })),
  };
}

"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface Ticket {
  id: string;
  ticketNo: string;
  token: string;
  farmerName: string;
  lineUserId: string;
  weightTons: number;
  plateNo?: string;
  grossKg?: number;
  tareKg?: number;
  points: number;
  status: "UNCLAIMED" | "CLAIMED" | "EXPIRED" | "VOIDED";
  expiresAt: string;
  issuedBy?: string;
  claimedAt?: string | null;
  claimedBy?: string | null;
  createdAt: string;
}

export default function TicketHistoryPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Preset Filters
  const setQuickRange = (preset: "today" | "7days" | "thisMonth" | "thisYear" | "all") => {
    const now = new Date();
    const toYMD = (d: Date) => d.toISOString().slice(0, 10);

    if (preset === "today") {
      const todayStr = toYMD(now);
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === "7days") {
      const past = new Date(now.getTime() - 6 * 86400 * 1000);
      setStartDate(toYMD(past));
      setEndDate(toYMD(now));
    } else if (preset === "thisMonth") {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setStartDate(toYMD(firstDay));
      setEndDate(toYMD(lastDay));
    } else if (preset === "thisYear") {
      const firstDay = new Date(now.getFullYear(), 0, 1);
      const lastDay = new Date(now.getFullYear(), 11, 31);
      setStartDate(toYMD(firstDay));
      setEndDate(toYMD(lastDay));
    } else {
      setStartDate("");
      setEndDate("");
    }
  };

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (statusFilter && statusFilter !== "ALL") params.set("status", statusFilter);
      if (search.trim()) params.set("search", search.trim());
      params.set("t", String(Date.now()));

      const res = await fetch(`/api/admin/tickets?${params.toString()}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setTickets(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error("Fetch tickets error:", err);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, statusFilter, search]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  // สรุปยอดตามข้อมูลที่กรอง
  const stats = useMemo(() => {
    const totalCount = tickets.length;
    const totalTons = tickets.reduce((s, t) => s + (Number(t.weightTons) || 0), 0);
    const totalPoints = tickets.reduce((s, t) => s + (Number(t.points) || 0), 0);
    const claimedCount = tickets.filter((t) => t.status === "CLAIMED").length;
    const unclaimedCount = tickets.filter((t) => t.status === "UNCLAIMED").length;
    const expiredCount = tickets.filter((t) => t.status === "EXPIRED").length;
    const voidedCount = tickets.filter((t) => t.status === "VOIDED").length;

    return {
      totalCount,
      totalTons,
      totalPoints,
      claimedCount,
      unclaimedCount,
      expiredCount,
      voidedCount,
    };
  }, [tickets]);

  // ส่งออกไฟล์ CSV (Excel UTF-8 with BOM)
  const exportToExcel = () => {
    if (tickets.length === 0) {
      alert("ไม่มีข้อมูลสำหรับส่งออก");
      return;
    }

    const headers = [
      "ลำดับ",
      "เลขที่ตั๋ว",
      "วันที่-เวลาออกตั๋ว",
      "ชื่อชาวไร่",
      "ทะเบียนรถ",
      "น้ำหนักรวม (กก.)",
      "น้ำหนักรถเปล่า (กก.)",
      "น้ำหนักอ้อยสุทธิ (ตัน)",
      "พ้อยท์ที่ได้รับ",
      "สถานะ",
      "วันเวลาที่รับแต้ม",
      "ผู้ออกตั๋ว",
    ];

    const getStatusText = (st: string) => {
      switch (st) {
        case "CLAIMED":
          return "รับแต้มแล้ว";
        case "UNCLAIMED":
          return "ยังไม่ได้รับ";
        case "EXPIRED":
          return "หมดอายุ";
        case "VOIDED":
          return "ยกเลิก";
        default:
          return st;
      }
    };

    const rows = tickets.map((t, index) => [
      index + 1,
      `"${t.ticketNo}"`,
      `"${new Date(t.createdAt).toLocaleString("th-TH")}"`,
      `"${t.farmerName || ""}"`,
      `"${t.plateNo || "-"}"`,
      t.grossKg ?? "-",
      t.tareKg ?? "-",
      t.weightTons,
      t.points,
      `"${getStatusText(t.status)}"`,
      t.claimedAt ? `"${new Date(t.claimedAt).toLocaleString("th-TH")}"` : `"-"`,
      `"${t.issuedBy || "admin"}"`,
    ]);

    // BOM เพื่อให้ Excel รองรับภาษาไทยสมบูรณ์
    const csvContent =
      "\uFEFF" +
      headers.join(",") +
      "\n" +
      rows.map((row) => row.join(",")).join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const filenameDate = startDate && endDate ? `${startDate}_to_${endDate}` : new Date().toISOString().slice(0, 10);
    link.setAttribute("href", url);
    link.setAttribute("download", `รายงานตั๋วชั่งอ้อย_${filenameDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* แถบหัวกระดาษ */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <Link href="/" className="text-xs text-emerald-600 font-bold hover:underline mb-1 inline-block">
              ← กลับหน้าหลัก
            </Link>
            <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
              📊 ประวัติตั๋วชั่งอ้อย & ส่งออกข้อมูล
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              จัดเก็บใน Cloud Database ถาวร · สามารถเลือกช่วงวัน/เดือน/ปี และดาวน์โหลดเป็น Excel ได้
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={exportToExcel}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow transition flex items-center gap-2 active:scale-95"
            >
              <span>📥</span>
              <span>ส่งออก Excel (CSV)</span>
            </button>
            <button
              onClick={fetchTickets}
              className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition flex items-center gap-1 active:scale-95"
            >
              <span>🔄</span>
              <span>รีเฟรช</span>
            </button>
          </div>
        </div>

        {/* ตัวกรอง วัน / เดือน / ปี และสถานะ */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-4">
          {/* ปุ่มด่วน */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-500 mr-1">ช่วงเวลาด่วน:</span>
            {[
              { id: "today", label: "วันนี้" },
              { id: "7days", label: "7 วันล่าสุด" },
              { id: "thisMonth", label: "เดือนนี้" },
              { id: "thisYear", label: "ปีนี้" },
              { id: "all", label: "ทั้งหมด" },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setQuickRange(p.id as any)}
                className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 hover:bg-emerald-50 hover:border-emerald-300 text-slate-700 transition"
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* ฟอร์มกรองวันที่ + สถานะ + ค้นหา */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t border-slate-100">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">ตั้งแต่วันที่:</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full border rounded-xl p-2 text-xs border-slate-200 text-slate-700 focus:outline-emerald-500 bg-slate-50"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">ถึงวันที่:</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full border rounded-xl p-2 text-xs border-slate-200 text-slate-700 focus:outline-emerald-500 bg-slate-50"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">สถานะตั๋ว:</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full border rounded-xl p-2 text-xs border-slate-200 text-slate-700 focus:outline-emerald-500 bg-slate-50 font-bold"
              >
                <option value="ALL">ทั้งหมดทุกสถานะ</option>
                <option value="CLAIMED">✓ รับแต้มแล้ว (CLAIMED)</option>
                <option value="UNCLAIMED">⏳ ยังไม่ได้รับ (UNCLAIMED)</option>
                <option value="EXPIRED">⏰ หมดอายุ (EXPIRED)</option>
                <option value="VOIDED">🚫 ยกเลิก (VOIDED)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">ค้นหา (ชื่อ / ทะเบียน / ตั๋ว):</label>
              <input
                type="text"
                placeholder="พิมพ์คำค้นหา..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full border rounded-xl p-2 text-xs border-slate-200 text-slate-700 focus:outline-emerald-500 bg-slate-50"
              />
            </div>
          </div>
        </div>

        {/* กล่องสรุปยอดรวม (Metric Summary) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm text-center">
            <span className="text-[11px] text-slate-400 font-bold">ตั๋วทั้งหมดในช่วงนี้</span>
            <div className="text-2xl font-black text-slate-800 mt-1">{stats.totalCount} <span className="text-xs text-slate-400 font-normal">ใบ</span></div>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm text-center">
            <span className="text-[11px] text-slate-400 font-bold">น้ำหนักอ้อยสุทธิรวม</span>
            <div className="text-2xl font-black text-emerald-600 mt-1">{stats.totalTons.toFixed(2)} <span className="text-xs text-slate-400 font-normal">ตัน</span></div>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm text-center">
            <span className="text-[11px] text-slate-400 font-bold">พ้อยท์ที่แจกรวม</span>
            <div className="text-2xl font-black text-amber-600 mt-1">{stats.totalPoints.toLocaleString()} <span className="text-xs text-slate-400 font-normal">PTS</span></div>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm text-center">
            <span className="text-[11px] text-slate-400 font-bold">สแกนรับแต้มแล้ว</span>
            <div className="text-2xl font-black text-blue-600 mt-1">
              {stats.claimedCount} <span className="text-xs text-slate-400 font-normal">({stats.totalCount > 0 ? Math.round((stats.claimedCount / stats.totalCount) * 100) : 0}%)</span>
            </div>
          </div>
        </div>

        {/* ตารางแสดงรายการ */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-16 text-center text-slate-400">
              <div className="animate-spin text-3xl mb-3">⏳</div>
              <p className="text-sm font-semibold">กำลังโหลดข้อมูลประวัติจาก Cloud Database...</p>
            </div>
          ) : tickets.length === 0 ? (
            <div className="p-16 text-center text-slate-400">
              <div className="text-4xl mb-2">📋</div>
              <p className="font-bold text-slate-600">ไม่พบข้อมูลตั๋วในช่วงเวลาหรือเงื่อนไขที่เลือก</p>
              <p className="text-xs text-slate-400 mt-1">ลองเปลี่ยนช่วงวันที่หรือคำค้นหาดูใหม่ครับ</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b uppercase text-[11px]">
                  <tr>
                    <th className="py-3.5 px-4">เลขที่ตั๋ว</th>
                    <th className="py-3.5 px-4">วัน-เวลาออกตั๋ว</th>
                    <th className="py-3.5 px-4">ชื่อชาวไร่</th>
                    <th className="py-3.5 px-4">ทะเบียนรถ</th>
                    <th className="py-3.5 px-4 text-right">น้ำหนักสุทธิ</th>
                    <th className="py-3.5 px-4 text-center">พ้อยท์</th>
                    <th className="py-3.5 px-4 text-center">สถานะ</th>
                    <th className="py-3.5 px-4">เวลาที่รับแต้ม</th>
                    <th className="py-3.5 px-4 text-center">เจ้าหน้าที่</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tickets.map((t) => (
                    <tr key={t.id || t.ticketNo} className="hover:bg-slate-50/80 transition">
                      <td className="py-3 px-4 font-mono font-bold text-slate-800 whitespace-nowrap">
                        {t.ticketNo}
                      </td>
                      <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                        {new Date(t.createdAt).toLocaleString("th-TH", {
                          day: "numeric",
                          month: "short",
                          year: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-800 whitespace-nowrap">
                        {t.farmerName}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">
                        {t.plateNo || "-"}
                      </td>
                      <td className="py-3 px-4 text-right font-black text-slate-700 whitespace-nowrap">
                        {Number(t.weightTons).toFixed(2)} ตัน
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-black text-[11px]">
                          +{t.points} PTS
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {t.status === "CLAIMED" && (
                          <span className="bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full font-bold text-[10px]">
                            ✓ รับแต้มแล้ว
                          </span>
                        )}
                        {t.status === "UNCLAIMED" && (
                          <span className="bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full font-bold text-[10px]">
                            ⏳ ค้างรับ
                          </span>
                        )}
                        {t.status === "EXPIRED" && (
                          <span className="bg-slate-200 text-slate-600 px-2.5 py-1 rounded-full font-bold text-[10px]">
                            ⏰ หมดอายุ
                          </span>
                        )}
                        {t.status === "VOIDED" && (
                          <span className="bg-red-100 text-red-700 px-2.5 py-1 rounded-full font-bold text-[10px]">
                            🚫 ยกเลิก
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                        {t.claimedAt
                          ? new Date(t.claimedAt).toLocaleString("th-TH", {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "-"}
                      </td>
                      <td className="py-3 px-4 text-center text-slate-400 whitespace-nowrap">
                        {t.issuedBy || "admin"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

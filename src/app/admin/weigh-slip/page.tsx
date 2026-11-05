"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import QRCode from "qrcode";

export const dynamic = "force-dynamic";

const POINTS_PER_TON = 10; // อัตราพ้อยท์ฝั่ง UI (แสดงโดยประมาณ เซิร์ฟเวอร์เป็นผู้ตัดสินจริง)
const HISTORY_KEY = "WEIGH_TICKET_HISTORY_SECURE";
const SETTINGS_KEY = "WEIGH_SETTINGS";
const HISTORY_LIMIT = 50;
const MAX_TONS_WARN = 80;

type PaperSize = "thermal" | "a5";
type WeighMode = "manual" | "scale";

interface Farmer {
  id?: string | number;
  _id?: string;
  lineUserId: string;
  lineDisplayName?: string;
  fullName: string;
  phone: string;
  points: number;
  hasLine?: boolean;
}

interface TicketRecord {
  id?: string;
  ticketNo: string;
  token: string;
  farmerName: string;
  phone?: string;
  plateNo: string;
  weight: number;
  points: number;
  status?: string;
  expiresAt: string;
  createdAt: string;
  qrDataUrl?: string;
}

/* ---------- helpers ---------- */

const onlyDigits = (s?: string) => (s || "").replace(/\D/g, "");

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });

const formatExpire = (iso: string) =>
  new Date(iso).toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

/* ---------- ใบพิมพ์ (ขาวดำ เหมาะกับเครื่องพิมพ์สลิป 80mm และ A5) ---------- */

function PrintSlip({ t, paper }: { t: TicketRecord; paper: PaperSize }) {
  const thermal = paper === "thermal";
  const qr = thermal ? "50mm" : "80mm";
  const row = (label: string, value: string) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, textAlign: "left", margin: "2px 0" }}>
      <span>{label}</span>
      <b style={{ textAlign: "right" }}>{value}</b>
    </div>
  );
  return (
    <div
      style={{
        width: thermal ? "72mm" : "100%",
        margin: "0 auto",
        color: "#000",
        background: "#fff",
        fontFamily: "'Noto Sans Thai', 'Sarabun', sans-serif",
        textAlign: "center",
        fontSize: thermal ? 12 : 16,
        lineHeight: 1.4,
      }}
    >
      <div style={{ fontWeight: 800, fontSize: thermal ? 16 : 24 }}>ใบรับพ้อยท์อ้อย</div>
      <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
      {row("ชาวไร่", t.farmerName)}
      {t.phone ? row("เบอร์โทร", t.phone) : null}
      {t.plateNo ? row("ทะเบียนรถ", t.plateNo) : null}
      {row("เลขที่ตั๋ว", t.ticketNo)}
      {row("วันเวลาออกตั๋ว", formatDateTime(t.createdAt))}
      {row("หมดอายุ", `${formatTime(t.expiresAt)} น. (1 ชม.)`)}
      {row("น้ำหนักสุทธิ", `${t.weight.toFixed(2)} ตัน`)}
      <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
      <div style={{ fontWeight: 800, fontSize: thermal ? 22 : 34 }}>+{t.points} พ้อยท์</div>
      {t.qrDataUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={t.qrDataUrl}
          alt="QR"
          style={{ width: qr, height: qr, margin: "8px auto", display: "block" }}
        />
      )}
      <div style={{ fontSize: thermal ? 11 : 14, fontWeight: "bold" }}>สแกน QR ด้วย LINE เพื่อรับพ้อยท์</div>
      <div style={{ fontSize: thermal ? 10 : 12, marginTop: 2 }}>
        เฉพาะคุณ {t.farmerName} (บัญชี LINE ต้องตรงกับที่ลงทะเบียน) · สแกนได้ 1 ครั้งภายใน 1 ชม. (ก่อน {formatTime(t.expiresAt)} น.)
      </div>
    </div>
  );
}

/* ---------- หน้าหลัก ---------- */

export default function WeighSlipGenerator() {
  // ค้นหาชาวไร่ (Debounced 300ms ทางฝั่งเซิร์ฟเวอร์)
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredFarmers, setFilteredFarmers] = useState<Farmer[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loadingFarmers, setLoadingFarmers] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const weightInputRef = useRef<HTMLInputElement>(null);
  const grossInputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ฟอร์ม
  const [selectedFarmer, setSelectedFarmer] = useState<Farmer | null>(null);
  const [plateNo, setPlateNo] = useState("");
  const [mode, setMode] = useState<WeighMode>("manual");
  const [netWeight, setNetWeight] = useState("");
  const [grossKg, setGrossKg] = useState("");
  const [tareKg, setTareKg] = useState("");

  // สถานะ
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [ticket, setTicket] = useState<TicketRecord | null>(null);
  const [printTarget, setPrintTarget] = useState<TicketRecord | null>(null);
  const [history, setHistory] = useState<TicketRecord[]>([]);

  // ตั้งค่าเครื่องพิมพ์
  const [paper, setPaper] = useState<PaperSize>("thermal");
  const [autoPrint, setAutoPrint] = useState(true);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  /* ----- โหลดการตั้งค่าและประวัติจาก LocalStorage ----- */

  useEffect(() => {
    try {
      const h = localStorage.getItem(HISTORY_KEY);
      if (h) setHistory(JSON.parse(h));
      const s = localStorage.getItem(SETTINGS_KEY);
      if (s) {
        const parsed = JSON.parse(s);
        if (parsed.paper === "thermal" || parsed.paper === "a5") setPaper(parsed.paper);
        if (typeof parsed.autoPrint === "boolean") setAutoPrint(parsed.autoPrint);
      }
    } catch {
      /* ignore */
    }
    setSettingsLoaded(true);
    searchInputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!settingsLoaded) return;
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ paper, autoPrint }));
    } catch {
      /* ignore */
    }
  }, [paper, autoPrint, settingsLoaded]);

  // ค้นหาชาวไร่แบบ Debounced 300ms เรียก GET /api/farmers?q=
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setFilteredFarmers([]);
      setLoadingFarmers(false);
      return;
    }

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    searchTimeoutRef.current = setTimeout(async () => {
      setLoadingFarmers(true);
      try {
        const res = await fetch(`/api/farmers?q=${encodeURIComponent(q)}&t=${Date.now()}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const list = await res.json();
          setFilteredFarmers(Array.isArray(list) ? list : []);
        } else {
          setFilteredFarmers([]);
        }
      } catch (err) {
        console.error("Search farmers error:", err);
        setFilteredFarmers([]);
      } finally {
        setLoadingFarmers(false);
      }
    }, 300);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchQuery]);

  // ปิด dropdown เมื่อคลิกข้างนอก
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  /* ----- คำนวณน้ำหนัก ----- */

  const tons = useMemo(() => {
    if (mode === "manual") return Math.round((parseFloat(netWeight) || 0) * 100) / 100;
    const gross = parseFloat(grossKg) || 0;
    const tare = parseFloat(tareKg) || 0;
    return Math.max(0, Math.round(((gross - tare) / 1000) * 100) / 100);
  }, [mode, netWeight, grossKg, tareKg]);

  const previewPoints = Math.round(tons * POINTS_PER_TON);

  const todayStats = useMemo(() => {
    const today = new Date().toDateString();
    const list = history.filter((h) => new Date(h.createdAt).toDateString() === today);
    return {
      count: list.length,
      tons: list.reduce((s, h) => s + h.weight, 0),
      points: list.reduce((s, h) => s + h.points, 0),
    };
  }, [history]);

  /* ----- actions ----- */

  const handleSelectFarmer = (farmer: Farmer) => {
    setSelectedFarmer(farmer);
    setSearchQuery(farmer.fullName);
    setShowDropdown(false);
    setTicket(null);
    setNotice(null);
    setTimeout(() => (mode === "manual" ? weightInputRef : grossInputRef).current?.focus(), 50);
  };

  const clearFarmer = () => {
    setSelectedFarmer(null);
    setSearchQuery("");
    setShowDropdown(true);
    searchInputRef.current?.focus();
  };

  const resetForm = () => {
    setSelectedFarmer(null);
    setSearchQuery("");
    setPlateNo("");
    setNetWeight("");
    setGrossKg("");
    setTareKg("");
    setTicket(null);
    setNotice(null);
    setTimeout(() => searchInputRef.current?.focus(), 50);
  };

  // พิมพ์ใบชั่ง
  const printTicket = (t: TicketRecord) => {
    setPrintTarget(t);
    setTimeout(() => window.print(), 150);
  };

  const clearHistory = () => {
    if (!window.confirm("ล้างประวัติการออกตั๋วในเครื่องนี้? (ข้อมูลบนฐานข้อมูลไม่ถูกลบ)")) return;
    setHistory([]);
    try {
      localStorage.removeItem(HISTORY_KEY);
    } catch {
      /* ignore */
    }
  };

  // ออกตั๋วชั่งใหม่ (Server ตัดสิน points, ticketNo, token, expiresAt)
  const handleGenerateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (generating || ticket) return;
    setNotice(null);

    if (!selectedFarmer) {
      setNotice({ type: "error", text: "⚠️ กรุณาค้นหาหรือเลือกชาวไร่จากระบบก่อนครับ" });
      return;
    }
    if (tons <= 0) {
      setNotice({ type: "error", text: "⚠️ กรุณาระบุน้ำหนักอ้อยให้ถูกต้อง (มากกว่า 0 ตัน)" });
      return;
    }
    if (!plateNo.trim() || plateNo.trim().length < 2) {
      setNotice({ type: "error", text: "⚠️ กรุณาระบุทะเบียนรถให้ถูกต้อง (อย่างน้อย 2 ตัวอักษร)" });
      return;
    }
    if (tons > MAX_TONS_WARN && !window.confirm(`น้ำหนัก ${tons} ตัน สูงผิดปกติ ยืนยันว่าถูกต้อง?`)) {
      return;
    }

    setGenerating(true);
    try {
      // ส่งเฉพาะข้อมูลพื้นฐานให้เซิร์ฟเวอร์
      const payload = {
        farmerId: selectedFarmer.lineUserId || selectedFarmer.id,
        weightTons: tons,
        plateNo: plateNo.trim(),
        grossKg: mode === "scale" ? parseFloat(grossKg) || undefined : undefined,
        tareKg: mode === "scale" ? parseFloat(tareKg) || undefined : undefined,
      };

      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || `บันทึกตั๋วไม่สำเร็จ (HTTP ${res.status})`);
      }

      const serverTicket = data.ticket;

      // สร้าง QR Code ภายในเครื่องด้วย QRCode.toDataURL (ไม่ส่งโทเคนไป API ภายนอก)
      const claimUrl = `https://liff.line.me/2012344285-05lfEnJt/claim?token=${serverTicket.token}`;
      const qrDataUrl = await QRCode.toDataURL(claimUrl, {
        width: 400,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
        errorCorrectionLevel: "M",
      });

      const newRecord: TicketRecord = {
        id: serverTicket.id,
        ticketNo: serverTicket.ticketNo,
        token: serverTicket.token,
        farmerName: serverTicket.farmerName,
        phone: selectedFarmer.phone,
        plateNo: serverTicket.plateNo,
        weight: serverTicket.weightTons,
        points: serverTicket.points,
        status: serverTicket.status,
        expiresAt: serverTicket.expiresAt,
        createdAt: serverTicket.createdAt,
        qrDataUrl,
      };

      // บันทึกลง history ในเครื่อง
      const nextHistory = [newRecord, ...history].slice(0, HISTORY_LIMIT);
      setHistory(nextHistory);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory));
      } catch {
        /* ignore */
      }

      setTicket(newRecord);
      setNotice({ type: "success", text: "🎉 สร้างใบชั่งและ QR สะสมพ้อยท์สำเร็จเรียบร้อย!" });
      if (autoPrint) printTicket(newRecord);
    } catch (err: any) {
      setNotice({ type: "error", text: "⚠️ " + (err.message || "เกิดข้อผิดพลาดในการออกตั๋ว") });
    } finally {
      setGenerating(false);
    }
  };

  const locked = Boolean(ticket);

  return (
    <>
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          .print-only,
          .print-only * {
            visibility: visible !important;
          }
          .print-only {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            display: block !important;
          }
        }
        @media screen {
          .print-only {
            display: none !important;
          }
        }
      `}</style>

      <div className="min-h-screen bg-slate-100 flex flex-col items-center p-3 sm:p-6 pb-16 font-sans">
        {/* หัวกระดาษ */}
        <div className="max-w-2xl w-full mb-4 flex items-center justify-between gap-3">
          <Link
            href="/"
            className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 bg-white px-3 py-1.5 rounded-full border border-slate-200 shadow-sm"
          >
            ← หน้าหลัก
          </Link>
          <div className="text-right">
            <h1 className="text-lg font-black text-slate-800">🌾 ออก QR สะสมพ้อยท์อ้อย</h1>
            <p className="text-[11px] text-slate-500">1 ตัน = {POINTS_PER_TON} พ้อยท์ · เซิร์ฟเวอร์คำนวณและตรวจสอบสิทธิ์</p>
          </div>
        </div>

        {/* แจ้งเตือน */}
        {notice && (
          <div
            className={`max-w-2xl w-full p-3.5 mb-4 rounded-2xl text-xs font-bold border flex items-center justify-between ${
              notice.type === "error"
                ? "bg-red-50 text-red-700 border-red-200"
                : "bg-emerald-50 text-emerald-800 border-emerald-200"
            }`}
          >
            <span>{notice.text}</span>
            <button type="button" onClick={() => setNotice(null)} className="opacity-60 hover:opacity-100 text-sm">
              ✕
            </button>
          </div>
        )}

        {/* แผงควบคุมหลัก */}
        <div className="max-w-2xl w-full bg-white rounded-3xl p-5 sm:p-7 shadow-sm border border-slate-200 mb-4">
          {/* สรุปยอดวันนี้ */}
          <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 rounded-2xl mb-5 text-center text-xs">
            <div>
              <div className="text-slate-400 text-[10px]">ออกแล้ววันนี้</div>
              <div className="text-base font-black text-slate-700">{todayStats.count} ใบ</div>
            </div>
            <div className="border-x border-slate-200">
              <div className="text-slate-400 text-[10px]">น้ำหนักรวม</div>
              <div className="text-base font-black text-emerald-600">{todayStats.tons.toFixed(2)} ตัน</div>
            </div>
            <div>
              <div className="text-slate-400 text-[10px]">พ้อยท์ที่ออก</div>
              <div className="text-base font-black text-amber-600">{todayStats.points} pts</div>
            </div>
          </div>

          <form onSubmit={handleGenerateTicket} className="space-y-4">
            <fieldset disabled={locked} className="space-y-4">
              {/* ค้นหาชาวไร่ */}
              <div ref={searchRef} className="relative">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  1. ค้นหาชาวไร่ <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setShowDropdown(true);
                    }}
                    onFocus={() => setShowDropdown(true)}
                    placeholder="พิมพ์ชื่อ นามสกุล หรือเบอร์โทร..."
                    className="w-full border rounded-xl p-3 text-sm border-slate-200 focus:outline-emerald-500 pr-10"
                  />
                  {selectedFarmer && (
                    <button
                      type="button"
                      onClick={clearFarmer}
                      className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 text-sm font-bold"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {loadingFarmers && (
                  <div className="text-[11px] text-slate-400 mt-1">⏳ กำลังค้นหาข้อมูลจากเซิร์ฟเวอร์...</div>
                )}

                {/* Dropdown ผลการค้นหา */}
                {showDropdown && !selectedFarmer && filteredFarmers.length > 0 && (
                  <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl max-h-60 overflow-y-auto divide-y divide-slate-100">
                    {filteredFarmers.map((f, idx) => (
                      <button
                        key={f.id || f.lineUserId || idx}
                        type="button"
                        onClick={() => handleSelectFarmer(f)}
                        className={`w-full text-left p-3 hover:bg-emerald-50 transition flex items-center justify-between text-xs ${
                          idx === activeIndex ? "bg-emerald-50/60" : ""
                        }`}
                      >
                        <div>
                          <div className="font-bold text-slate-800">{f.fullName}</div>
                          <div className="text-slate-500 text-[11px]">{f.phone || "-"}</div>
                        </div>
                        <div className="text-right">
                          <span className="text-amber-700 font-bold">{f.points ?? 0} pts</span>
                          {f.hasLine ? (
                            <span className="block text-[10px] text-emerald-600 font-semibold">LINE เชื่อมแล้ว</span>
                          ) : (
                            <span className="block text-[10px] text-slate-400">ยังไม่เชื่อม LINE</span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* ชาวไร่ที่เลือก */}
              {selectedFarmer && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs flex items-center justify-between">
                  <div>
                    <span className="text-emerald-800 font-bold text-sm block">✓ {selectedFarmer.fullName}</span>
                    <span className="text-emerald-600 text-[11px]">
                      เบอร์โทร: {selectedFarmer.phone || "-"} · คะแนนสะสมปัจจุบัน: {selectedFarmer.points ?? 0} pts
                    </span>
                  </div>
                  {!locked && (
                    <button
                      type="button"
                      onClick={clearFarmer}
                      className="px-2.5 py-1 text-[11px] text-emerald-700 hover:text-emerald-900 border border-emerald-300 rounded-lg bg-white"
                    >
                      เปลี่ยน
                    </button>
                  )}
                </div>
              )}

              {/* ทะเบียนรถ */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  2. ทะเบียนรถบรรทุก <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={plateNo}
                  onChange={(e) => setPlateNo(e.target.value.toUpperCase())}
                  placeholder="เช่น 80-1234 หรือ กข-9999"
                  maxLength={20}
                  className="w-full border rounded-xl p-3 text-sm border-slate-200 focus:outline-emerald-500 font-mono uppercase"
                />
              </div>

              {/* โหมดการชั่ง */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700">3. น้ำหนักอ้อยสุทธิ</label>
                  <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setMode("manual")}
                      className={`px-2.5 py-1 rounded-md font-bold transition ${
                        mode === "manual" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"
                      }`}
                    >
                      กรอกตันตรงๆ
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode("scale")}
                      className={`px-2.5 py-1 rounded-md font-bold transition ${
                        mode === "scale" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"
                      }`}
                    >
                      ชั่งเข้า - ชั่งออก (กก.)
                    </button>
                  </div>
                </div>

                {mode === "manual" ? (
                  <div>
                    <input
                      ref={weightInputRef}
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={netWeight}
                      onChange={(e) => setNetWeight(e.target.value)}
                      placeholder="เช่น 15.40"
                      className="w-full border rounded-xl p-3 text-base font-bold text-slate-800 border-slate-200 focus:outline-emerald-500"
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[11px] text-slate-500 mb-0.5 block">ชั่งหนักรวม (กก.)</span>
                      <input
                        ref={grossInputRef}
                        type="number"
                        value={grossKg}
                        onChange={(e) => setGrossKg(e.target.value)}
                        placeholder="กก."
                        className="w-full border rounded-xl p-2.5 text-sm border-slate-200 focus:outline-emerald-500"
                      />
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-500 mb-0.5 block">ชั่งรถเปล่า (กก.)</span>
                      <input
                        type="number"
                        value={tareKg}
                        onChange={(e) => setTareKg(e.target.value)}
                        placeholder="กก."
                        className="w-full border rounded-xl p-2.5 text-sm border-slate-200 focus:outline-emerald-500"
                      />
                    </div>
                  </div>
                )}

                {tons > 0 && (
                  <div className="mt-2 text-xs text-amber-700 font-bold bg-amber-50 p-2.5 rounded-xl border border-amber-200 flex justify-between">
                    <span>น้ำหนักสุทธิ: {tons.toFixed(2)} ตัน</span>
                    <span>ประมาณการ: +{previewPoints} PTS</span>
                  </div>
                )}
              </div>
            </fieldset>

            {/* ปุ่มกดออกตั๋ว */}
            {locked ? (
              <button
                type="button"
                onClick={resetForm}
                className="w-full font-bold py-3.5 rounded-xl shadow transition text-white text-sm bg-emerald-600 hover:bg-emerald-700 active:scale-95"
              >
                ➕ ออกใบใหม่ (คันถัดไป)
              </button>
            ) : (
              <button
                type="submit"
                disabled={!selectedFarmer || generating || tons <= 0}
                className={`w-full font-bold py-3.5 rounded-xl shadow transition text-white text-sm flex items-center justify-center gap-2 ${
                  selectedFarmer && !generating && tons > 0
                    ? "bg-slate-900 hover:bg-slate-800 active:scale-95"
                    : "bg-slate-300 cursor-not-allowed"
                }`}
              >
                <span>
                  {generating
                    ? "⏳ กำลังบันทึกและสร้าง QR Code..."
                    : selectedFarmer
                    ? `🖨️ ออก QR ให้ ${selectedFarmer.fullName} (${tons.toFixed(2)} ตัน · ~${previewPoints} pts)`
                    : "กรุณาเลือกชาวไร่ก่อน"}
                </span>
              </button>
            )}
          </form>

          {/* ตั๋วที่เพิ่งออกสำเร็จ */}
          {ticket && (
            <div className="mt-8 p-6 bg-slate-50 border-2 border-dashed border-amber-400 rounded-3xl text-center">
              <div className="text-[11px] font-bold text-amber-800 bg-amber-100 px-3 py-1 rounded-full inline-block uppercase tracking-wider mb-2">
                บัตรสะสมพ้อยท์อ้อย (สแกนได้ครั้งเดียว)
              </div>
              <h2 className="text-xl font-black text-slate-800">{ticket.farmerName}</h2>
              <div className="text-xs text-slate-500 font-mono mt-0.5">เลขที่ตั๋ว: {ticket.ticketNo}</div>
              <div className="text-xs text-slate-500 mt-0.5">
                {formatDateTime(ticket.createdAt)}
                {ticket.plateNo ? ` · ทะเบียน ${ticket.plateNo}` : ""}
              </div>

              {ticket.qrDataUrl && (
                <div className="my-4 inline-block p-4 bg-white border-2 border-slate-200 rounded-2xl shadow-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={ticket.qrDataUrl} alt="Unique QR" className="w-56 h-56 mx-auto" />
                </div>
              )}

              <div>
                <div className="bg-amber-500 text-white py-2.5 px-6 rounded-xl text-base font-black inline-block shadow">
                  +{ticket.points} พ้อยท์ (น้ำหนัก {ticket.weight.toFixed(2)} ตัน)
                </div>
              </div>

              <div className="text-xs text-amber-800 font-bold mt-2 bg-amber-50 border border-amber-200 py-1.5 px-3 rounded-xl inline-block">
                🔒 ออกให้คุณ {ticket.farmerName} · เฉพาะบัญชี LINE ที่ตรงกับชื่อนี้เท่านั้นจึงจะสแกนรับได้ (หมดอายุเวลา {formatTime(ticket.expiresAt)} น.)
              </div>

              <div className="mt-5 flex flex-wrap gap-2 justify-center">
                <button
                  type="button"
                  onClick={() => printTicket(ticket)}
                  className="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-800 active:scale-95"
                >
                  🖨️ พิมพ์ใบนี้
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ประวัติการออกตั๋วในเครื่องนี้ */}
        <div className="max-w-2xl w-full bg-white rounded-3xl p-6 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-black text-slate-800">🧾 ประวัติการออกตั๋ว (เครื่องนี้)</h2>
            {history.length > 0 && (
              <button type="button" onClick={clearHistory} className="text-[11px] text-slate-400 hover:text-red-600">
                ล้างประวัติ
              </button>
            )}
          </div>
          {history.length === 0 ? (
            <p className="text-sm text-slate-400">ยังไม่มีตั๋วที่ออกจากเครื่องนี้</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {history.slice(0, 15).map((h) => (
                <div key={h.token} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-800 truncate">{h.farmerName}</div>
                    <div className="text-[11px] text-slate-500">
                      {formatTime(h.createdAt)} · {h.ticketNo}
                      {h.plateNo ? ` · ${h.plateNo}` : ""} · {h.weight.toFixed(2)} ตัน ·{" "}
                      <span className="text-amber-700 font-semibold">{h.points} pts</span>
                    </div>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => printTicket(h)}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-800"
                    >
                      🖨️ พิมพ์ซ้ำ
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {history.length > 15 && (
            <p className="text-[11px] text-slate-400 mt-2">แสดง 15 รายการล่าสุด จากทั้งหมด {history.length}</p>
          )}
        </div>
      </div>

      {/* ===== ส่วนที่ถูกพิมพ์ (ซ่อนบนหน้าจอ แสดงตอนพิมพ์) ===== */}
      <div className="print-only">{printTarget && <PrintSlip t={printTarget} paper={paper} />}</div>
    </>
  );
}

"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";

export const dynamic = "force-dynamic";

const POINTS_PER_TON = 10; //จำนวนพ้อยเริ่มต้นต่อ 1 ตัน 

interface Farmer {
  id?: string | number;
  _id?: string;
  lineUserId: string;
  lineDisplayName: string;
  fullName: string;
  phone: string;
  points: number;
}

export default function WeighSlipGenerator() {
  // ค้นหาชาวไร่
  const [searchQuery, setSearchQuery] = useState("");
  const [allFarmers, setAllFarmers] = useState<Farmer[]>([]);
  const [filteredFarmers, setFilteredFarmers] = useState<Farmer[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loadingFarmers, setLoadingFarmers] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  // ข้อมูลที่เลือกแล้ว
  const [selectedFarmer, setSelectedFarmer] = useState<Farmer | null>(null);
  const [netWeight, setNetWeight] = useState("0.00");

  // ตั๋วที่สร้าง
  const [ticket, setTicket] = useState<{
    ticketNo: string;
    token: string;
    points: number;
    weight: number;
    qrUrl: string;
  } | null>(null);

  // โหลดชาวไร่จาก Database ทั้งหมด
  const loadFarmers = async () => {
    setLoadingFarmers(true);
    try {
      const res = await fetch("/api/farmers?t=" + Date.now(), { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : [];
        setAllFarmers(list);
      }
    } catch (e) {
      console.error("Error loading farmers:", e);
    } finally {
      setLoadingFarmers(false);
    }
  };

  // โหลดรายชื่อทันทีเมื่อหน้าเปิด
  useEffect(() => {
    void loadFarmers();
  }, []);

  // กรองตามที่พิมพ์ (ชื่อ หรือ เบอร์)
  useEffect(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      setFilteredFarmers(allFarmers.slice(0, 8));
      return;
    }
    const results = allFarmers.filter(
      (f) =>
        f.fullName?.toLowerCase().includes(q) ||
        f.phone?.includes(q) ||
        f.lineDisplayName?.toLowerCase().includes(q)
    );
    setFilteredFarmers(results.slice(0, 8));
  }, [searchQuery, allFarmers]);

  // ปิด dropdown เมื่อคลิกข้างนอก (สำหรับ Desktop)
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // เมื่อเลือกชาวไร่
  const handleSelectFarmer = (farmer: Farmer) => {
    setSelectedFarmer(farmer);
    setSearchQuery(farmer.fullName);
    setShowDropdown(false);
    setTicket(null); // ล้างตั๋วเก่าออก
    setNotice(null);
  };

  // สร้างตั๋ว + บันทึกขึ้น Cloud DB + สร้าง QR Code
  const handleGenerateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);

    if (!selectedFarmer) {
      setNotice({ type: "error", text: "⚠️ กรุณาค้นหาหรือเลือกชาวไร่จากระบบก่อนครับ" });
      return;
    }

    const tons = parseFloat(netWeight) || 0;
    if (tons <= 0) {
      setNotice({ type: "error", text: "⚠️ กรุณาระบุน้ำหนักอ้อยให้ถูกต้อง (มากกว่า 0 ตัน)" });
      return;
    }

    setGenerating(true);

    try {
      const calculatedPoints = Math.round(tons * POINTS_PER_TON);
      const randomTicketNo = `TK-${Math.floor(100000 + Math.random() * 900000)}`;
      const secretToken = `SEC-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;

      const newTicketData = {
        ticketNo: randomTicketNo,
        token: secretToken,
        lineUserId: selectedFarmer.lineUserId || "U_FALLBACK",
        farmerName: selectedFarmer.fullName,
        weightTons: tons,
        points: calculatedPoints,
      };

      // 1. บันทึกลง Cloud Database เพื่อให้ทุกเครื่องและมือถือสแกนเจอ 100%
      try {
        await fetch("/api/tickets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newTicketData),
        });
      } catch (err) {
        console.error("Cloud ticket save error:", err);
      }

      // 2. บันทึก local backup
      try {
        localStorage.setItem(`TICKET_${secretToken}`, JSON.stringify({
          ...newTicketData,
          isClaimed: false,
          claimedTime: null,
        }));
      } catch (err) {
        // ignore localStorage error on private mode
      }

      const origin = typeof window !== "undefined" ? window.location.origin : "https://cane-web.vercel.app";
      const claimLink = `${origin}/claim?token=${secretToken}`;
      const qrImage = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(claimLink)}`;

      setTicket({
        ticketNo: randomTicketNo,
        token: secretToken,
        points: calculatedPoints,
        weight: tons,
        qrUrl: qrImage,
      });

      setNotice({ type: "success", text: "🎉 สร้างใบชั่งและ QR สะสมพ้อยท์สำเร็จเรียบร้อย!" });
    } catch (err: any) {
      setNotice({ type: "error", text: "เกิดข้อผิดพลาด: " + err.message });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8 flex flex-col items-center">
      <div className="max-w-xl w-full bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-slate-200">
        
        <Link href="/" className="text-xs text-emerald-700 font-bold hover:underline mb-4 inline-block">
          ← กลับหน้าหลัก
        </Link>
        
        <h1 className="text-2xl font-black text-slate-800">
          ⚖️ ระบบออก QR สะสมพ้อยท์
        </h1>
        

        {/* แถบแจ้งเตือน */}
        {notice && (
          <div
            className={`p-3.5 rounded-2xl text-xs font-bold mb-4 border flex items-center justify-between ${
              notice.type === "error"
                ? "bg-red-50 text-red-700 border-red-200"
                : "bg-emerald-50 text-emerald-700 border-emerald-200"
            }`}
          >
            <span>{notice.text}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="text-slate-400 hover:text-slate-600 ml-2"
            >
              ✕
            </button>
          </div>
        )}

        <form onSubmit={handleGenerateTicket} className="space-y-5">

          {/* 🔍 ช่องค้นหาชาวไร่ (ชื่อ หรือ เบอร์โทร) */}
          <div ref={searchRef} className="relative">
            <label className="block text-xs font-bold text-slate-700 mb-1 mt-4">
              🔍 ค้นหาชาวไร่ (ชื่อ หรือ เบอร์โทร) <span className="text-red-500">*</span>
            </label>

            {/* ช่องพิมพ์ค้นหา */}
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onFocus={() => setShowDropdown(true)}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowDropdown(true);
                  if (selectedFarmer && e.target.value !== selectedFarmer.fullName) {
                    setSelectedFarmer(null);
                  }
                }}
                placeholder={
                  loadingFarmers
                    ? "⏳ กำลังโหลดข้อมูลชาวไร่..."
                    : "พิมพ์ค้นหาชื่อ หรือเบอร์โทร..."
                }
                className={`w-full border rounded-xl text-sm placeholder:text-slate-500 text-slate-800 p-3 pr-10 ${
                  selectedFarmer
                    ? "border-emerald-400 bg-emerald-50 font-semibold text-emerald-800"
                    : "border-slate-200 bg-white"
                }`}
                autoComplete="off"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-sm">
                {loadingFarmers ? "⏳" : selectedFarmer ? "✅" : "🔍"}
              </div>
            </div>

            {/* Dropdown ผลการค้นหา (รองรับ Touch บนมือถือด้วย onPointerDown) */}
            {showDropdown && filteredFarmers.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden max-h-60 overflow-y-auto">
                <div className="px-3 py-1.5 bg-slate-50 text-[10px] text-slate-400 font-bold uppercase">
                  แตะเลือกชาวไร่ด้านล่าง:
                </div>
                {filteredFarmers.map((farmer) => (
                  <div
                    key={String(farmer._id || farmer.id || farmer.lineUserId)}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      handleSelectFarmer(farmer);
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-emerald-50 active:bg-emerald-100 border-b border-slate-100 last:border-0 cursor-pointer transition-colors"
                  >
                    <div className="font-bold text-slate-800 text-sm">{farmer.fullName}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5 flex gap-3 flex-wrap">
                      <span>📞 {farmer.phone}</span>
                      <span className="text-amber-600 font-semibold">⭐ {farmer.points ?? 0} pts</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* แสดงข้อมูลชาวไร่ที่เลือก */}
          {selectedFarmer && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-sm animate-in fade-in">
              <div className="text-xs text-emerald-700 font-bold mb-1">
                ✓ ชาวไร่ที่เลือกเรียบร้อย:
              </div>
              <div className="font-black text-slate-800 text-base">{selectedFarmer.fullName}</div>
              <div className="flex flex-wrap gap-3 mt-1 text-xs text-slate-600">
                <span>เบอร์โทร: <b>{selectedFarmer.phone}</b></span>
                <span className="text-amber-700 font-bold">แต้มปัจจุบัน: {selectedFarmer.points ?? 0} PTS</span>
              </div>
            </div>
          )}

          {/* กรอกน้ำหนัก */}
          <div className="bg-amber-50 p-4 rounded-2xl border border-amber-200">
            <label className="block text-xs font-bold text-amber-900 mb-1">
              ⚖️ น้ำหนักอ้อยสุทธิที่ชั่งได้ (ตัน) <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.01"
                min="0.1"
                value={netWeight}
                onChange={(e) => setNetWeight(e.target.value)}
                className="w-full border border-amber-300 rounded-xl p-3 text-2xl font-mono font-bold text-slate-800 focus:outline-amber-500 bg-white"
                required
              />
              <span className="font-bold text-amber-800 text-lg">ตัน</span>
            </div>
            <p className="text-xs text-amber-700 mt-2">
              💡 1 ตัน = {POINTS_PER_TON} พ้อยท์ → น้ำหนักนี้จะได้{" "}
              <span className="font-black text-amber-900 underline">
                {Math.round((parseFloat(netWeight) || 0) * POINTS_PER_TON)} พ้อยท์
              </span>
            </p>
          </div>

          <button
            type="submit"
            disabled={!selectedFarmer || generating}
            className={`w-full font-bold py-3.5 rounded-xl shadow transition text-white text-sm flex items-center justify-center gap-2 ${
              selectedFarmer && !generating
                ? "bg-slate-900 hover:bg-slate-800 active:scale-95"
                : "bg-slate-300 cursor-not-allowed"
            }`}
          >
            <span>{generating ? "⏳ กำลังสร้าง QR Code..." : selectedFarmer ? `🖨️ ออก QR ให้ ${selectedFarmer.fullName}` : "กรุณาเลือกชาวไร่ก่อน"}</span>
          </button>
        </form>

        {/* ตั๋วและ QR Code */}
        {ticket && selectedFarmer && (
          <div className="mt-8 p-6 bg-slate-50 border-2 border-dashed border-amber-400 rounded-3xl text-center animate-in fade-in zoom-in-95">
            <div className="text-[11px] font-bold text-amber-800 bg-amber-100 px-3 py-1 rounded-full inline-block uppercase tracking-wider mb-2">
              บัตรสะสมพ้อยท์อ้อย (สแกนได้ครั้งเดียว)
            </div>
            <h2 className="text-xl font-black text-slate-800">{selectedFarmer.fullName}</h2>
            <div className="text-xs text-slate-500 font-mono mt-0.5">
              เลขที่ตั๋ว: {ticket.ticketNo}
            </div>

            <div className="my-4 inline-block p-4 bg-white border-2 border-slate-200 rounded-2xl shadow-sm">
              <img src={ticket.qrUrl} alt="Unique QR" className="w-56 h-56 mx-auto" />
            </div>

            <div>
              <div className="bg-amber-500 text-white py-2.5 px-6 rounded-xl text-base font-black inline-block shadow">
                +{ticket.points} พ้อยท์ (น้ำหนัก {ticket.weight} ตัน)
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-slate-200 text-xs">
              <a
                href={`/claim?token=${ticket.token}`}
                target="_blank"
                rel="noreferrer"
                className="text-emerald-700 hover:text-emerald-800 underline font-bold text-sm block"
              >
                👉 คลิกจำลองเปิดหน้าสแกน (ฝั่งชาวไร่บนมือถือ)
              </a>
              <p className="text-slate-400 mt-1">ใช้มือถือสแกน QR Code นี้เพื่อรับแต้มพ้อยท์</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

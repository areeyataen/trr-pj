"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

const MY_LIFF_ID = "2012344285-05lfEnJt";

interface Farmer {
  _id?: string;
  id?: string;
  lineUserId: string;
  fullName: string;
  phone: string;
  points: number;
  lineDisplayName?: string;
  linePictureUrl?: string;
  userRole?: string;
}

const POLL_MS = 4_000;

function ClaimContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  // State ตั๋ว
  const [ticketData, setTicketData] = useState<any>(null);
  const [ticketStatus, setTicketStatus] = useState<"none" | "loading" | "valid" | "already_claimed" | "invalid" | "expired" | "voided">("none");
  const [claiming, setClaiming] = useState(false);
  const [claimResult, setClaimResult] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState("");

  // State ชาวไร่
  const [currentFarmer, setCurrentFarmer] = useState<Farmer | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [lineProfile, setLineProfile] = useState<{ userId: string; displayName: string; pictureUrl: string } | null>(null);
  const [lineUserId, setLineUserId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("กำลังเชื่อมต่อบัญชี LINE...");

  // ============================================================
  // ดึงคะแนนของตัวเองผ่าน ?lineUserId= (ส่งเฉพาะ ID ของตัวเอง)
  // ============================================================
  const fetchMyPoints = useCallback(async (uid?: string) => {
    const userId = uid || lineUserId || (typeof window !== "undefined" ? localStorage.getItem("CURRENT_FARMER_USER_ID") : null);
    if (!userId) { setLoadingProfile(false); return null; }

    try {
      const resp = await fetch(`/api/farmers?lineUserId=${encodeURIComponent(userId)}&t=${Date.now()}`, {
        cache: "no-store",
      });
      if (resp.ok) {
        const me: Farmer = await resp.json();
        if (me) {
          setCurrentFarmer(me);
          setLastUpdated(new Date());
          try { localStorage.setItem("CURRENT_FARMER_USER_ID", me.lineUserId); } catch {}
          return me;
        }
      }
    } catch (err) {
      console.error("Fetch my points error:", err);
    } finally {
      setLoadingProfile(false);
    }
    return null;
  }, [lineUserId]);

  // ============================================================
  // 1. LIFF init — ดึง userId อัตโนมัติ
  // ============================================================
  useEffect(() => {
    let isMounted = true;
    const initUser = async () => {
      setLoadingProfile(true);
      setStatusMessage("กำลังดึงข้อมูลจาก LINE...");

      try {
        const liff = (await import("@line/liff")).default;
        const initPromise = liff.init({ liffId: MY_LIFF_ID });
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("LIFF Timeout")), 5000));
        await Promise.race([initPromise, timeoutPromise]);

        if (!isMounted) return;

        if (liff.isLoggedIn()) {
          const profile = await liff.getProfile();
          if (isMounted) {
            setLineProfile({ userId: profile.userId, displayName: profile.displayName, pictureUrl: profile.pictureUrl || "" });
            setLineUserId(profile.userId);
            setStatusMessage("กำลังดึงคะแนนของคุณ...");
            await fetchMyPoints(profile.userId);
            return;
          }
        } else if (liff.isInClient()) {
          liff.login();
          return;
        }
      } catch (e) {
        console.warn("LIFF not available:", e);
      }

      // Fallback localStorage
      const savedUserId = typeof window !== "undefined" ? localStorage.getItem("CURRENT_FARMER_USER_ID") : null;
      if (isMounted && savedUserId) {
        setLineUserId(savedUserId);
        await fetchMyPoints(savedUserId);
      } else if (isMounted) {
        setLoadingProfile(false);
      }
    };

    initUser();
    return () => { isMounted = false; };
  }, []);

  // ============================================================
  // 2. Polling แต้มทุก 4 วินาที
  // ============================================================
  useEffect(() => {
    if (!currentFarmer) return;
    const timer = setInterval(() => { fetchMyPoints(currentFarmer.lineUserId); }, POLL_MS);
    return () => clearInterval(timer);
  }, [currentFarmer, fetchMyPoints]);

  // ============================================================
  // 3. โหลดข้อมูลตั๋ว (ถ้ามี ?token=)
  // ============================================================
  useEffect(() => {
    if (!token) { setTicketStatus("none"); return; }

    const fetchTicket = async () => {
      setTicketStatus("loading");
      try {
        const res = await fetch(`/api/tickets?token=${token}&t=${Date.now()}`, { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setTicketData(data);
          if (data.status === "CLAIMED" || data.isClaimed) setTicketStatus("already_claimed");
          else if (data.status === "EXPIRED") setTicketStatus("expired");
          else if (data.status === "VOIDED") setTicketStatus("voided");
          else setTicketStatus("valid");
          return;
        }
        setTicketStatus("invalid");
      } catch {
        setTicketStatus("invalid");
      }
    };
    void fetchTicket();
  }, [token]);

  // ============================================================
  // 4. รับแต้ม (ใช้ POST /api/claim ที่ตรวจ ownership)
  // ============================================================
  const handleClaim = async () => {
    if (!ticketData || !token) return;
    const uid = lineUserId || lineProfile?.userId || (typeof window !== "undefined" ? localStorage.getItem("CURRENT_FARMER_USER_ID") : null);
    if (!uid) {
      setErrorMessage("ไม่สามารถตรวจสอบบัญชี LINE ได้ กรุณาเปิดผ่าน LINE เท่านั้น");
      return;
    }

    setClaiming(true);
    setErrorMessage("");

    try {
      const res = await fetch("/api/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, lineUserId: uid }),
      });

      const result = await res.json();

      if (res.ok) {
        setTicketData((prev: any) => ({ ...prev, isClaimed: true, status: "CLAIMED" }));
        setClaimResult({ addedPoints: result.pointsAdded, totalPoints: result.newTotal });
        setTicketStatus("already_claimed");
        fetchMyPoints(uid);
      } else {
        setErrorMessage(result.message || "ไม่สามารถรับแต้มได้");
        // รีเฟรชสถานะตั๋ว
        const checkRes = await fetch(`/api/tickets?token=${token}&t=${Date.now()}`, { cache: "no-store" });
        if (checkRes.ok) {
          const updated = await checkRes.json();
          setTicketData(updated);
          if (updated.status === "CLAIMED") setTicketStatus("already_claimed");
        }
      }
    } catch (err: any) {
      setErrorMessage("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้: " + err.message);
    } finally {
      setClaiming(false);
    }
  };

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 p-4 md:p-6 flex flex-col items-center justify-center">
      <div className="max-w-md w-full space-y-4">

        {/* ===================== กรณีสแกน QR Code มาเพื่อรับแต้ม ===================== */}
        {token && (
          <div className="bg-white rounded-3xl p-6 shadow-xl border border-emerald-200">
            {ticketStatus === "loading" && (
              <div className="py-8 text-center text-slate-500">
                <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full mx-auto mb-2" />
                <p className="text-sm font-bold">กำลังตรวจสอบตั๋วชั่ง...</p>
              </div>
            )}

            {ticketStatus === "invalid" && (
              <div className="text-center py-6 text-red-600">
                <div className="text-4xl mb-2">⚠️</div>
                <h2 className="text-lg font-bold">ไม่พบ QR Code นี้ในระบบ</h2>
                <p className="text-xs text-slate-400 mt-1">รหัสไม่ถูกต้อง</p>
              </div>
            )}

            {ticketStatus === "expired" && (
              <div className="text-center py-6 text-orange-600">
                <div className="text-4xl mb-2">⏰</div>
                <h2 className="text-lg font-bold">QR Code นี้หมดอายุแล้ว</h2>
                <p className="text-xs text-slate-400 mt-1">ตั๋วหมดอายุ ไม่สามารถใช้งานได้</p>
              </div>
            )}

            {ticketStatus === "voided" && (
              <div className="text-center py-6 text-red-700">
                <div className="text-4xl mb-2">🚫</div>
                <h2 className="text-lg font-bold">QR Code นี้ถูกยกเลิก</h2>
                <p className="text-xs text-slate-400 mt-1">ตั๋วถูก void โดยเจ้าหน้าที่</p>
              </div>
            )}

            {ticketStatus === "valid" && ticketData && (
              <div className="text-center max-w-sm mx-auto">
                <span className="px-3 py-1 bg-amber-100 text-amber-800 text-xs font-bold rounded-full">
                  ตั๋วรับซื้ออ้อยถูกต้อง
                </span>
                <h2 className="text-xl font-black text-slate-800 mt-2">สะสมพ้อยท์ส่งอ้อย</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  ตั๋วออกให้: <b className="text-slate-800">{ticketData.farmerName}</b>
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  (เฉพาะบัญชี LINE ของคุณ {ticketData.farmerName} เท่านั้นที่กดรับแต้มนี้ได้)
                </p>

                <div className="my-4 p-4 bg-amber-50 rounded-2xl border border-amber-200">
                  <span className="text-xs text-amber-700">น้ำหนักอ้อย {ticketData.weightTons} ตัน</span>
                  <div className="text-4xl font-black text-amber-600 my-1 animate-pulse">+{ticketData.points}</div>
                  <span className="text-xs font-bold text-amber-800 uppercase tracking-widest">POINTS</span>
                </div>

                {ticketData.expiresAt && (
                  <p className="text-[11px] text-amber-700 font-bold mb-3">
                    ⏰ สแกนได้ภายใน 1 ชม. (หมดอายุเวลา {new Date(ticketData.expiresAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.)
                  </p>
                )}

                {errorMessage && (
                  <div className="mb-4 p-3 bg-red-50 text-red-600 text-xs rounded-xl border border-red-200">
                    ⚠️ {errorMessage}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleClaim}
                  disabled={claiming}
                  className={`w-full text-white font-bold py-3.5 rounded-2xl shadow-lg text-base transition-transform active:scale-95 flex items-center justify-center gap-2 ${
                    claiming ? "bg-gray-400 cursor-not-allowed" : "bg-[#06C755] hover:bg-[#05b34c]"
                  }`}
                >
                  {claiming ? "⏳ กำลังบันทึกแต้ม..." : "🎉 กดรับแต้มเข้ากระเป๋าทันที"}
                </button>
              </div>
            )}

            {ticketStatus === "already_claimed" && ticketData && (
              <div className="text-center max-w-sm mx-auto py-2">
                <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto text-2xl mb-2 font-bold">✓</div>
                <h2 className="text-xl font-black text-emerald-600">
                  {claimResult ? "รับแต้มสำเร็จ! 🎉" : "ตั๋วนี้รับแต้มไปแล้ว"}
                </h2>
                <p className="text-xs text-slate-500 mt-1 mb-3">
                  {claimResult ? "บันทึกแต้มเข้ากระเป๋าเรียบร้อยแล้ว" : "ตั๋วนี้ได้ถูกสะสมพ้อยท์ไปแล้ว ไม่สามารถสแกนซ้ำได้"}
                </p>

                {claimResult && (
                  <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-200 mb-3 text-xs text-emerald-800 space-y-1">
                    <div className="text-3xl font-black text-emerald-600 my-1">+{claimResult.addedPoints} pts</div>
                    <div className="flex justify-between border-t border-emerald-200 pt-1 mt-1 font-bold">
                      <span>คะแนนสะสมรวม:</span>
                      <span className="text-emerald-700 text-sm font-black">{claimResult.totalPoints} pts</span>
                    </div>
                  </div>
                )}

                <div className="bg-slate-50 p-3 rounded-xl border text-xs text-left space-y-1">
                  <div>ตั๋วออกให้: <b>{ticketData.farmerName}</b></div>
                  <div>เลขที่ตั๋ว: <b>{ticketData.ticketNo}</b></div>
                  <div>น้ำหนักอ้อย: <b>{ticketData.weightTons} ตัน</b></div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===================== กระเป๋าพ้อยท์ส่วนตัว ===================== */}
        <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-100">
          <div className="bg-gradient-to-r from-emerald-600 to-green-700 p-6 text-white text-center relative">
            <div className="flex items-center justify-center gap-1.5 absolute right-4 top-4 bg-black/20 px-2.5 py-1 rounded-full">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-300"></span>
              </span>
              <span className="text-[10px] font-bold tracking-wider">LIVE 4s</span>
            </div>

            <div className="w-20 h-20 rounded-full border-4 border-white/40 overflow-hidden mx-auto mt-2 mb-3 bg-emerald-800 shadow-md flex items-center justify-center">
              {currentFarmer?.linePictureUrl || lineProfile?.pictureUrl ? (
                <img src={currentFarmer?.linePictureUrl || lineProfile?.pictureUrl} alt="LINE Profile" className="w-full h-full object-cover" />
              ) : (
                <div className="text-3xl">🌾</div>
              )}
            </div>

            <h1 className="text-xl font-black">
              {currentFarmer?.fullName || lineProfile?.displayName || "กระเป๋าพ้อยท์ของฉัน"}
            </h1>
            <p className="text-xs text-emerald-100 mt-0.5">
              {currentFarmer ? `เบอร์โทร: ${currentFarmer.phone}` : "เชื่อมต่อกับบัญชี LINE อัตโนมัติ"}
            </p>
          </div>

          <div className="p-6">
            {loadingProfile && (
              <div className="py-10 text-center text-slate-500">
                <div className="animate-spin w-9 h-9 border-4 border-emerald-500 border-t-transparent rounded-full mx-auto mb-3" />
                <p className="text-sm font-bold text-slate-700">{statusMessage}</p>
                <p className="text-xs text-slate-400 mt-1">กำลังดึงคะแนนพ้อยท์ส่วนบุคคล</p>
              </div>
            )}

            {!loadingProfile && currentFarmer && (
              <div className="space-y-4">
                <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-3xl p-6 text-center shadow-sm">
                  <span className="text-xs font-bold text-amber-700 uppercase tracking-wider">ยอดพ้อยท์สะสมปัจจุบัน</span>
                  <div className="text-5xl font-black text-amber-600 my-2 animate-pulse">
                    {(currentFarmer.points ?? 0).toLocaleString()}
                  </div>
                  <span className="inline-block bg-amber-500 text-white font-bold text-xs px-3.5 py-1 rounded-full shadow-sm">⭐ POINTS</span>
                </div>

                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 text-xs space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-500">ชื่อ - นามสกุล:</span>
                    <span className="font-bold text-slate-800">{currentFarmer.fullName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">เบอร์โทรศัพท์:</span>
                    <span className="font-bold text-slate-800">{currentFarmer.phone}</span>
                  </div>
                  {currentFarmer.lineDisplayName && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">ชื่อบัญชี LINE:</span>
                      <span className="font-bold text-slate-800">{currentFarmer.lineDisplayName}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-slate-200 pt-2 mt-2">
                    <span className="text-slate-500">สถานะ:</span>
                    <span className="text-emerald-700 font-bold flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                      ซิงก์กับ LINE เรียบร้อยแล้ว
                    </span>
                  </div>
                </div>

                <div className="text-center text-[11px] text-slate-400">
                  {lastUpdated && `อัปเดตล่าสุด: ${lastUpdated.toLocaleTimeString("th-TH")}`}
                </div>
              </div>
            )}

            {!loadingProfile && !currentFarmer && (
              <div className="text-center py-4 space-y-4">
                <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto text-3xl">📝</div>
                <div>
                  <h3 className="text-base font-black text-slate-800">
                    {lineProfile ? `สวัสดีคุณ ${lineProfile.displayName}` : "ยังไม่พบข้อมูลสมาชิก"}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto leading-relaxed">
                    บัญชี LINE นี้ยังไม่ได้ลงทะเบียนในระบบรับซื้ออ้อย กรุณากดลงทะเบียนเพื่อเริ่มสะสมพ้อยท์
                  </p>
                </div>
                <Link href="/register"
                  className="inline-block w-full bg-[#06C755] hover:bg-[#05b34c] text-white font-bold py-3.5 rounded-2xl shadow-lg transition text-sm">
                  🌾 กดลงทะเบียนสมาชิก
                </Link>
              </div>
            )}
          </div>

          <div className="bg-slate-50 p-3.5 border-t border-slate-100 text-center text-[11px] text-slate-400">
            ระบบความปลอดภัยส่วนบุคคล: ซิงก์เฉพาะข้อมูลบัญชี LINE ของท่าน
          </div>
        </div>

      </div>
    </div>
  );
}

export default function ClaimPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-500">กำลังโหลด...</div>}>
      <ClaimContent />
    </Suspense>
  );
}

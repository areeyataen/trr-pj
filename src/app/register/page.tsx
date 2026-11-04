"use client";

import { useEffect, useState } from "react";

const MY_LIFF_ID = "2012344285-05lfEnJt";

interface ExistingFarmer {
  fullName: string;
  phone: string;
  points: number;
  lineDisplayName?: string;
  linePictureUrl?: string;
}

export default function LineRegisterPage() {
  const [loading, setLoading] = useState(true);
  const [lineProfile, setLineProfile] = useState<{
    userId: string;
    displayName: string;
    pictureUrl: string;
  }>({
    userId: "",
    displayName: "สมาชิกชาวไร่",
    pictureUrl: "",
  });

  // สถานะว่าบัญชีนี้เคยลงทะเบียนไปแล้วหรือไม่
  const [alreadyRegisteredFarmer, setAlreadyRegisteredFarmer] = useState<ExistingFarmer | null>(null);

  // ฟอร์มข้อมูลที่ชาวไร่ต้องกรอกเพิ่ม
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);

  // สถานะแจ้งเตือนบนหน้าจอ
  const [submitting, setSubmitting] = useState(false);
  const [serverMessage, setServerMessage] = useState("");
  const [statusNotice, setStatusNotice] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  useEffect(() => {
    let isMounted = true;

    const checkAndInitLiff = async () => {
      setLoading(true);
      try {
        const liff = (await import("@line/liff")).default;

        // ดัก Timeout 4 วินาที
        const initPromise = liff.init({ liffId: MY_LIFF_ID });
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), 4000)
        );

        await Promise.race([initPromise, timeoutPromise]);

        if (!isMounted) return;

        let currentUserId = "";
        let currentDisplayName = "สมาชิกชาวไร่";
        let currentPictureUrl = "";

        if (liff.isLoggedIn()) {
          const profile = await liff.getProfile();
          currentUserId = profile.userId;
          currentDisplayName = profile.displayName;
          currentPictureUrl = profile.pictureUrl || "";
        } else {
          currentUserId = (typeof window !== "undefined" ? localStorage.getItem("CURRENT_FARMER_USER_ID") : "") || ("U_LINE_" + Math.floor(100000 + Math.random() * 900000));
        }

        if (isMounted) {
          setLineProfile({
            userId: currentUserId,
            displayName: currentDisplayName,
            pictureUrl: currentPictureUrl,
          });

          // ตรวจสอบกับ Database ทันทีว่า lineUserId นี้เคยลงทะเบียนไว้แล้วหรือยัง
          if (currentUserId) {
            try {
              const res = await fetch(`/api/farmers?t=${Date.now()}`, { cache: "no-store" });
              if (res.ok) {
                const list = await res.json();
                const found = Array.isArray(list) ? list.find((f: any) => f.lineUserId === currentUserId) : null;
                if (found && isMounted) {
                  setAlreadyRegisteredFarmer(found);
                }
              }
            } catch (err) {
              console.error("Check existing user error:", err);
            }
          }
        }
      } catch (err: any) {
        if (!isMounted) return;
        const randomId = (typeof window !== "undefined" ? localStorage.getItem("CURRENT_FARMER_USER_ID") : "") || ("U_USER_" + Math.floor(100000 + Math.random() * 900000));
        setLineProfile((prev) => ({
          ...prev,
          userId: randomId,
        }));
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    checkAndInitLiff();

    return () => {
      isMounted = false;
    };
  }, []);

  // เมื่อกดปุ่ม "ยืนยันการลงทะเบียน"
  const handleRegisterClick = async () => {
    setStatusNotice(null);

    // ตรวจสอบข้อมูลก่อนส่ง
    if (!fullName.trim()) {
      setStatusNotice({ type: "error", text: "⚠️ กรุณากรอกชื่อ - นามสกุลจริง" });
      return;
    }
    if (!/^[\u0E00-\u0E7F\s]+$/.test(fullName.trim())) {
      setStatusNotice({ type: "error", text: "⚠️ กรุณากรอกชื่อ - นามสกุลเป็นภาษาไทยเท่านั้น" });
      return;
    }
    if (!phone.trim()) {
      setStatusNotice({ type: "error", text: "⚠️ กรุณากรอกเบอร์โทรศัพท์" });
      return;
    }
    if (!/^\d{10}$/.test(phone)) {
      setStatusNotice({ type: "error", text: "⚠️ เบอร์โทรศัพท์ต้องเป็นตัวเลข 10 หลักเท่านั้น" });
      return;
    }

    setSubmitting(true);
    setStatusNotice({ type: "info", text: "⏳ กำลังส่งข้อมูลไปยังเซิร์ฟเวอร์..." });

    const payload = {
      lineUserId: lineProfile.userId || ("U_FALLBACK_" + Date.now()),
      lineDisplayName: lineProfile.displayName,
      linePictureUrl: lineProfile.pictureUrl,
      fullName: fullName.trim(),
      phone: phone.trim(),
      idCard: "",
      quotaNumber: "",
      userRole: "ชาวไร่",
    };

    try {
      const res = await fetch("/api/farmers/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        if (data.alreadyRegistered) {
          // บัญชีนี้เคยลงทะเบียนไปแล้ว
          setAlreadyRegisteredFarmer(data.farmer);
          return;
        }

        const successMsg = data.message || "ลงทะเบียนสำเร็จ ได้รับโบนัส 100 พ้อยท์!";
        setServerMessage(successMsg);
        setStatusNotice({ type: "success", text: "🎉 " + successMsg });
        setIsSuccess(true);
        // บันทึก User ปัจจุบันไว้ในเครื่อง
        try {
          localStorage.setItem("CURRENT_FARMER_USER_ID", payload.lineUserId);
          localStorage.setItem("CURRENT_FARMER_PHONE", payload.phone);
          localStorage.setItem("CURRENT_FARMER_NAME", payload.fullName);
        } catch {}
      } else {
        const errorMsg = data.message || `เซิร์ฟเวอร์ตอบกลับผิดพลาด (HTTP ${res.status})`;
        setStatusNotice({ type: "error", text: "❌ " + errorMsg });
      }
    } catch (err: any) {
      console.error("Submit error:", err);
      const networkError = "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้: " + (err.message || "Network Error");
      setStatusNotice({ type: "error", text: "❌ " + networkError });
    } finally {
      setSubmitting(false);
    }
  };

  // 1. หน้าจอเมื่อ "ผู้ใช้บัญชี LINE นี้ลงทะเบียนไปแล้ว" (1 บัญชีลงได้ 1 ครั้ง)
  if (!loading && alreadyRegisteredFarmer) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white p-7 rounded-3xl shadow-xl text-center border border-amber-200">
          <div className="w-20 h-20 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-3 text-4xl shadow-sm">
            👤
          </div>

          <span className="inline-block bg-amber-100 text-amber-800 text-xs font-bold px-3 py-1 rounded-full mb-2">
            บัญชีนี้ลงทะเบียนแล้ว
          </span>

          <h2 className="text-xl font-black text-slate-800 mb-1">
            ผู้ใช้ได้ลงทะเบียนไปแล้ว
          </h2>
          <p className="text-xs text-red-500 font-bold mb-5">
            (1 บัญชี LINE สามารถลงทะเบียนได้ 1 ครั้งเท่านั้น)
          </p>

          {/* กล่องรายละเอียดสมาชิก */}
          <div className="bg-slate-50 p-4 rounded-2xl text-left text-xs space-y-2.5 border border-slate-200">
            <div className="flex justify-between items-center">
              <span className="text-slate-500">ชื่อ - นามสกุล:</span>
              <span className="font-bold text-slate-800 text-sm">{alreadyRegisteredFarmer.fullName}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">เบอร์โทรศัพท์:</span>
              <span className="font-bold text-slate-800">{alreadyRegisteredFarmer.phone}</span>
            </div>
            {alreadyRegisteredFarmer.lineDisplayName && (
              <div className="flex justify-between items-center">
                <span className="text-slate-500">บัญชี LINE:</span>
                <span className="font-bold text-emerald-700">{alreadyRegisteredFarmer.lineDisplayName}</span>
              </div>
            )}
            <div className="flex justify-between items-center border-t border-slate-200 pt-2 mt-2">
              <span className="text-slate-500">พ้อยท์สะสมปัจจุบัน:</span>
              <span className="font-black text-amber-600 text-sm">⭐ {(alreadyRegisteredFarmer.points ?? 0).toLocaleString()} pts</span>
            </div>
          </div>

          <div className="mt-6 space-y-2">
            <button
              type="button"
              onClick={async () => {
                try {
                  const liff = (await import("@line/liff")).default;
                  if (liff.isInClient()) {
                    liff.closeWindow();
                  }
                } catch {}
              }}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-2xl shadow transition text-sm flex items-center justify-center gap-1.5"
            >
              <span>✕</span>
              <span>ปิดหน้าต่างนี้กลับไปที่ LINE</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. หน้าจอเมื่อลงทะเบียนเพิ่งสำเร็จ
  if (isSuccess) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white p-8 rounded-3xl shadow-xl text-center border">
          <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4 text-4xl">
            ✓
          </div>
          <h2 className="text-2xl font-black text-slate-800 mb-2">
            {serverMessage ? serverMessage : "ลงทะเบียนสำเร็จ!"}
          </h2>
          <p className="text-sm text-slate-500 mb-6">
            ข้อมูลถูกบันทึกลงฐานข้อมูลและผูกกับบัญชี LINE เรียบร้อยแล้ว
          </p>

          <div className="bg-slate-50 p-4 rounded-2xl text-left text-sm space-y-2 border">
            <div className="flex justify-between">
              <span className="text-slate-500">ชื่อผู้ลงทะเบียน:</span>
              <span className="font-bold text-slate-800">{fullName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">เบอร์โทรศัพท์:</span>
              <span className="font-bold text-slate-800">{phone}</span>
            </div>
          </div>

          <div className="mt-6 space-y-2">
            <button
              type="button"
              onClick={async () => {
                try {
                  const liff = (await import("@line/liff")).default;
                  if (liff.isInClient()) {
                    liff.closeWindow();
                  }
                } catch {}
              }}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-2xl shadow transition text-sm"
            >
              ✕ ปิดหน้าต่างนี้กลับไปที่ LINE
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 3. ฟอร์มลงทะเบียน (กรณีบัญชียังไม่เคยลงทะเบียน)
  return (
    <div className="min-h-screen bg-emerald-950/5 flex flex-col justify-center items-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-emerald-100 overflow-hidden">
        
        {/* แถบหัวกระดาษ: โชว์ข้อมูลที่ดึงมาจาก LINE จริง */}
        <div className="bg-emerald-600 p-6 text-white text-center relative">
          <div className="w-16 h-16 rounded-full border-4 border-white/30 overflow-hidden mx-auto mb-2 bg-emerald-800 shadow">
            {lineProfile.pictureUrl ? (
              <img
                src={lineProfile.pictureUrl}
                alt="Profile"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-2xl font-bold">
                🌾
              </div>
            )}
          </div>
          <h1 className="text-lg font-bold">ลงทะเบียนสมาชิกชาวไร่</h1>
          <p className="text-xs text-emerald-100 mt-0.5">
            เชื่อมต่อกับบัญชี LINE:{" "}
            <span className="font-semibold underline">
              {loading ? "กำลังตรวจสอบ..." : lineProfile.displayName}
            </span>
          </p>
          {lineProfile.userId && (
            <span className="inline-block mt-2 px-2.5 py-0.5 bg-emerald-700/60 rounded-full text-[10px] text-emerald-200 font-mono">
              LINE ID: {lineProfile.userId.substring(0, 10)}...
            </span>
          )}
        </div>

        {/* ฟอร์มกรอกข้อมูล */}
        <div className="p-6 space-y-4">
          
          {/* กล่องแสดงสถานะ / แจ้งเตือนบนหน้าจอ */}
          {statusNotice && (
            <div
              className={`p-3 rounded-xl text-xs font-semibold border ${
                statusNotice.type === "error"
                  ? "bg-red-50 text-red-700 border-red-200"
                  : statusNotice.type === "success"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-blue-50 text-blue-700 border-blue-200"
              }`}
            >
              {statusNotice.text}
            </div>
          )}
          
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              ชื่อ - นามสกุลจริง(ภาษาไทย) <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="เช่น สมหมาย มั่นคง"
              value={fullName}
              onChange={(e) => setFullName(e.target.value.replace(/[^\u0E00-\u0E7F\s]/g, ""))}
              className="w-full border rounded-xl p-3 text-sm border-slate-200 text-slate-950 focus:outline-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              เบอร์โทรศัพท์ <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              inputMode="numeric"
              pattern="[0-9]{10}"
              maxLength={10}
              placeholder="0812345678"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              className="w-full border rounded-xl p-3 text-sm border-slate-200 text-slate-950 focus:outline-emerald-500"
            />
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={handleRegisterClick}
              disabled={submitting || loading}
              className={`w-full text-white font-bold py-3.5 rounded-xl shadow-md transition-colors text-base flex items-center justify-center gap-2 ${
                submitting || loading ? "bg-gray-400 cursor-not-allowed" : "bg-[#06C755] hover:bg-[#05b34c]"
              }`}
            >
              <span>{submitting ? "⏳ กำลังบันทึกข้อมูล..." : "ยืนยันการลงทะเบียนผ่าน LINE"}</span>
            </button>
          </div>

          <p className="text-[11px] text-slate-400 text-center">
            1 บัญชี LINE สามารถลงทะเบียนได้ 1 ครั้งเท่านั้น
          </p>

          {/* ข้อความแจ้งเตือนตามหลัก PDPA / นโยบายความเป็นส่วนตัว */}
          <div className="pt-2 border-t border-slate-100 text-[10px] text-slate-400 text-center leading-relaxed">
            🔒 ข้อมูลชื่อและรูปโปรไฟล์ LINE ของท่าน จะถูกนำมาใช้เพื่อการแสดงผลและยืนยันตัวตนในระบบสะสมแต้มชาวไร่เท่านั้น โดยไม่มีการเปิดเผยต่อสาธารณะ
          </div>

        </div>

      </div>
    </div>
  );
}
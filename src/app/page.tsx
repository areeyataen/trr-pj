"use client";

import Link from "next/link";
import { useSession, signIn, signOut } from "next-auth/react";

export default function HomePage() {
  const { data: session, status } = useSession();
  const isAdmin = (session?.user as any)?.role === "admin";

  // เมนูสำหรับทุกคน (ไม่ต้อง login)
  const publicMenus = [
    {
      title: "ลงทะเบียนสมาชิกผ่าน LINE ",
      desc: "สำหรับสมัครสมาชิก",
      href: "/register",
      tag: "LINE OA",
      tagColor: "bg-emerald-600",
      icon: "💬",
    },
    {
      title: "คะแนนสะสม Real-time & สแกนรับแต้ม (Claim)",
      desc: "ดูแต้มสะสมชาวไร่อัปเดตสดแบบ Real-time และกดรับแต้มผ่าน QR Code ใบชั่ง",
      href: "/claim",
      tag: "Live Points",
      tagColor: "bg-blue-600",
      icon: "⭐",
    },
  ];

  // เมนูสำหรับ Admin เท่านั้น
  const adminMenus = [
    {
      title: "ออก QR สะสมพ้อยท์",
      desc: "คิดเงินตามน้ำหนักตันจริง และออก One-Time QR Code เฉพาะรายบุคคล",
      href: "/admin/weigh-slip",
      tag: "แนะนำ",
      tagColor: "bg-amber-500",
      icon: "⚖️",
    },
    {
      title: "แดชบอร์ดคะแนนทั้งหมด",
      desc: "ดูคะแนนสะสมของชาวไร่ทุกคน อัปเดตอัตโนมัติทุก 5 วินาที",
      href: "/admin/points",
      tag: "Live",
      tagColor: "bg-green-600",
      icon: "🟢",
    },
    {
      title: "จัดการผู้ใช้ & ชาวไร่ ",
      desc: "ดูข้อมูล เพิ่ม ลบ แก้ไข และปรับแต้มสะสมในฐานข้อมูล",
      href: "/admin/farmers",
      tag: "Database",
      tagColor: "bg-purple-600",
      icon: "🌾",
    },
  ];

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4 md:p-8">
      <div className="max-w-2xl w-full">

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-black text-slate-800">
            ระบบรับซื้ออ้อย & สะสมพ้อยท์ LINE
          </h1>
         
        </div>

        {/* Status bar */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-3 mb-6 flex items-center justify-between">
          {status === "loading" ? (
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <div className="animate-spin w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full" />
              กำลังโหลด...
            </div>
          ) : isAdmin ? (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-700">
                👑 เข้าสู่ระบบในฐานะ <span className="text-green-700 font-bold">Admin</span>
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500">ยังไม่ได้เข้าสู่ระบบ (Admin)</span>
            </div>
          )}

          {isAdmin ? (
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="text-xs px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 font-bold rounded-lg transition"
            >
              🚪 ออกจากระบบ
            </button>
          ) : (
            <button
              onClick={() => signIn(undefined, { callbackUrl: "/" })}
              className="text-xs px-3 py-1.5 bg-green-700 hover:bg-green-800 text-white font-bold rounded-lg transition"
            >
              🔑 Admin Login
            </button>
          )}
        </div>

        {/* Public menus — แสดงเฉพาะเมื่อยังไม่ได้ล็อกอินเป็น Admin */}
        {!isAdmin && (
          <div className="space-y-3 mb-4">
            {publicMenus.map((m, idx) => (
              <Link
                key={idx}
                href={m.href}
                className="block bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-emerald-400 transition-all group"
              >
                <div className="flex items-start gap-4">
                  <div className="text-3xl p-3 bg-slate-50 rounded-xl group-hover:bg-emerald-50 transition-colors">
                    {m.icon}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-slate-800 group-hover:text-emerald-700 transition-colors">
                        {m.title}
                      </h2>
                      <span className={`text-[10px] text-white px-2 py-0.5 rounded-full font-bold ${m.tagColor}`}>
                        {m.tag}
                      </span>
                    </div>
                    <p className="text-slate-500 text-xs mt-1 leading-relaxed">{m.desc}</p>
                  </div>
                  <div className="text-slate-400 group-hover:text-emerald-600 font-bold text-lg">→</div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Admin menus — เห็นเฉพาะ Admin */}
        {isAdmin && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-1">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="text-xs text-slate-400 font-medium">เมนู Admin</span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>

            {adminMenus.map((m, idx) => (
              <Link
                key={idx}
                href={m.href}
                className="block bg-white p-5 rounded-2xl border border-purple-100 shadow-sm hover:shadow-md hover:border-purple-400 transition-all group"
              >
                <div className="flex items-start gap-4">
                  <div className="text-3xl p-3 bg-purple-50 rounded-xl group-hover:bg-purple-100 transition-colors">
                    {m.icon}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-slate-800 group-hover:text-purple-700 transition-colors">
                        {m.title}
                      </h2>
                      <span className={`text-[10px] text-white px-2 py-0.5 rounded-full font-bold ${m.tagColor}`}>
                        {m.tag}
                      </span>
                    </div>
                    <p className="text-slate-500 text-xs mt-1 leading-relaxed">{m.desc}</p>
                  </div>
                  <div className="text-slate-400 group-hover:text-purple-600 font-bold text-lg">→</div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-8 text-xs text-slate-400">
          {isAdmin
            ? "คุณมีสิทธิ์เข้าถึงทุกหน้าในระบบ"
            : "กด Admin Login เพื่อเข้าถึงระบบหลังบ้าน"}
        </div>
      </div>
    </div>
  );
}

"use client";
import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <div className="min-h-screen bg-red-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow p-8 text-center max-w-sm">
        <div className="text-5xl mb-4">🚫</div>
        <h1 className="text-xl font-bold text-red-700 mb-2">ไม่มีสิทธิ์เข้าถึง</h1>
        <p className="text-gray-500 text-sm mb-6">
          หน้านี้สำหรับผู้ดูแลระบบเท่านั้น กรุณาเข้าสู่ระบบด้วยบัญชี Admin
        </p>
        <Link
          href="/login"
          className="inline-block bg-green-700 text-white px-6 py-2 rounded-xl font-medium hover:bg-green-800 transition"
        >
          ไปหน้า Login
        </Link>
      </div>
    </div>
  );
}

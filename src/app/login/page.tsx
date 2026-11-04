"use client";

import { Suspense, useState, useEffect } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/admin/farmers";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // If already logged in, redirect
  useEffect(() => {
    if (status === "authenticated") {
      router.replace(callbackUrl);
    }
  }, [status, router, callbackUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signIn("credentials", {
      redirect: false,
      email,
      password,
    });

    setLoading(false);

    if (result?.error) {
      setError("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
    } else {
      router.push(callbackUrl);
    }
  };

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="animate-spin w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Email
        </label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="อีเมล"
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 text-slate-800 placeholder-gray-950/35 focus:ring-green-400 focus:border-transparent"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Password
        </label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="รหัสผ่าน"
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 text-slate-800 placeholder-gray-950/35 focus:ring-green-400 focus:border-transparent"
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">
          ❌ {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-green-700 hover:bg-green-800 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition"
      >
        {loading ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🌾</div>
          <h1 className="text-2xl font-bold text-green-800">Admin Login</h1>
          <p className="text-sm text-gray-500 mt-1">ระบบรับซื้ออ้อย — เฉพาะผู้ดูแลระบบ</p>
        </div>

        {/* Form wrapped in Suspense (required for useSearchParams) */}
        <Suspense
          fallback={
            <div className="flex items-center justify-center h-40">
              <div className="animate-spin w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full" />
            </div>
          }
        >
          <LoginForm />
        </Suspense>

        <p className="text-center text-xs text-gray-400 mt-6">
          หน้านี้สำหรับแอดมินเท่านั้น
        </p>
      </div>
    </div>
  );
}

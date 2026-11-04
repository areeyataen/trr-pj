"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

interface Farmer {
  _id?: string;
  id?: string;
  lineUserId?: string;
  fullName: string;
  phone: string;
  points: number;
  lineDisplayName?: string;
  linePictureUrl?: string;
}

const POLL_MS = 5_000;

export default function PointsPage() {
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"points" | "name">("points");

  const fetchFarmers = useCallback(async () => {
    try {
      const resp = await fetch(`/api/farmers?t=${Date.now()}`, { cache: "no-store" });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data: Farmer[] = await resp.json();
      setFarmers(data);
      setError(null);
      setLastUpdated(new Date());
    } catch (e: any) {
      setError(e.message ?? "เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFarmers();
    const timer = setInterval(fetchFarmers, POLL_MS);
    return () => clearInterval(timer);
  }, [fetchFarmers]);

  const filtered = farmers
    .filter((f) =>
      f.fullName.toLowerCase().includes(search.toLowerCase()) ||
      f.phone.includes(search)
    )
    .sort((a, b) =>
      sortBy === "points" ? (b.points ?? 0) - (a.points ?? 0) : a.fullName.localeCompare(b.fullName)
    );

  const totalPoints = farmers.reduce((sum, f) => sum + (f.points ?? 0), 0);
  const topFarmer = [...farmers].sort((a, b) => (b.points ?? 0) - (a.points ?? 0))[0];

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 p-4">
      {/* Header */}
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
               <Link href="/" className="text-xs text-emerald-600 font-bold hover:underline mb-1 inline-block">
                ← กลับหน้าหลัก
              </Link>
              <h1 className="text-2xl font-bold text-green-800 flex items-center gap-2">
                🌾 แดชบอร์ดคะแนนสะสมพ้อย
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                อัปเดตทุก {POLL_MS / 1000} วินาที
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* Pulse indicator */}
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
              </span>
              <span className="text-sm text-green-600 font-medium">Live</span>
            </div>
          </div>

          {lastUpdated && (
            <p className="text-xs text-gray-400 mt-2">
              อัปเดตล่าสุด: {lastUpdated.toLocaleTimeString("th-TH")}
            </p>
          )}
        </div>

        {/* Stats Cards */}
        {!loading && !error && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-xl shadow p-4 text-center">
              <p className="text-3xl font-bold text-green-700">{farmers.length}</p>
              <p className="text-sm text-gray-500 mt-1">เกษตรกรทั้งหมด</p>
            </div>
            <div className="bg-white rounded-xl shadow p-4 text-center">
              <p className="text-3xl font-bold text-amber-500">{totalPoints.toLocaleString()}</p>
              <p className="text-sm text-gray-500 mt-1">คะแนนรวมทั้งหมด</p>
            </div>
            <div className="bg-white rounded-xl shadow p-4 text-center">
              <p className="text-lg font-bold text-blue-700 truncate">{topFarmer?.fullName ?? "-"}</p>
              <p className="text-sm text-gray-500 mt-1">
                🏆 คะแนนสูงสุด: {topFarmer?.points?.toLocaleString() ?? 0} pt
              </p>
            </div>
          </div>
        )}

        {/* Search & Sort */}
        {!loading && !error && (
          <div className="bg-white rounded-xl shadow p-4 mb-4 flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              placeholder="ค้นหาชื่อหรือเบอร์โทร..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-800 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-green-400"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setSortBy("points")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  sortBy === "points"
                    ? "bg-green-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                เรียงตามคะแนน
              </button>
              <button
                onClick={() => setSortBy("name")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  sortBy === "name"
                    ? "bg-green-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                เรียงตามชื่อ
              </button>
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="bg-white rounded-xl shadow p-12 text-center">
            <div className="animate-spin w-10 h-10 border-4 border-green-500 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-gray-500">กำลังโหลดข้อมูล…</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
            <p className="text-red-600 font-medium">❌ โหลดข้อมูลไม่สำเร็จ: {error}</p>
            <button
              onClick={fetchFarmers}
              className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700"
            >
              ลองอีกครั้ง
            </button>
          </div>
        )}

        {/* Table */}
        {!loading && !error && (
          <div className="bg-white rounded-xl shadow overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-green-700 text-white">
                <tr>
                  <th className="p-3">#</th>
                  <th className="p-3">เกษตรกร</th>
                  <th className="p-3 hidden sm:table-cell">เบอร์โทร</th>
                  <th className="p-3 text-right">คะแนน</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((f, i) => {
                  const rank = i + 1;
                  const medal =
                    rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null;
                  return (
                    <tr
                      key={f._id ?? f.id ?? f.lineUserId ?? i}
                      className={`border-b last:border-0 transition hover:bg-green-50 ${
                        i % 2 === 0 ? "bg-white" : "bg-gray-50"
                      }`}
                    >
                      <td className="p-3 text-gray-400">{medal ?? rank}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          {f.linePictureUrl ? (
                            <img
                              src={f.linePictureUrl}
                              alt=""
                              className="w-8 h-8 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-green-200 flex items-center justify-center text-green-700 font-bold text-xs">
                              {f.fullName.charAt(0)}
                            </div>
                          )}
                          <div>
                            <p className="font-medium text-gray-800">{f.fullName}</p>
                            {f.lineDisplayName && (
                              <p className="text-xs text-gray-400">{f.lineDisplayName}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="p-3 text-gray-600 hidden sm:table-cell">{f.phone}</td>
                      <td className="p-3 text-right">
                        <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-700 font-bold px-3 py-1 rounded-full text-sm">
                          ⭐ {(f.points ?? 0).toLocaleString()}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-gray-400">
                      ไม่พบข้อมูล
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

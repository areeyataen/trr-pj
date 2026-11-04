"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";

export const dynamic = "force-dynamic";

interface Farmer {
  id: string | number;
  _id?: string;
  lineUserId: string;
  lineDisplayName: string;
  linePictureUrl?: string;
  fullName: string;
  phone: string;
  points: number;
  createdAt: string;
}

export default function FarmersListPage() {
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Modals state
  const [selectedFarmer, setSelectedFarmer] = useState<Farmer | null>(null);
  const [editingFarmer, setEditingFarmer] = useState<Farmer | null>(null);
  const [deletingFarmer, setDeletingFarmer] = useState<Farmer | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Add Form state
  const [addFullName, setAddFullName] = useState("");
  const [addPhone, setAddPhone] = useState("");
  const [addPoints, setAddPoints] = useState<number>(100);

  // Edit Form state
  const [editFullName, setEditFullName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editPoints, setEditPoints] = useState<number>(0);

  // แจ้งเตือนแบบ Auto-hide
  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  const fetchFarmers = async () => {
    try {
      const res = await fetch("/api/farmers?t=" + Date.now(), { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setFarmers(data);
      } else {
        setError("ไม่สามารถดึงข้อมูลได้ (Status: " + res.status + ")");
      }
    } catch {
      setError("ไม่สามารถเชื่อมต่อฐานข้อมูลได้");
    } finally {
      setLoading(false);
    }
  };

  const refreshFarmers = () => {
    setLoading(true);
    setError("");
    void fetchFarmers();
  };

  useEffect(() => {
    void Promise.resolve().then(fetchFarmers);
  }, []);

  // เมื่อเปิด Modal แก้ไข
  const openEditModal = (f: Farmer) => {
    setEditingFarmer(f);
    setEditFullName(f.fullName || "");
    setEditPhone(f.phone || "");
    setEditPoints(typeof f.points === "number" ? f.points : 0);
  };


  // ดำเนินการบันทึกการแก้ไข
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFarmer) return;

    if (!editFullName.trim() || !editPhone.trim()) {
      showToast("error", "กรุณากรอกชื่อ-นามสกุล และเบอร์โทรศัพท์");
      return;
    }

    setActionLoading(true);
    const targetId = editingFarmer._id || editingFarmer.id;

    try {
      const res = await fetch("/api/farmers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: targetId,
          fullName: editFullName.trim(),
          phone: editPhone.trim(),
          points: Number(editPoints) || 0,
        }),
      });

      if (res.ok) {
        showToast("success", `แก้ไขข้อมูล "${editFullName.trim()}" เรียบร้อย`);
        setEditingFarmer(null);
        await fetchFarmers();
      } else {
        const errData = await res.json().catch(() => ({}));
        showToast("error", errData.message || "เกิดข้อผิดพลาดในการแก้ไข");
      }
    } catch (err: any) {
      showToast("error", "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // ดำเนินการลบผู้ใช้
  const handleDeleteConfirm = async () => {
    if (!deletingFarmer) return;

    setActionLoading(true);
    const targetId = deletingFarmer._id || deletingFarmer.id;

    try {
      const res = await fetch(`/api/farmers?id=${targetId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        showToast("success", `ลบข้อมูลผู้ใช้ "${deletingFarmer.fullName}" เรียบร้อยแล้ว`);
        setDeletingFarmer(null);
        await fetchFarmers();
      } else {
        const errData = await res.json().catch(() => ({}));
        showToast("error", errData.message || "ไม่สามารถลบข้อมูลได้");
      }
    } catch (err: any) {
      showToast("error", "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // ระบบค้นหาและกรอง
  const filteredFarmers = useMemo(() => {
    if (!searchQuery.trim()) return farmers;
    const query = searchQuery.toLowerCase().trim();
    return farmers.filter((f) => {
      const nameMatch = (f.fullName || "").toLowerCase().includes(query);
      const phoneMatch = (f.phone || "").includes(query);
      const lineMatch = (f.lineDisplayName || "").toLowerCase().includes(query);
      return nameMatch || phoneMatch || lineMatch;
    });
  }, [farmers, searchQuery]);

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        
        {/* Toast Alert */}
        {toast && (
          <div className="fixed top-5 right-5 z-[100] animate-bounce">
            <div
              className={`px-5 py-3 rounded-2xl shadow-xl text-sm font-bold flex items-center gap-3 border ${
                toast.type === "success"
                  ? "bg-emerald-600 text-white border-emerald-500"
                  : "bg-red-600 text-white border-red-500"
              }`}
            >
              <span>{toast.type === "success" ? "✓" : "⚠️"}</span>
              <span>{toast.message}</span>
            </div>
          </div>
        )}

        {/* แถบหัวกระดาษ */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm mb-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <Link href="/" className="text-xs text-emerald-600 font-bold hover:underline mb-1 inline-block">
                ← กลับหน้าหลัก
              </Link>
              <h1 className="text-2xl font-black text-slate-800 flex items-center justify-center gap-2">
                🌾 ระบบจัดการผู้ใช้และชาวไร่ 
              </h1>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={refreshFarmers}
                className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 font-bold text-xs rounded-xl transition flex items-center gap-1"
              >
                <span>🔄</span>
                <span>รีเฟรช</span>
              </button>
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="px-3.5 py-2.5 bg-red-100 hover:bg-red-200 active:scale-95 text-red-700 font-bold text-xs rounded-xl transition flex items-center gap-1"
              >
                <span>🚪</span>
                <span>ออกจากระบบ</span>
              </button>
            </div>
          </div>

          {/* ค้นหา และ สรุปยอด */}
          <div className="mt-5 pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <span className="absolute left-3.5 top-2.5 text-slate-400 text-sm">🔍</span>
              <input
                type="text"
                placeholder="ค้นหาชื่อ, เบอร์โทร..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border rounded-xl text-xs bg-slate-50 border-slate-200 placeholder:text-slate-500 text-slate-800 focus:outline-emerald-500 focus:bg-white transition"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-slate-600 font-bold"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex items-center gap-4 text-right">
              <div>
                <span className="text-[11px] text-slate-400">ค้นพบ</span>
                <div className="text-lg font-black text-slate-700">{filteredFarmers.length} คน</div>
              </div>
              <div className="h-7 w-[1px] bg-slate-200" />
              <div>
                <span className="text-[11px] text-slate-400">สมาชิกทั้งหมด</span>
                <div className="text-lg font-black text-emerald-600">{farmers.length} คน</div>
              </div>
            </div>
          </div>
        </div>

        {/* กรณีมี Error */}
        {error && (
          <div className="bg-amber-50 border border-amber-300 text-amber-800 p-4 rounded-2xl mb-6 text-sm flex items-center gap-3">
            <span className="text-xl">⚠️</span>
            <div>
              <p className="font-bold">{error}</p>
            </div>
          </div>
        )}

        {/* ตารางรายชื่อชาวไร่ */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-16 text-center text-slate-400">
              <div className="animate-spin text-3xl mb-3">⏳</div>
              <p className="text-sm font-semibold">กำลังโหลดข้อมูลจาก Cloud Database...</p>
            </div>
          ) : filteredFarmers.length === 0 ? (
            <div className="p-16 text-center text-slate-400">
              <div className="text-4xl mb-2">📋</div>
              <p className="font-bold text-slate-600">
                {searchQuery ? "ไม่พบข้อมูลที่ตรงกับคำค้นหา" : "ยังไม่มีข้อมูลผู้ใช้ในระบบ"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600 border-b text-xs uppercase">
                  <tr>
                    <th className="py-4 px-4">โปรไฟล์ LINE</th>
                    <th className="py-4 px-4">ชื่อ-นามสกุลจริง</th>
                    <th className="py-4 px-4">เบอร์โทร</th>
                    <th className="py-4 px-4 text-center">พ้อยท์สะสม</th>
                    <th className="py-4 px-4">วันที่สมัคร</th>
                    <th className="py-4 px-4 text-center">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredFarmers.map((f) => (
                    <tr key={String(f._id || f.id)} className="hover:bg-slate-50/80 transition">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-200 border shrink-0">
                            {f.linePictureUrl ? (
                              <img src={f.linePictureUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center font-bold text-slate-400 text-lg">
                                👤
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-slate-800 truncate max-w-[140px]">
                              {f.lineDisplayName || f.fullName || "สมาชิกชาวไร่"}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              {f.lineUserId ? `${f.lineUserId.substring(0, 10)}...` : "-"}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-800 whitespace-nowrap">
                        {f.fullName || "-"}
                      </td>
                      <td className="py-3 px-4 text-slate-600 font-mono text-xs whitespace-nowrap">
                        {f.phone || "-"}
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <span className="bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full text-xs font-black">
                          {f.points ?? 0} PTS
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-400 whitespace-nowrap">
                        {f.createdAt ? new Date(f.createdAt).toLocaleDateString("th-TH") : "-"}
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* ดูรายละเอียด */}
                          <button
                            type="button"
                            onClick={() => setSelectedFarmer(f)}
                            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition"
                            title="ดูข้อมูลทั้งหมด"
                          >
                            👁️ ดู
                          </button>
                          
                          {/* แก้ไข */}
                          <button
                            type="button"
                            onClick={() => openEditModal(f)}
                            className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs rounded-lg transition"
                            title="แก้ไขข้อมูล"
                          >
                            ✏️ แก้ไข
                          </button>

                          {/* ลบ */}
                          <button
                            type="button"
                            onClick={() => setDeletingFarmer(f)}
                            className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 font-bold text-xs rounded-lg transition"
                            title="ลบผู้ใช้นี้"
                          >
                            🗑️ ลบ
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ================================= Modal 1: ดูข้อมูลทั้งหมด (ดูอย่างเดียว) ================================= */}
        {selectedFarmer && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
            onClick={() => setSelectedFarmer(null)}
          >
            <section
              role="dialog"
              aria-modal="true"
              className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-6 flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full border bg-slate-100">
                    {selectedFarmer.linePictureUrl ? (
                      <img
                        src={selectedFarmer.linePictureUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-2xl">👤</div>
                    )}
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-800">
                      ข้อมูลผู้ใช้ทั้งหมด
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      LINE: {selectedFarmer.lineDisplayName || "ไม่ระบุ"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedFarmer(null)}
                  className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  ✕
                </button>
              </div>

              <dl className="grid gap-3 sm:grid-cols-2">
                {[
                  ["รหัส Record ID", selectedFarmer._id || selectedFarmer.id],
                  ["LINE User ID", selectedFarmer.lineUserId || "-"],
                  ["ชื่อที่แสดงใน LINE", selectedFarmer.lineDisplayName || "-"],
                  ["ชื่อ-นามสกุลจริง", selectedFarmer.fullName || "-"],
                  ["เบอร์โทรศัพท์", selectedFarmer.phone || "-"],
                  ["คะแนนสะสม", `${selectedFarmer.points ?? 0} PTS`],
                  ["วันที่สมัคร", selectedFarmer.createdAt ? new Date(selectedFarmer.createdAt).toLocaleString("th-TH") : "-"],
                  ["URL รูปโปรไฟล์ LINE", selectedFarmer.linePictureUrl || "-"],
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0 rounded-xl bg-slate-50 p-3">
                    <dt className="text-xs font-semibold text-slate-500">{label}</dt>
                    <dd className="mt-1 break-all text-sm font-medium text-slate-800">
                      {value || "-"}
                    </dd>
                  </div>
                ))}
              </dl>

              <div className="mt-6 flex justify-end gap-2 border-t pt-4">
                <button
                  type="button"
                  onClick={() => setSelectedFarmer(null)}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition"
                >
                  ปิดหน้าต่าง
                </button>
              </div>
            </section>
          </div>
        )}

        {/* ================================= Modal 3: แก้ไขข้อมูลผู้ใช้ ================================= */}
        {editingFarmer && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
            onClick={() => !actionLoading && setEditingFarmer(null)}
          >
            <div
              className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-4 border-b">
                <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                  <span>✏️</span> แก้ไขข้อมูลผู้ใช้
                </h2>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => setEditingFarmer(null)}
                  className="text-slate-400 hover:text-slate-600 text-lg font-bold"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleEditSubmit} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ชื่อ - นามสกุลจริง <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={editFullName}
                    onChange={(e) => setEditFullName(e.target.value)}
                    className="w-full border rounded-xl p-2.5 text-sm border-slate-200 focus:outline-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    เบอร์โทรศัพท์ <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full border rounded-xl p-2.5 text-sm border-slate-200 focus:outline-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    คะแนนสะสม (พ้อยท์)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={editPoints}
                    onChange={(e) => setEditPoints(Number(e.target.value))}
                    className="w-full border rounded-xl p-2.5 text-sm border-slate-200 font-bold text-amber-800 focus:outline-blue-500"
                  />
                </div>

                <div className="mt-6 flex justify-end gap-2 border-t pt-4">
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => setEditingFarmer(null)}
                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition shadow flex items-center gap-1.5"
                  >
                    {actionLoading ? "⏳ กำลังบันทึก..." : "✓ บันทึกการแก้ไข"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ================================= Modal 4: ยืนยันการลบ ================================= */}
        {deletingFarmer && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
            onClick={() => !actionLoading && setDeletingFarmer(null)}
          >
            <div
              className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl text-center animate-in fade-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-16 h-16 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-3xl mx-auto mb-4">
                🗑️
              </div>
              <h2 className="text-lg font-black text-slate-800">ยืนยันการลบผู้ใช้?</h2>
              <p className="text-xs text-slate-500 mt-1">
                คุณแน่ใจหรือไม่ว่าต้องการลบข้อมูลของ:
              </p>
              
              <div className="my-4 p-3 bg-red-50 border border-red-100 rounded-2xl text-left text-xs space-y-1">
                <div className="font-bold text-red-900 text-sm">
                  {deletingFarmer.fullName || deletingFarmer.lineDisplayName}
                </div>
                <div className="text-slate-600">เบอร์โทร: {deletingFarmer.phone || "-"}</div>
                <div className="text-slate-600">คะแนนสะสม: {deletingFarmer.points ?? 0} PTS</div>
              </div>

              <p className="text-[11px] text-red-500 font-medium">
                ⚠️ การลบนี้จะนำข้อมูลออกจากฐานข้อมูลทันที และไม่สามารถกู้คืนได้
              </p>

              <div className="mt-6 flex justify-center gap-2">
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => setDeletingFarmer(null)}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={handleDeleteConfirm}
                  className="px-5 py-2.5 bg-red-600 hover:bg-red-700 active:scale-95 text-white font-bold text-xs rounded-xl transition shadow flex items-center gap-1.5"
                >
                  {actionLoading ? "⏳ กำลังลบ..." : "🗑️ ยืนยันลบข้อมูล"}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

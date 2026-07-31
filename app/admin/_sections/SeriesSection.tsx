"use client";

import { useEffect, useState } from "react";

type Series = { id: string; name: string; is_gift_series: boolean; sort_order: number };

export default function SeriesSection() {
  const [list, setList] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [isGiftSeries, setIsGiftSeries] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/series");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "載入失敗");
      setList(data.series || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate() {
    setError("");
    if (!name.trim()) return setError("請輸入系列名稱");
    try {
      const res = await fetch("/api/admin/series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, isGiftSeries }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "建立失敗");
      setName("");
      setIsGiftSeries(false);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("確定要刪除這個系列嗎？")) return;
    try {
      const res = await fetch(`/api/admin/series/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "刪除失敗");
      load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function persistOrder(next: Series[]) {
    setList(next);
    await fetch("/api/admin/series/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: next.map((s) => s.id) }),
    });
  }

  function handleDrop(targetId: string) {
    if (!draggedId || draggedId === targetId) return;
    const next = [...list];
    const fromIdx = next.findIndex((s) => s.id === draggedId);
    const toIdx = next.findIndex((s) => s.id === targetId);
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    persistOrder(next);
    setDraggedId(null);
  }

  const hasGiftSeries = list.some((s) => s.is_gift_series);

  return (
    <div>
      <p className="admin-sub">商品的系列分類，其中「贈品/滿贈」是特殊系列，全站只能有一個。拖曳可調整順序。</p>
      {error && <div className="admin-error-box">{error}</div>}

      <div className="admin-form-card">
        <div className="admin-form-row">
          <label>系列名稱</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="如：星海慶賀系列" />
        </div>
        <div className="admin-form-row" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={isGiftSeries} disabled={hasGiftSeries} onChange={(e) => setIsGiftSeries(e.target.checked)} />
          <label style={{ margin: 0 }}>
            這是「贈品/滿贈」特殊系列{hasGiftSeries && <span style={{ color: "var(--muted)" }}>（已經有一個了）</span>}
          </label>
        </div>
        <div className="admin-form-actions">
          <button className="btn" onClick={handleCreate}>
            新增系列
          </button>
        </div>
      </div>

      {loading ? (
        <div className="admin-empty">載入中…</div>
      ) : list.length === 0 ? (
        <div className="admin-empty">還沒有任何系列</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {list.map((s) => (
            <div
              key={s.id}
              draggable
              onDragStart={() => setDraggedId(s.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(s.id)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 12px",
                background: "#fff",
                border: "1px solid #E5E1D3",
                borderRadius: 8,
                cursor: "grab",
              }}
            >
              <span>
                ⠿ {s.name} {s.is_gift_series && <span className="admin-badge admin-badge-gift">贈品/滿贈系列</span>}
              </span>
              <button className="admin-link-btn danger" onClick={() => handleDelete(s.id)}>
                刪除
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

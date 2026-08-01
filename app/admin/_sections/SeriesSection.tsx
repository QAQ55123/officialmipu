"use client";
import { useEffect, useState } from "react";

type Series = { id: string; name: string; is_gift_series: boolean; sort_order: number };

export default function SeriesSection() {
  const [list, setList] = useState<Series[]>([]);
  const [name, setName] = useState("");
  const [isGiftSeries, setIsGiftSeries] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [filterText, setFilterText] = useState("");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/series");
    const data = await res.json();
    setList(data.series || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function save() {
    setMsg("");
    if (!name.trim()) return setMsg("請輸入系列名稱");
    try {
      const res = editingId
        ? await fetch(`/api/admin/series/${editingId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) })
        : await fetch("/api/admin/series", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, isGiftSeries }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "儲存失敗");
      setName(""); setIsGiftSeries(false); setEditingId(null);
      load();
    } catch (e: any) {
      setMsg(e.message);
    }
  }

  function editItem(s: Series) {
    setEditingId(s.id);
    setName(s.name);
  }

  async function deleteItem(id: string) {
    if (!confirm("確定要刪除這個系列嗎？")) return;
    const res = await fetch(`/api/admin/series/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) return setMsg(data.error);
    load();
  }

  async function persistOrder(next: Series[]) {
    setList(next);
    await fetch("/api/admin/series/reorder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: next.map((s) => s.id) }) });
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
  const filtered = list.filter((s) => !filterText.trim() || s.name.toLowerCase().includes(filterText.toLowerCase()));

  return (
    <div className="auth-card">
      <h3>系列管理</h3>
      <div className="id-row">
        <span className="id-label">名稱</span>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：星海慶賀系列" />
      </div>
      {!editingId && (
        <div className="id-row">
          <span className="id-label">特殊系列</span>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
            <input type="checkbox" checked={isGiftSeries} disabled={hasGiftSeries} onChange={(e) => setIsGiftSeries(e.target.checked)} />
            這是「贈品/滿贈」特殊系列{hasGiftSeries && <span style={{ color: "var(--muted)" }}>（已經有一個了）</span>}
          </label>
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn" onClick={save}>{editingId ? "儲存修改" : "新增系列"}</button>
        {editingId && <button className="btn secondary" onClick={() => { setEditingId(null); setName(""); }}>取消編輯</button>}
      </div>
      <div style={{ fontSize: 13, marginTop: 6 }}>{msg}</div>

      <div style={{ marginTop: 12, maxHeight: 320, overflowY: "auto", paddingRight: 4, borderTop: "1px solid #EDE9DC", paddingTop: 12 }}>
        <input type="text" value={filterText} onChange={(e) => setFilterText(e.target.value)} placeholder="搜尋系列名稱…" style={{ width: "100%", padding: 8, marginBottom: 10, border: "1px solid #EDE9DC", borderRadius: 8 }} />
        <p style={{ fontSize: 12, color: "#8A8779", margin: "0 0 8px" }}>可以拖曳調整排列順序</p>
        {loading ? (
          <div style={{ fontSize: 13, color: "#8A8779" }}>載入中…</div>
        ) : filtered.length === 0 ? (
          <div style={{ fontSize: 13, color: "#8A8779" }}>目前沒有系列</div>
        ) : (
          filtered.map((s) => (
            <div
              key={s.id}
              draggable
              onDragStart={() => setDraggedId(s.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(s.id)}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14, fontWeight: 600, cursor: "grab", marginBottom: 6, opacity: draggedId === s.id ? 0.4 : 1 }}
            >
              <span><span style={{ color: "#B0AC9C", marginRight: 6 }} title="拖曳排序">⠿</span>{s.name}{s.is_gift_series && <span className="plan-card-v2-tag" style={{ position: "static", marginLeft: 8 }}>贈品/滿贈</span>}</span>
              <span>
                <button className="btn small secondary" onClick={() => editItem(s)} style={{ marginRight: 6 }}>編輯</button>
                <button className="btn small danger" onClick={() => deleteItem(s.id)}>刪除</button>
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

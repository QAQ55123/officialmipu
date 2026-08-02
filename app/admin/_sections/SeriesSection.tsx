"use client";
import { useEffect, useState } from "react";

type Category = { id: string; name: string; sort_order: number };
type Series = { id: string; name: string; is_gift_series: boolean; sort_order: number; category_id: string | null };

export default function SeriesSection() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterText, setFilterText] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const [categoryName, setCategoryName] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [categoryMsg, setCategoryMsg] = useState("");

  const [seriesName, setSeriesName] = useState("");
  const [seriesCategoryId, setSeriesCategoryId] = useState("");
  const [isGiftSeries, setIsGiftSeries] = useState(false);
  const [editingSeriesId, setEditingSeriesId] = useState<string | null>(null);
  const [seriesMsg, setSeriesMsg] = useState("");

  const [draggedCategoryId, setDraggedCategoryId] = useState<string | null>(null);
  const [draggedSeriesId, setDraggedSeriesId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [cRes, sRes] = await Promise.all([fetch("/api/admin/categories"), fetch("/api/admin/series")]);
    const cData = await cRes.json();
    const sData = await sRes.json();
    setCategories(cData.categories || []);
    setSeriesList(sData.series || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // ---- 分類（上層） ----
  async function saveCategory() {
    if (!categoryName.trim()) return setCategoryMsg("請填寫分類名稱");
    setCategoryMsg("處理中…");
    try {
      if (editingCategoryId) {
        const res = await fetch("/api/admin/categories", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editingCategoryId, name: categoryName }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
      } else {
        const res = await fetch("/api/admin/categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: categoryName }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
      }
      setCategoryName(""); setEditingCategoryId(null); setCategoryMsg("已儲存");
      load();
    } catch (e: any) {
      setCategoryMsg("失敗：" + e.message);
    }
  }
  function editCategory(c: Category) {
    setEditingCategoryId(c.id);
    setCategoryName(c.name);
  }
  async function deleteCategory(id: string) {
    if (!confirm("確定要刪除這個分類嗎？（底下的系列不會被刪除，只是會變成未分類）")) return;
    try {
      const res = await fetch("/api/admin/categories", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      load();
    } catch (e: any) {
      setCategoryMsg("失敗：" + e.message);
    }
  }
  function handleCategoryDrop(targetId: string) {
    if (!draggedCategoryId || draggedCategoryId === targetId) return;
    const next = [...categories];
    const fromIdx = next.findIndex((c) => c.id === draggedCategoryId);
    const toIdx = next.findIndex((c) => c.id === targetId);
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    setCategories(next);
    fetch("/api/admin/categories/reorder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: next.map((c) => c.id) }) }).catch(() => setCategoryMsg("排序儲存失敗"));
    setDraggedCategoryId(null);
  }

  // ---- 系列（下層） ----
  async function saveSeries() {
    if (!seriesName.trim()) return setSeriesMsg("請輸入系列名稱");
    setSeriesMsg("處理中…");
    try {
      const res = editingSeriesId
        ? await fetch(`/api/admin/series/${editingSeriesId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: seriesName, categoryId: seriesCategoryId || null }) })
        : await fetch("/api/admin/series", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: seriesName, categoryId: seriesCategoryId || null, isGiftSeries }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "儲存失敗");
      setSeriesName(""); setSeriesCategoryId(""); setIsGiftSeries(false); setEditingSeriesId(null);
      load();
    } catch (e: any) {
      setSeriesMsg("失敗：" + e.message);
    }
  }
  function editSeries(s: Series) {
    setEditingSeriesId(s.id);
    setSeriesName(s.name);
    setSeriesCategoryId(s.category_id || "");
  }
  async function deleteSeries(id: string) {
    if (!confirm("確定要刪除這個系列嗎？")) return;
    const res = await fetch(`/api/admin/series/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) return setSeriesMsg(data.error);
    load();
  }
  function handleSeriesDrop(targetId: string) {
    if (!draggedSeriesId || draggedSeriesId === targetId) return;
    const dragged = seriesList.find((s) => s.id === draggedSeriesId);
    const target = seriesList.find((s) => s.id === targetId);
    if (!dragged || !target || dragged.category_id !== target.category_id) return; // 不同分類底下不能互換順序
    const next = [...seriesList];
    const fromIdx = next.findIndex((s) => s.id === draggedSeriesId);
    const toIdx = next.findIndex((s) => s.id === targetId);
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    setSeriesList(next);
    const siblingIds = next.filter((s) => s.category_id === dragged.category_id).map((s) => s.id);
    fetch("/api/admin/series/reorder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: siblingIds }) }).catch(() => setSeriesMsg("排序儲存失敗"));
    setDraggedSeriesId(null);
  }

  const hasGiftSeries = seriesList.some((s) => s.is_gift_series);
  function seriesOf(categoryId: string | null) {
    return seriesList.filter((s) => (s.category_id || null) === categoryId);
  }
  const filteredCategories = categories.filter((c) =>
    !filterText.trim() || c.name.toLowerCase().includes(filterText.toLowerCase()) || seriesOf(c.id).some((s) => s.name.toLowerCase().includes(filterText.toLowerCase()))
  );
  const uncategorized = seriesOf(null).filter((s) => !filterText.trim() || s.name.toLowerCase().includes(filterText.toLowerCase()));

  return (
    <>
      <div className="auth-card">
        <h3>分類管理（上層）</h3>
        <div className="id-row">
          <span className="id-label">名稱</span>
          <input type="text" value={categoryName} onChange={(e) => setCategoryName(e.target.value)} placeholder="例如：新品介紹、遊戲周邊" />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={saveCategory}>{editingCategoryId ? "儲存修改" : "新增分類"}</button>
          {editingCategoryId && <button className="btn secondary" onClick={() => { setEditingCategoryId(null); setCategoryName(""); }}>取消編輯</button>}
        </div>
        <div style={{ fontSize: 13, marginTop: 6 }}>{categoryMsg}</div>
      </div>

      <div className="auth-card">
        <h3>系列管理（下層，歸屬在分類底下）</h3>
        <div className="id-row">
          <span className="id-label">名稱</span>
          <input type="text" value={seriesName} onChange={(e) => setSeriesName(e.target.value)} placeholder="例如：星海慶賀系列" />
        </div>
        <div className="id-row">
          <span className="id-label">所屬分類</span>
          <select value={seriesCategoryId} onChange={(e) => setSeriesCategoryId(e.target.value)} style={{ flex: 1, padding: 8 }}>
            <option value="">（無，未分類）</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {!editingSeriesId && (
          <div className="id-row">
            <span className="id-label">特殊系列</span>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
              <input type="checkbox" checked={isGiftSeries} disabled={hasGiftSeries} onChange={(e) => setIsGiftSeries(e.target.checked)} />
              這是「贈品/滿贈」特殊系列{hasGiftSeries && <span style={{ color: "var(--muted)" }}>（已經有一個了）</span>}
            </label>
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={saveSeries}>{editingSeriesId ? "儲存修改" : "新增系列"}</button>
          {editingSeriesId && <button className="btn secondary" onClick={() => { setEditingSeriesId(null); setSeriesName(""); setSeriesCategoryId(""); }}>取消編輯</button>}
        </div>
        <div style={{ fontSize: 13, marginTop: 6 }}>{seriesMsg}</div>

        <div style={{ marginTop: 12, borderTop: "1px solid #EDE9DC", paddingTop: 12 }}>
          <input type="text" value={filterText} onChange={(e) => setFilterText(e.target.value)} placeholder="搜尋分類或系列名稱…" style={{ width: "100%", padding: 8, marginBottom: 10, border: "1px solid #EDE9DC", borderRadius: 8 }} />
          <p style={{ fontSize: 12, color: "#8A8779", margin: "0 0 8px" }}>可以拖曳調整排列順序（系列只能在同一個分類底下互相拖曳）</p>

          {loading ? (
            <div style={{ fontSize: 13, color: "#8A8779" }}>載入中…</div>
          ) : (
            <>
              {filteredCategories.map((c) => {
                const children = seriesOf(c.id).filter((s) => !filterText.trim() || s.name.toLowerCase().includes(filterText.toLowerCase()));
                const expanded = expandedIds.has(c.id);
                return (
                  <div key={c.id} style={{ marginBottom: 6, opacity: draggedCategoryId === c.id ? 0.4 : 1 }}>
                    <div
                      draggable
                      onDragStart={() => setDraggedCategoryId(c.id)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => handleCategoryDrop(c.id)}
                      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14, fontWeight: 600, cursor: "grab" }}
                    >
                      <span onClick={() => toggleExpand(c.id)} style={{ cursor: "pointer" }}>
                        <span style={{ color: "#B0AC9C", marginRight: 6 }} title="拖曳排序">⠿</span>
                        {c.name} <span style={{ fontSize: 12, color: "#8A8779", fontWeight: 400 }}>{expanded ? "▾" : "▸"} {children.length}個系列</span>
                      </span>
                      <span>
                        <button className="btn small secondary" onClick={() => editCategory(c)} style={{ marginRight: 6 }}>編輯</button>
                        <button className="btn small danger" onClick={() => deleteCategory(c.id)}>刪除</button>
                      </span>
                    </div>
                    {expanded && children.map((s) => (
                      <div
                        key={s.id}
                        draggable
                        onDragStart={() => setDraggedSeriesId(s.id)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => handleSeriesDrop(s.id)}
                        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13.5, padding: "6px 0 6px 22px", opacity: draggedSeriesId === s.id ? 0.4 : 1 }}
                      >
                        <span><span style={{ color: "#B0AC9C", marginRight: 6 }} title="拖曳排序">⠿</span>{s.name}{s.is_gift_series && <span className="plan-card-v2-tag" style={{ position: "static", marginLeft: 8 }}>贈品/滿贈</span>}</span>
                        <span>
                          <button className="btn small secondary" onClick={() => editSeries(s)} style={{ marginRight: 6 }}>編輯</button>
                          <button className="btn small danger" onClick={() => deleteSeries(s.id)}>刪除</button>
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })}

              {uncategorized.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#8A8779" }}>未分類</div>
                  {uncategorized.map((s) => (
                    <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13.5, padding: "6px 0" }}>
                      <span>{s.name}{s.is_gift_series && <span className="plan-card-v2-tag" style={{ position: "static", marginLeft: 8 }}>贈品/滿贈</span>}</span>
                      <span>
                        <button className="btn small secondary" onClick={() => editSeries(s)} style={{ marginRight: 6 }}>編輯</button>
                        <button className="btn small danger" onClick={() => deleteSeries(s.id)}>刪除</button>
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {filteredCategories.length === 0 && uncategorized.length === 0 && <div style={{ fontSize: 13, color: "#8A8779" }}>沒有符合的資料</div>}
            </>
          )}
        </div>
      </div>
    </>
  );
}

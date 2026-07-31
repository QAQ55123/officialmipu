"use client";

import { useEffect, useState } from "react";

type Announcement = { id: string; content: string; created_at: string };

export default function AnnouncementsSection() {
  const [list, setList] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/announcements");
    const data = await res.json();
    setList(data.announcements || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd() {
    setError("");
    try {
      const res = await fetch("/api/admin/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "新增失敗");
      setContent("");
      load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("確定要刪除這則公告嗎？")) return;
    await fetch(`/api/admin/announcements/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div>
      {error && <div className="admin-error-box">{error}</div>}

      <div className="admin-form-card">
        <div className="admin-form-row">
          <label>公告內容</label>
          <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={3} />
        </div>
        <div className="admin-form-actions">
          <button className="btn" onClick={handleAdd}>
            發布公告
          </button>
        </div>
      </div>

      {loading ? (
        <div className="admin-empty">載入中…</div>
      ) : list.length === 0 ? (
        <div className="admin-empty">還沒有任何公告</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {list.map((a) => (
            <div key={a.id} style={{ border: "1px solid #E5E1D3", borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 6 }}>
                {new Date(a.created_at).toLocaleString("zh-TW")}
              </div>
              <div style={{ whiteSpace: "pre-wrap", marginBottom: 8 }}>{a.content}</div>
              <button className="admin-link-btn danger" onClick={() => handleDelete(a.id)}>
                刪除
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

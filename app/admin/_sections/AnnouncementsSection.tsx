"use client";
import { useEffect, useState } from "react";

type Announcement = { id: string; content: string; created_at: string };

export default function AnnouncementsSection() {
  const [checkoutNotice, setCheckoutNotice] = useState("");
  const [noticeMsg, setNoticeMsg] = useState("");
  const [savingNotice, setSavingNotice] = useState(false);

  const [newContent, setNewContent] = useState("");
  const [postMsg, setPostMsg] = useState("");
  const [posting, setPosting] = useState(false);
  const [list, setList] = useState<Announcement[]>([]);

  async function load() {
    const [settingsRes, listRes] = await Promise.all([fetch("/api/admin/site-settings"), fetch("/api/admin/announcements")]);
    const settingsData = await settingsRes.json();
    const listData = await listRes.json();
    if (settingsRes.ok) setCheckoutNotice(settingsData.checkoutNotice || "");
    setList(listData.announcements || []);
  }
  useEffect(() => { load(); }, []);

  async function saveNotice() {
    setSavingNotice(true); setNoticeMsg("");
    const res = await fetch("/api/admin/site-settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "checkout_notice", value: checkoutNotice }) });
    const data = await res.json();
    setNoticeMsg(res.ok ? "已儲存" : data.error);
    setSavingNotice(false);
  }

  async function post() {
    setPosting(true); setPostMsg("");
    const res = await fetch("/api/admin/announcements", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: newContent }) });
    const data = await res.json();
    if (!res.ok) { setPostMsg(data.error); setPosting(false); return; }
    setNewContent("");
    setPosting(false);
    load();
  }

  async function deleteItem(id: string) {
    if (!confirm("確定要刪除這則公告嗎？")) return;
    await fetch(`/api/admin/announcements/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <>
      <div className="auth-card">
        <h3>結帳頁說明欄</h3>
        <p style={{ fontSize: 12, color: "#8A8779", margin: 0 }}>顯示在結帳頁面最上方，留空就不顯示。</p>
        <textarea value={checkoutNotice} onChange={(e) => setCheckoutNotice(e.target.value)} rows={2} style={{ width: "100%", marginTop: 8, padding: 8, border: "1px solid #EDE9DC", borderRadius: 8, fontFamily: "inherit", fontSize: 14 }} placeholder="留空表示不顯示" />
        <div style={{ fontSize: 13, margin: "6px 0" }}>{noticeMsg}</div>
        <button className="btn small" onClick={saveNotice} disabled={savingNotice}>{savingNotice ? "儲存中…" : "儲存"}</button>
      </div>

      <div className="auth-card">
        <h3>發佈新公告</h3>
        <textarea value={newContent} onChange={(e) => setNewContent(e.target.value)} rows={3} style={{ width: "100%", marginTop: 8, padding: 8, border: "1px solid #EDE9DC", borderRadius: 8, fontFamily: "inherit", fontSize: 14 }} placeholder="輸入公告內容…" />
        <div style={{ fontSize: 13, margin: "6px 0" }}>{postMsg}</div>
        <button className="btn" onClick={post} disabled={posting}>{posting ? "發佈中…" : "發佈公告"}</button>
      </div>

      <div className="auth-card">
        <h3>公告歷史紀錄</h3>
        {list.length === 0 && <div style={{ fontSize: 13, color: "#8A8779" }}>還沒有發佈過任何公告</div>}
        {list.map((a) => (
          <div key={a.id} style={{ padding: "8px 0", borderBottom: "1px dashed #EDE9DC" }}>
            <div style={{ fontSize: 12, color: "#8A8779" }}>{new Date(a.created_at).toLocaleString("zh-TW")}</div>
            <div style={{ fontSize: 14, whiteSpace: "pre-wrap", margin: "4px 0" }}>{a.content}</div>
            <button className="btn small danger" onClick={() => deleteItem(a.id)}>刪除</button>
          </div>
        ))}
      </div>
    </>
  );
}

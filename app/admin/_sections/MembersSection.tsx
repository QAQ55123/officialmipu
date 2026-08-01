"use client";
import { useState } from "react";

export default function MembersSection() {
  const [resetUsername, setResetUsername] = useState("");
  const [resetMsg, setResetMsg] = useState("");
  const [lookupUsername, setLookupUsername] = useState("");
  const [lookupMsg, setLookupMsg] = useState("");
  const [result, setResult] = useState<any>(null);

  async function doReset() {
    setResetMsg("");
    const res = await fetch("/api/admin/reset-member-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: resetUsername }) });
    const data = await res.json();
    setResetMsg(res.ok ? "已重設為 0000" : data.error);
  }

  async function lookup() {
    setLookupMsg(""); setResult(null);
    const res = await fetch(`/api/admin/members?q=${encodeURIComponent(lookupUsername)}`);
    const data = await res.json();
    if (!res.ok) return setLookupMsg(data.error);
    const found = (data.members || []).find((m: any) => m.username.toLowerCase() === lookupUsername.toLowerCase());
    if (!found) return setLookupMsg("找不到這個會員");
    setResult(found);
  }

  return (
    <>
      <div className="auth-card">
        <h3>重設會員密碼</h3>
        <div className="id-row"><span className="id-label">帳號</span><input type="text" value={resetUsername} onChange={(e) => setResetUsername(e.target.value)} /></div>
        <button className="btn" onClick={doReset}>重設為 0000</button>
        <div style={{ fontSize: 13 }}>{resetMsg}</div>
      </div>

      <div className="auth-card">
        <h3>查詢會員</h3>
        <div className="id-row">
          <span className="id-label">帳號</span>
          <input type="text" value={lookupUsername} onChange={(e) => setLookupUsername(e.target.value)} onKeyDown={(e) => e.key === "Enter" && lookup()} />
          <button className="btn small" onClick={lookup}>查詢</button>
        </div>
        <div style={{ fontSize: 13 }}>{lookupMsg}</div>
        {result && (
          <div style={{ borderTop: "1px solid #EDE9DC", paddingTop: 10, marginTop: 4, fontSize: 13 }}>
            <div>Email：{result.email}（{result.email_verified ? "已驗證" : "尚未驗證"}）</div>
            <div>註冊時間：{new Date(result.created_at).toLocaleString("zh-TW")}</div>
          </div>
        )}
      </div>
    </>
  );
}

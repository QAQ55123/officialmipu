"use client";

import { useEffect, useState } from "react";

type Member = { id: string; username: string; email: string; email_verified: boolean; created_at: string };

export default function MembersSection() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [resetMsg, setResetMsg] = useState<Record<string, string>>({});

  async function load(query: string) {
    setLoading(true);
    setError("");
    const res = await fetch(`/api/admin/members?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "只有最高權限管理者(owner)能使用這個功能");
      setLoading(false);
      return;
    }
    setMembers(data.members || []);
    setLoading(false);
  }

  useEffect(() => {
    load("");
  }, []);

  async function handleResetPassword(username: string) {
    if (!confirm(`確定要把「${username}」的密碼重設為 0000 嗎？`)) return;
    const res = await fetch("/api/admin/reset-member-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
    const data = await res.json();
    setResetMsg((prev) => ({ ...prev, [username]: res.ok ? "已重設為 0000" : data.error }));
  }

  return (
    <div>
      <p className="admin-sub">搜尋與查看會員資料（僅最高權限管理者可用）</p>
      {error && <div className="admin-error-box">{error}</div>}

      <div className="admin-card">
        <div className="admin-toolbar" style={{ marginBottom: loading || members.length > 0 ? 16 : 0 }}>
          <input placeholder="搜尋帳號或Email" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load(q)} />
          <button onClick={() => load(q)}>搜尋</button>
        </div>

        {loading ? (
          <div className="admin-empty">載入中…</div>
        ) : members.length === 0 ? (
          !error && <div className="admin-empty">沒有符合的會員</div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>帳號</th>
                <th>Email</th>
                <th>Email驗證</th>
                <th>註冊時間</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td>{m.username}</td>
                  <td>{m.email}</td>
                  <td>{m.email_verified ? "已驗證" : "未驗證"}</td>
                  <td style={{ fontSize: 13, color: "var(--muted)" }}>{new Date(m.created_at).toLocaleString("zh-TW")}</td>
                  <td className="admin-row-actions">
                    <button className="admin-link-btn" onClick={() => handleResetPassword(m.username)}>
                      重設密碼為0000
                    </button>
                    {resetMsg[m.username] && <span style={{ fontSize: 12, color: "var(--muted)" }}>{resetMsg[m.username]}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

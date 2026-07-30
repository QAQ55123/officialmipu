"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Member = { id: string; username: string; email: string; email_verified: boolean; created_at: string };

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  async function load(query: string) {
    setLoading(true);
    const res = await fetch(`/api/admin/members?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    setMembers(data.members || []);
    setLoading(false);
  }

  useEffect(() => {
    load("");
  }, []);

  return (
    <div className="admin-page">
      <nav className="admin-nav">
        <Link href="/admin">← 後台首頁</Link>
      </nav>
      <h1>會員管理</h1>

      <div className="admin-toolbar">
        <input
          placeholder="搜尋帳號或Email"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load(q)}
        />
        <button onClick={() => load(q)}>搜尋</button>
      </div>

      {loading ? (
        <div className="admin-empty">載入中…</div>
      ) : members.length === 0 ? (
        <div className="admin-empty">沒有符合的會員</div>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>帳號</th>
              <th>Email</th>
              <th>Email驗證</th>
              <th>註冊時間</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td>{m.username}</td>
                <td>{m.email}</td>
                <td>{m.email_verified ? "已驗證" : "未驗證"}</td>
                <td style={{ fontSize: 13, color: "var(--muted)" }}>{new Date(m.created_at).toLocaleString("zh-TW")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

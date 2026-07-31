"use client";

import { useEffect, useState } from "react";

type Code = { id: string; code: string; used: boolean; usedBy: string | null; usedAt: string | null; createdAt: string };
type AdminUser = { id: string; username: string; email: string; emailVerified: boolean; role: "owner" | "staff"; createdAt: string };

export default function InviteCodesSection() {
  const [codes, setCodes] = useState<Code[]>([]);
  const [staffList, setStaffList] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    const [codesRes, staffRes] = await Promise.all([fetch("/api/admin/invite-codes"), fetch("/api/admin/staff")]);
    const codesData = await codesRes.json();
    const staffData = await staffRes.json();
    if (!codesRes.ok) {
      setError(codesData.error || "只有最高權限管理者(owner)能使用這個功能");
      setLoading(false);
      return;
    }
    setCodes(codesData.codes || []);
    setStaffList(staffData.admins || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleGenerate() {
    const res = await fetch("/api/admin/invite-codes", { method: "POST" });
    const data = await res.json();
    if (res.ok) load();
    else setError(data.error);
  }

  async function handleRevoke(id: string) {
    if (!confirm("確定要撤銷這組邀請碼嗎？")) return;
    await fetch("/api/admin/invite-codes", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load();
  }

  return (
    <div>
      <p className="admin-sub">
        產生一次性邀請碼給新的一般管理者(staff)註冊用，每組只能用一次；一般管理者看不到會員相關工具
      </p>
      {error && <div className="admin-error-box">{error}</div>}

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontWeight: 500, marginBottom: 8 }}>目前所有管理者帳號</div>
        {loading ? (
          <div className="admin-empty">載入中…</div>
        ) : staffList.length === 0 ? (
          !error && <div className="admin-empty">還沒有任何管理者帳號</div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>帳號</th>
                <th>權限</th>
                <th>Email</th>
                <th>建立時間</th>
              </tr>
            </thead>
            <tbody>
              {staffList.map((a) => (
                <tr key={a.id}>
                  <td>{a.username}</td>
                  <td>{a.role === "owner" ? "最高權限(owner)" : "一般管理者(staff)"}</td>
                  <td>
                    {a.email} {a.email && (a.emailVerified ? "（已驗證）" : "（未驗證）")}
                  </td>
                  <td style={{ fontSize: 13, color: "var(--muted)" }}>{new Date(a.createdAt).toLocaleString("zh-TW")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="admin-toolbar">
        <button className="btn" onClick={handleGenerate}>
          ＋ 產生新邀請碼
        </button>
      </div>

      {!loading && codes.length > 0 && (
        <table className="admin-table">
          <thead>
            <tr>
              <th>邀請碼</th>
              <th>狀態</th>
              <th>使用者</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {codes.map((c) => (
              <tr key={c.id}>
                <td style={{ fontFamily: "monospace" }}>{c.code}</td>
                <td>{c.used ? "已使用" : "未使用"}</td>
                <td>{c.usedBy || "—"}</td>
                <td className="admin-row-actions">
                  {!c.used && (
                    <button className="admin-link-btn danger" onClick={() => handleRevoke(c.id)}>
                      撤銷
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

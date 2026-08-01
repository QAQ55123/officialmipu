"use client";
import { useEffect, useState } from "react";

type Code = { id: string; code: string; used: boolean; usedBy: string | null };
type AdminUser = { id: string; username: string; email: string; emailVerified: boolean; role: "owner" | "staff" };

export default function InviteCodesSection() {
  const [codes, setCodes] = useState<Code[]>([]);
  const [staff, setStaff] = useState<AdminUser[]>([]);
  const [msg, setMsg] = useState("");
  const [generating, setGenerating] = useState(false);

  async function load() {
    const [cRes, sRes] = await Promise.all([fetch("/api/admin/invite-codes"), fetch("/api/admin/staff")]);
    const cData = await cRes.json();
    const sData = await sRes.json();
    setCodes(cData.codes || []);
    setStaff(sData.admins || []);
  }
  useEffect(() => { load(); }, []);

  async function generate() {
    setGenerating(true); setMsg("");
    const res = await fetch("/api/admin/invite-codes", { method: "POST" });
    const data = await res.json();
    if (!res.ok) setMsg(data.error);
    setGenerating(false);
    load();
  }
  async function revoke(id: string) {
    if (!confirm("確定要撤銷這組邀請碼嗎？")) return;
    await fetch("/api/admin/invite-codes", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    load();
  }
  function copyCode(code: string) {
    navigator.clipboard.writeText(code);
    setMsg(`已複製：${code}`);
  }

  return (
    <>
      <div className="auth-card">
        <h3>Staff 邀請碼管理</h3>
        <p style={{ fontSize: 12, color: "#8A8779", margin: 0 }}>每組邀請碼只能用一次，用過就會失效。owner 的邀請碼另外用固定的環境變數，不受這裡影響。</p>
        <button className="btn" onClick={generate} disabled={generating}>{generating ? "產生中…" : "產生新的邀請碼"}</button>
        <div style={{ fontSize: 13 }}>{msg}</div>
        {codes.length === 0 && <div style={{ fontSize: 13, color: "#8A8779" }}>目前沒有任何邀請碼</div>}
        {codes.map((c) => (
          <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px dashed #EDE9DC" }}>
            <div>
              <div style={{ fontSize: 14, fontFamily: "monospace" }}>{c.code}</div>
              <div style={{ fontSize: 12, color: c.used ? "#791F1F" : "#27500A" }}>{c.used ? `已使用（${c.usedBy || "未知帳號"}）` : "未使用"}</div>
            </div>
            <span style={{ display: "flex", gap: 6 }}>
              {!c.used && <button className="btn small secondary" onClick={() => copyCode(c.code)}>複製</button>}
              {!c.used && <button className="btn small danger" onClick={() => revoke(c.id)}>撤銷</button>}
            </span>
          </div>
        ))}
      </div>

      <div className="auth-card">
        <h3>管理者名單</h3>
        {staff.length === 0 && <div style={{ fontSize: 13, color: "#8A8779" }}>目前沒有任何管理者帳號</div>}
        {staff.map((a) => (
          <div key={a.id} style={{ padding: "8px 0", borderBottom: "1px dashed #EDE9DC" }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              {a.username}
              <span style={{ fontWeight: 400, fontSize: 12, color: a.role === "owner" ? "#33415C" : "#8A8779", marginLeft: 8 }}>
                {a.role === "owner" ? "最高權限" : "一般管理者"}
              </span>
            </div>
            <div style={{ fontSize: 12, color: "#8A8779" }}>{a.email}（{a.emailVerified ? "已驗證" : "尚未驗證"}）</div>
          </div>
        ))}
      </div>
    </>
  );
}

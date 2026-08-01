"use client";

import { useState } from "react";

export default function AccountSection({
  username,
  role,
  email,
  emailVerified,
  onLogout,
}: {
  username: string;
  role: "owner" | "staff";
  email: string;
  emailVerified: boolean;
  onLogout: () => void;
}) {
  const [pw, setPw] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [emailMsg, setEmailMsg] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [savingPw, setSavingPw] = useState(false);

  async function handleSaveEmail() {
    setEmailMsg("");
    setSavingEmail(true);
    const targetEmail = newEmail.trim() || email; // 留空 = 重新寄驗證信給目前的信箱
    try {
      const res = await fetch("/api/admin/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw, newEmail: targetEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "更新失敗");
      setEmailMsg(data.verifyEmailSent ? "已寄出驗證信，請去信箱點連結驗證" : "更新成功");
      setPw("");
    } catch (e: any) {
      setEmailMsg(e.message);
    } finally {
      setSavingEmail(false);
    }
  }

  async function handleChangePassword() {
    setPwMsg("");
    if (newPw !== confirmPw) return setPwMsg("兩次輸入的新密碼不一樣");
    setSavingPw(true);
    try {
      const res = await fetch("/api/admin/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: currentPw, newPassword: newPw }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "修改失敗");
      setPwMsg("密碼已更新");
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
    } catch (e: any) {
      setPwMsg(e.message);
    } finally {
      setSavingPw(false);
    }
  }

  return (
    <div>
      <div className="admin-form-card">
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 14 }}>
            帳號：<strong>{username}</strong>
          </div>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>
            權限：{role === "owner" ? "最高權限管理者(owner)" : "一般管理者(staff)"}
          </div>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>
            Email：{email || "（尚未設定）"}{" "}
            {email && (emailVerified ? <span style={{ color: "#1E7A3D" }}>（已驗證）</span> : <span>（未驗證）</span>)}
          </div>
        </div>
        <button onClick={onLogout}>登出</button>
      </div>

      <div className="admin-form-card">
        <div style={{ fontWeight: 500, marginBottom: 8 }}>修改 Email</div>
        {emailMsg && <div style={{ fontSize: 13, marginBottom: 8, color: "var(--muted)" }}>{emailMsg}</div>}
        <div className="admin-form-row">
          <label>目前密碼</label>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </div>
        <div className="admin-form-row">
          <label>新Email（留空＝重新寄一次驗證信給目前的信箱）</label>
          <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder={email || "輸入新的Email"} />
        </div>
        <button className="btn" onClick={handleSaveEmail} disabled={savingEmail}>
          {savingEmail ? "處理中…" : "更新Email"}
        </button>
      </div>

      <div className="admin-form-card">
        <div style={{ fontWeight: 500, marginBottom: 8 }}>修改密碼</div>
        {pwMsg && <div style={{ fontSize: 13, marginBottom: 8, color: "var(--muted)" }}>{pwMsg}</div>}
        <div className="admin-form-row">
          <label>目前密碼</label>
          <input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} />
        </div>
        <div className="admin-form-row">
          <label>新密碼（至少8個字）</label>
          <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
        </div>
        <div className="admin-form-row">
          <label>確認新密碼</label>
          <input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} />
        </div>
        <button className="btn" onClick={handleChangePassword} disabled={savingPw}>
          {savingPw ? "處理中…" : "更新密碼"}
        </button>
      </div>
    </div>
  );
}

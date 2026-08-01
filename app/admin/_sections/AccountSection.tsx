"use client";
import { useState } from "react";

export default function AccountSection({
  username, role, email, emailVerified, onLogout,
}: { username: string; role: "owner" | "staff"; email: string; emailVerified: boolean; onLogout: () => void }) {
  const [newEmail, setNewEmail] = useState("");
  const [emailPw, setEmailPw] = useState("");
  const [emailMsg, setEmailMsg] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [savingPw, setSavingPw] = useState(false);

  async function saveEmail() {
    setSavingEmail(true);
    setEmailMsg("");
    try {
      const res = await fetch("/api/admin/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: emailPw, newEmail: newEmail.trim() || email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "更新失敗");
      setEmailMsg(data.verifyEmailSent ? "已寄出驗證信" : "已更新");
      setEmailPw("");
    } catch (e: any) {
      setEmailMsg(e.message);
    } finally {
      setSavingEmail(false);
    }
  }

  async function changePassword() {
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
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
    } catch (e: any) {
      setPwMsg(e.message);
    } finally {
      setSavingPw(false);
    }
  }

  return (
    <>
      <div className="auth-card">
        <h3>我的帳號設定</h3>
        <div className="id-row">
          <span className="id-label">帳號</span>
          <span style={{ fontSize: 14 }}>{username}（{role === "owner" ? "最高權限" : "一般管理者"}）</span>
        </div>
        <div className="id-row">
          <span className="id-label">目前信箱</span>
          <span style={{ fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
            {email || "尚未設定"}
            {email && <span style={{ fontSize: 12, color: emailVerified ? "#27500A" : "#B08E5A" }}>{emailVerified ? "（已驗證）" : "（尚未驗證）"}</span>}
          </span>
        </div>
        <div className="id-row">
          <span className="id-label">新信箱</span>
          <input type="text" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="留空＝重新寄驗證信給目前信箱" />
        </div>
        <div className="id-row">
          <span className="id-label">目前密碼</span>
          <input type="password" value={emailPw} onChange={(e) => setEmailPw(e.target.value)} placeholder="驗證身分用" />
        </div>
        <button className="btn" onClick={saveEmail} disabled={savingEmail}>{savingEmail ? "儲存中…" : "更新信箱"}</button>
        <div style={{ fontSize: 13, marginTop: 6 }}>{emailMsg}</div>
      </div>

      <div className="auth-card">
        <h3>修改密碼</h3>
        <div className="id-row"><span className="id-label">目前密碼</span><input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} /></div>
        <div className="id-row"><span className="id-label">新密碼</span><input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="至少 8 個字" /></div>
        <div className="id-row"><span className="id-label">確認新密碼</span><input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} /></div>
        <button className="btn" onClick={changePassword} disabled={savingPw}>{savingPw ? "儲存中…" : "更新密碼"}</button>
        <div style={{ fontSize: 13, marginTop: 6 }}>{pwMsg}</div>
      </div>

      <div className="auth-card">
        <button className="btn secondary" onClick={onLogout}>登出</button>
      </div>
    </>
  );
}

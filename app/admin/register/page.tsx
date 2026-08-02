"use client";
import { useState } from "react";

export default function AdminRegisterPage() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState(false);
  const [verifyEmailSent, setVerifyEmailSent] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    setMsg("");
    if (username.trim().length < 1) return setMsg("請輸入帳號");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setMsg("請輸入有效的 Email");
    if (password.length < 8) return setMsg("密碼至少要 8 個字");
    if (password !== confirmPassword) return setMsg("兩次輸入的密碼不一樣");
    if (!inviteCode.trim()) return setMsg("請輸入邀請碼");

    setSubmitting(true);
    try {
      const r = await fetch("/api/admin/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password, inviteCode }),
      });
      const d = await r.json();
      if (!r.ok) return setMsg(d.error || "註冊失敗");
      setVerifyEmailSent(d.verifyEmailSent !== false);
      setDone(true);
    } catch {
      setMsg("網路連線失敗，請再試一次");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div style={{ maxWidth: 380, margin: "80px auto", padding: 20, textAlign: "center" }}>
        <h2>註冊成功</h2>
        <p style={{ color: "#6B6858", fontSize: 14 }}>
          你已經自動登入，可以直接進入後台了。
          {verifyEmailSent
            ? "我們也寄了一封驗證信到你的信箱，記得去點連結驗證（如果收件匣沒看到，記得也檢查一下垃圾郵件匣）。"
            : "但驗證信寄送失敗了，可以之後到「我的帳號設定」重新觸發寄送。"}
        </p>
        <a className="btn" href="/admin" style={{ display: "inline-block", marginTop: 12, textDecoration: "none" }}>
          前往後台
        </a>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 380, margin: "60px auto", padding: 20 }}>
      <h2>建立管理者帳號</h2>
      <p style={{ color: "#6B6858", fontSize: 13, marginBottom: 16 }}>
        這個頁面只給拿到邀請碼的人使用，用來自己建立後台帳號。
      </p>

      <div className="id-row">
        <span className="id-label">帳號</span>
        <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="帳號" />
      </div>
      <div className="id-row">
        <span className="id-label">Email</span>
        <input type="text" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="用來驗證信箱、忘記密碼時找回帳號" />
      </div>
      <div className="id-row">
        <span className="id-label">密碼</span>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="至少 8 個字" />
      </div>
      <div className="id-row">
        <span className="id-label">確認密碼</span>
        <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="再輸入一次" />
      </div>
      <div className="id-row">
        <span className="id-label">邀請碼</span>
        <input type="text" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} />
      </div>

      <div style={{ color: "#dc2626", fontSize: 13, minHeight: 18, margin: "6px 0" }}>{msg}</div>
      <button className="btn" onClick={onSubmit} disabled={submitting}>{submitting ? "建立中…" : "建立帳號"}</button>

      <p style={{ marginTop: 16, fontSize: 13 }}>
        已經有帳號了？<a href="/admin">回到登入頁</a>
      </p>
    </div>
  );
}

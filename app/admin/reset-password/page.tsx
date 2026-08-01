"use client";
import { useEffect, useState } from "react";

export default function AdminResetPasswordPage() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get("token") || "");
  }, []);

  async function onSubmit() {
    setMsg("");
    if (!token) return setMsg("連結參數缺失，請重新從信件裡的連結進入");
    if (password.length < 8) return setMsg("密碼至少要 8 個字");
    if (password !== confirmPassword) return setMsg("兩次輸入的密碼不一樣");

    setSubmitting(true);
    try {
      const r = await fetch("/api/admin/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const d = await r.json();
      if (!r.ok) return setMsg(d.error || "重設失敗");
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
        <h2>密碼已重設</h2>
        <a className="btn" href="/admin" style={{ display: "inline-block", marginTop: 12, textDecoration: "none" }}>
          前往登入
        </a>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 380, margin: "80px auto", padding: 20 }}>
      <h2>設定新密碼</h2>
      <div className="id-row">
        <span className="id-label">新密碼</span>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="至少 8 個字" />
      </div>
      <div className="id-row">
        <span className="id-label">確認密碼</span>
        <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="再輸入一次" />
      </div>
      <div style={{ color: "#dc2626", fontSize: 13, minHeight: 18, margin: "6px 0" }}>{msg}</div>
      <button className="btn" onClick={onSubmit} disabled={submitting}>{submitting ? "送出中…" : "重設密碼"}</button>
    </div>
  );
}

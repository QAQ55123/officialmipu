"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [profileUrl, setProfileUrl] = useState("");
  const [msg, setMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password, confirmPassword, profileUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "註冊失敗");
      setDone(true);
    } catch (err: any) {
      setMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div style={{ maxWidth: 400, margin: "60px auto", padding: "0 16px", textAlign: "center" }}>
        <h2>註冊成功</h2>
        <p style={{ color: "var(--muted)" }}>已寄出驗證信到你的信箱，你現在已經是登入狀態了。</p>
        <button className="btn" onClick={() => router.push("/")}>前往首頁</button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 400, margin: "60px auto", padding: "0 16px" }}>
      <h2 className="section-title" style={{ textAlign: "center" }}>註冊帳號</h2>
      <form onSubmit={onSubmit} className="auth-card">
        <div className="id-row">
          <span className="id-label">帳號</span>
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} required />
        </div>
        <div className="id-row">
          <span className="id-label">Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="id-row">
          <span className="id-label">密碼</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <div className="id-row">
          <span className="id-label">確認密碼</span>
          <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
        </div>
        <div className="id-row">
          <span className="id-label">個人頁（選填）</span>
          <input type="text" value={profileUrl} onChange={(e) => setProfileUrl(e.target.value)} placeholder="Facebook個人頁網址，選填" />
        </div>
        <div className="auth-msg">{msg}</div>
        <button className="btn" type="submit" disabled={submitting}>{submitting ? "註冊中…" : "註冊"}</button>
      </form>
      <p style={{ textAlign: "center", marginTop: 16, fontSize: 13 }}>
        已經有帳號？<Link href="/login">登入</Link>
      </p>
    </div>
  );
}

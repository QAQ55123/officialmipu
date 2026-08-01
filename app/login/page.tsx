"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "登入失敗");
      router.push("/");
    } catch (err: any) {
      setMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 400, margin: "60px auto", padding: "0 16px" }}>
      <h2 className="section-title" style={{ textAlign: "center" }}>會員登入</h2>
      <form onSubmit={onSubmit} className="auth-card">
        <div className="id-row">
          <span className="id-label">帳號</span>
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} required />
        </div>
        <div className="id-row">
          <span className="id-label">密碼</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <div className="auth-msg">{msg}</div>
        <button className="btn" type="submit" disabled={submitting}>{submitting ? "登入中…" : "登入"}</button>
      </form>
      <p style={{ textAlign: "center", marginTop: 16, fontSize: 13 }}>
        還沒有帳號？<Link href="/register">註冊</Link>
      </p>
    </div>
  );
}

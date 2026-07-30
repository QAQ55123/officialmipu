"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, confirmPassword, email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "註冊失敗");
      setDone(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div style={{ maxWidth: 380, margin: "60px auto", padding: 16, textAlign: "center" }}>
        <h1 style={{ fontSize: 20 }}>註冊成功</h1>
        <p style={{ color: "#9A9787", fontSize: 14 }}>
          已寄出驗證信到你的信箱，請完成驗證。你現在已經是登入狀態了。
        </p>
        <button className="btn" onClick={() => router.push("/campaigns")}>
          前往檔期列表
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 380, margin: "60px auto", padding: 16 }}>
      <h1 style={{ fontSize: 20, marginBottom: 20, textAlign: "center" }}>註冊帳號</h1>

      {error && <div className="admin-error-box">{error}</div>}

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="admin-form-row">
          <label>帳號</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} required />
        </div>
        <div className="admin-form-row">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="admin-form-row">
          <label>密碼（至少6碼）</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <div className="admin-form-row">
          <label>確認密碼</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        </div>
        <button className="btn" type="submit" disabled={submitting}>
          {submitting ? "註冊中…" : "註冊"}
        </button>
      </form>

      <div style={{ marginTop: 16, textAlign: "center", fontSize: 13 }}>
        <Link href="/login">已經有帳號？登入</Link>
      </div>
    </div>
  );
}

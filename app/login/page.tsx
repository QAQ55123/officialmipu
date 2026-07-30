"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "登入失敗");
      router.push("/campaigns");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 380, margin: "60px auto", padding: 16 }}>
      <h1 style={{ fontSize: 20, marginBottom: 20, textAlign: "center" }}>會員登入</h1>

      {error && <div className="admin-error-box">{error}</div>}

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="admin-form-row">
          <label>帳號</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} required />
        </div>
        <div className="admin-form-row">
          <label>密碼</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <button className="btn" type="submit" disabled={submitting}>
          {submitting ? "登入中…" : "登入"}
        </button>
      </form>

      <div style={{ marginTop: 16, textAlign: "center", fontSize: 13, display: "flex", justifyContent: "center", gap: 16 }}>
        <Link href="/register">還沒有帳號？註冊</Link>
        <Link href="/forgot-password">忘記密碼</Link>
      </div>
    </div>
  );
}

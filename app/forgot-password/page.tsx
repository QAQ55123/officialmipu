"use client";
import { useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit() {
    setMsg("");
    if (!email.trim()) return setMsg("請輸入 Email");
    setSubmitting(true);
    try {
      const r = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!r.ok) {
        const d = await r.json();
        setMsg(d.error || "發生錯誤，請再試一次");
        return;
      }
      setSent(true);
    } catch {
      setMsg("網路連線失敗，請再試一次");
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div style={{ maxWidth: 380, margin: "80px auto", padding: 20, textAlign: "center" }}>
        <h2>信已經寄出了</h2>
        <p style={{ color: "#6B6858", fontSize: 14 }}>
          如果這個 Email 有對應的帳號，我們已經寄了一封重設密碼的連結過去，1 小時內有效。如果收件匣沒看到，記得也檢查一下垃圾郵件匣。
        </p>
        <a href="/">回到首頁</a>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 380, margin: "80px auto", padding: 20 }}>
      <h2>忘記密碼</h2>
      <p style={{ color: "#6B6858", fontSize: 13, marginBottom: 16 }}>
        如果你有登記過 Email，輸入後我們會寄一封重設密碼的連結給你。
      </p>
      <div className="id-row">
        <span className="id-label">Email</span>
        <input type="text" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onSubmit()} />
      </div>
      <div style={{ color: "#dc2626", fontSize: 13, minHeight: 18, margin: "6px 0" }}>{msg}</div>
      <button className="btn" onClick={onSubmit} disabled={submitting}>{submitting ? "送出中…" : "寄送重設連結"}</button>
      <p style={{ marginTop: 16, fontSize: 13 }}>
        <a href="/">回到首頁</a>
      </p>
    </div>
  );
}

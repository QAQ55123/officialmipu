"use client";
import { useEffect, useState } from "react";

export default function EmailVerifiedPage() {
  const [status, setStatus] = useState<"pending" | "success" | "invalid" | "">("");
  const [token, setToken] = useState("");
  const [scope, setScope] = useState<"member" | "admin">("member");
  const [submitting, setSubmitting] = useState(false);
  const [returnTo, setReturnTo] = useState("/?openLogin=1");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token");
    const s = params.get("status");
    const rt = params.get("returnTo");
    if (params.get("scope") === "admin") setScope("admin");
    if (rt) setReturnTo(rt);
    if (t) {
      setToken(t);
      setStatus("pending"); // 有 token：顯示確認按鈕，等使用者自己按才真的驗證
    } else if (s === "success" || s === "invalid") {
      setStatus(s);
    }
  }, []);

  async function confirmVerify() {
    setSubmitting(true);
    try {
      const url = scope === "admin" ? "/api/admin/auth/verify-email" : "/api/auth/verify-email";
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const d = await r.json();
      setStatus(d.status === "success" ? "success" : "invalid");
    } catch {
      setStatus("invalid");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 380, margin: "80px auto", padding: 20, textAlign: "center" }}>
      {status === "pending" && (
        <>
          <h2>確認信箱驗證</h2>
          <p style={{ color: "#6B6858", fontSize: 14 }}>請按下方按鈕完成信箱驗證。</p>
          <button className="btn" onClick={confirmVerify} disabled={submitting} style={{ marginTop: 12 }}>
            {submitting ? "驗證中…" : "完成驗證"}
          </button>
        </>
      )}
      {status === "success" && (
        <>
          <h2>信箱驗證成功！</h2>
          <p style={{ color: "#6B6858", fontSize: 14 }}>你的信箱已經完成驗證，現在可以回去登入使用了。</p>
        </>
      )}
      {status === "invalid" && (
        <>
          <h2>驗證連結無效或已過期</h2>
          <p style={{ color: "#6B6858", fontSize: 14 }}>請重新登入後，到「編輯會員資料」重新觸發寄送驗證信。</p>
        </>
      )}
      {status === "" && (
        <>
          <h2>找不到驗證結果</h2>
          <p style={{ color: "#6B6858", fontSize: 14 }}>這個頁面需要透過信件裡的連結進入。</p>
        </>
      )}
      {status !== "pending" && (
        <a className="btn" href={returnTo} style={{ display: "inline-block", marginTop: 12, textDecoration: "none" }}>
          返回登入頁面
        </a>
      )}
    </div>
  );
}

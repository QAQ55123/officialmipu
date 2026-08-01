"use client";
import { useEffect, useState } from "react";

export default function EmailVerifiedPage() {
  const [status, setStatus] = useState<"success" | "invalid" | "">("");
  const [returnTo, setReturnTo] = useState("/?openLogin=1");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get("status");
    if (s === "success" || s === "invalid") setStatus(s);
    const rt = params.get("returnTo");
    if (rt) setReturnTo(rt);
  }, []);

  return (
    <div style={{ maxWidth: 380, margin: "80px auto", padding: 20, textAlign: "center" }}>
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
      <a className="btn" href={returnTo} style={{ display: "inline-block", marginTop: 12, textDecoration: "none" }}>
        返回登入頁面
      </a>
    </div>
  );
}

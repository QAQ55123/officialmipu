"use client";

import { useState } from "react";

const CONFIRM_PHRASE = "清空所有資料";

export default function DangerZoneSection() {
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleReset() {
    if (confirmText !== CONFIRM_PHRASE) {
      setError(`請輸入正確的確認文字「${CONFIRM_PHRASE}」`);
      return;
    }
    if (!confirm("真的確定嗎？這個動作沒辦法復原，會清空整個系統的所有資料，包含所有管理者帳號在內。")) return;

    setSubmitting(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/admin/reset-all-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: confirmText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "重置失敗");
      setResult(data);
      // 重置後管理者帳號也被清空了，session已失效，導回登入頁
      setTimeout(() => {
        window.location.href = "/admin/register";
      }, 3000);
    } catch (e: any) {
      setError(e.message);
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div
        style={{
          background: "#FDE8E8",
          border: "1px solid #F5B5B5",
          borderRadius: 10,
          padding: 20,
        }}
      >
        <h3 style={{ margin: "0 0 8px", color: "var(--danger)" }}>危險操作：一鍵重置所有資料</h3>
        <p style={{ fontSize: 13, color: "#7A2020", marginBottom: 16 }}>
          這會把系統裡的檔期、商品、訂單、會員、管理者帳號等所有業務資料**全部清空**，回到一片白紙的狀態。
          這個動作沒辦法復原，執行後所有管理者(包含你自己)都要重新用邀請碼註冊。請確認你真的知道自己在做什麼。
        </p>

        {error && <div className="admin-error-box">{error}</div>}
        {result && (
          <div style={{ fontSize: 13, marginBottom: 12 }}>
            已清空完成，3秒後導向重新註冊頁面…
            {result.warnings?.length > 0 && (
              <ul style={{ color: "var(--danger)" }}>
                {result.warnings.map((w: string, i: number) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="admin-form-row">
          <label>請輸入「{CONFIRM_PHRASE}」以確認</label>
          <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
        </div>
        <button
          onClick={handleReset}
          disabled={submitting || confirmText !== CONFIRM_PHRASE}
          style={{ background: "var(--danger)", color: "#fff", border: "none", borderRadius: 8, padding: "10px 16px" }}
        >
          {submitting ? "處理中…" : "永久清空所有資料"}
        </button>
      </div>
    </div>
  );
}

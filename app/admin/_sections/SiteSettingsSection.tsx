"use client";

import { useEffect, useState } from "react";

export default function SiteSettingsSection() {
  const [checkoutNotice, setCheckoutNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    const res = await fetch("/api/admin/site-settings");
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "只有最高權限管理者(owner)能使用這個功能");
      setLoading(false);
      return;
    }
    setCheckoutNotice(data.checkoutNotice || "");
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSave() {
    setError("");
    setSaved(false);
    try {
      const res = await fetch("/api/admin/site-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "checkout_notice", value: checkoutNotice }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "儲存失敗");
      setSaved(true);
    } catch (e: any) {
      setError(e.message);
    }
  }

  if (loading) return <div className="admin-empty">載入中…</div>;

  return (
    <div>
      <p className="admin-sub">跟資料庫連線無關的營運設定，修改後立即在前台生效</p>
      {error && <div className="admin-error-box">{error}</div>}

      {!error && (
        <div className="admin-form-card">
          <div className="admin-form-row">
            <label>結帳頁提示文字</label>
            <textarea rows={4} value={checkoutNotice} onChange={(e) => setCheckoutNotice(e.target.value)} />
          </div>
          <div className="admin-form-actions">
            <button className="btn" onClick={handleSave}>
              儲存設定
            </button>
            {saved && <span style={{ fontSize: 13, color: "var(--muted)", alignSelf: "center" }}>已儲存</span>}
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type GiftStyle = { id: string; style_name: string; threshold_amount: number };

export default function GiftStylesPage() {
  const params = useParams();
  const campaignId = params.id as string;
  const [styles, setStyles] = useState<GiftStyle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [threshold, setThreshold] = useState(100);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/admin/campaigns/${campaignId}/gift-styles`);
    const data = await res.json();
    setStyles(data.giftStyles || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [campaignId]);

  async function handleAdd() {
    setError("");
    try {
      const res = await fetch(`/api/admin/campaigns/${campaignId}/gift-styles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ styleName: name, thresholdAmount: threshold }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "新增失敗");
      setName("");
      load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("確定要刪除這個款式嗎？")) return;
    await fetch(`/api/admin/campaigns/${campaignId}/gift-styles/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="admin-page">
      <nav className="admin-nav">
        <Link href="/admin">← 後台首頁</Link>
      </nav>
      <h1>滿贈款式登記</h1>
      <p className="admin-sub">
        每個款式只需登記一次：名稱＋門檻金額。門檻金額同時決定何時解鎖、以及可選數量隨金額成長的速度（2.7節）
      </p>

      {error && <div className="admin-error-box">{error}</div>}

      <div className="admin-form-card">
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input placeholder="款式名稱" value={name} onChange={(e) => setName(e.target.value)} />
          <span style={{ fontSize: 13, color: "var(--muted)" }}>門檻金額</span>
          <input type="number" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} style={{ width: 90 }} />
          <button className="btn" onClick={handleAdd}>
            新增款式
          </button>
        </div>
      </div>

      {loading ? (
        <div className="admin-empty">載入中…</div>
      ) : styles.length === 0 ? (
        <div className="admin-empty">還沒有登記任何滿贈款式</div>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>款式名稱</th>
              <th>門檻金額</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {styles.map((s) => (
              <tr key={s.id}>
                <td>{s.style_name}</td>
                <td>{s.threshold_amount}</td>
                <td className="admin-row-actions">
                  <button className="admin-link-btn danger" onClick={() => handleDelete(s.id)}>
                    刪除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

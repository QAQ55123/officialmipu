"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Campaign = {
  id: string;
  name: string;
  opens_at: string;
  closes_at: string;
  gift_base_unit: number;
  vendor_order_gift_cap: number | null;
  cod_campaign_cap: number | null;
};

// 8種交易組合的欄位定義：{交易方式} x {滿減} x {滿贈}
const TXN_COMBOS = [
  { key: "txn_bank_discount_gift", label: "匯款 · 有滿減 · 有滿贈" },
  { key: "txn_bank_discount_nogift", label: "匯款 · 有滿減 · 無滿贈" },
  { key: "txn_bank_nodiscount_gift", label: "匯款 · 無滿減 · 有滿贈" },
  { key: "txn_bank_nodiscount_nogift", label: "匯款 · 無滿減 · 無滿贈" },
  { key: "txn_cod_discount_gift", label: "取付 · 有滿減 · 有滿贈" },
  { key: "txn_cod_discount_nogift", label: "取付 · 有滿減 · 無滿贈" },
  { key: "txn_cod_nodiscount_gift", label: "取付 · 無滿減 · 有滿贈" },
  { key: "txn_cod_nodiscount_nogift", label: "取付 · 無滿減 · 無滿贈" },
];

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

  // 新增檔期表單狀態
  const [name, setName] = useState("");
  const [opensAt, setOpensAt] = useState("");
  const [closesAt, setClosesAt] = useState("");
  const [giftBaseUnit, setGiftBaseUnit] = useState(100);
  const [vendorOrderGiftCap, setVendorOrderGiftCap] = useState<number | "">("");
  const [codCampaignCap, setCodCampaignCap] = useState<number | "">("");
  const [rates, setRates] = useState<Record<string, { enabled: boolean; rate: string }>>(
    Object.fromEntries(TXN_COMBOS.map((c) => [c.key, { enabled: true, rate: "" }]))
  );

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/campaigns");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "載入失敗");
      setCampaigns(data.campaigns || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate() {
    setError("");
    const rateFields: Record<string, any> = {};
    for (const combo of TXN_COMBOS) {
      rateFields[`${combo.key}_enabled`] = rates[combo.key].enabled;
      rateFields[`${combo.key}_rate`] = rates[combo.key].rate ? Number(rates[combo.key].rate) : null;
    }

    try {
      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          opensAt,
          closesAt,
          giftBaseUnit,
          vendorOrderGiftCap: vendorOrderGiftCap || null,
          codCampaignCap: codCampaignCap || null,
          rates: rateFields,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "建立失敗");
      setShowForm(false);
      setName("");
      setOpensAt("");
      setCloseAtReset();
      load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  function setCloseAtReset() {
    setClosesAt("");
  }

  async function handleDelete(id: string) {
    if (!confirm("確定要刪除這個檔期嗎？")) return;
    try {
      const res = await fetch(`/api/admin/campaigns/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "刪除失敗");
      load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <div className="admin-page">
      <nav className="admin-nav">
        <Link href="/admin" className="">
          ← 後台首頁
        </Link>
      </nav>
      <h1>檔期管理</h1>
      <p className="admin-sub">每個檔期＝一次開放採購的時間區間，取名如「XX訂購」</p>

      {error && <div className="admin-error-box">{error}</div>}

      <div className="admin-toolbar">
        <button className="btn" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "收起表單" : "＋ 新增檔期"}
        </button>
      </div>

      {showForm && (
        <div className="admin-form-card">
          <div className="admin-form-row">
            <label>檔期名稱</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="如：男生宿舍第三彈訂購" />
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <div className="admin-form-row" style={{ flex: 1 }}>
              <label>開放起始時間</label>
              <input type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} />
            </div>
            <div className="admin-form-row" style={{ flex: 1 }}>
              <label>開放結束時間</label>
              <input type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <div className="admin-form-row" style={{ flex: 1 }}>
              <label>滿贈基礎單位</label>
              <input
                type="number"
                value={giftBaseUnit}
                onChange={(e) => setGiftBaseUnit(Number(e.target.value))}
              />
            </div>
            <div className="admin-form-row" style={{ flex: 1 }}>
              <label>廠商單張採購單贈品上限（供拆單工具使用）</label>
              <input
                type="number"
                value={vendorOrderGiftCap}
                onChange={(e) => setVendorOrderGiftCap(e.target.value === "" ? "" : Number(e.target.value))}
              />
            </div>
            <div className="admin-form-row" style={{ flex: 1 }}>
              <label>取付檔期總上限（達標自動關閉取付）</label>
              <input
                type="number"
                value={codCampaignCap}
                onChange={(e) => setCodCampaignCap(e.target.value === "" ? "" : Number(e.target.value))}
              />
            </div>
          </div>

          <div style={{ marginTop: 16, marginBottom: 8, fontSize: 14, fontWeight: 500 }}>
            8種交易組合（各自啟用開關 + 匯率）
          </div>
          <table className="admin-table">
            <thead>
              <tr>
                <th>組合</th>
                <th>啟用</th>
                <th>匯率</th>
              </tr>
            </thead>
            <tbody>
              {TXN_COMBOS.map((combo) => (
                <tr key={combo.key}>
                  <td>{combo.label}</td>
                  <td>
                    <input
                      type="checkbox"
                      checked={rates[combo.key].enabled}
                      onChange={(e) =>
                        setRates((prev) => ({
                          ...prev,
                          [combo.key]: { ...prev[combo.key], enabled: e.target.checked },
                        }))
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      style={{ width: 90 }}
                      value={rates[combo.key].rate}
                      onChange={(e) =>
                        setRates((prev) => ({
                          ...prev,
                          [combo.key]: { ...prev[combo.key], rate: e.target.value },
                        }))
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="admin-form-actions">
            <button className="btn" onClick={handleCreate}>
              建立檔期
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="admin-empty">載入中…</div>
      ) : campaigns.length === 0 ? (
        <div className="admin-empty">還沒有任何檔期，建立第一個檔期開始吧</div>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>檔期名稱</th>
              <th>開放時間</th>
              <th>滿贈基礎單位</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td style={{ fontSize: 13, color: "var(--muted)" }}>
                  {new Date(c.opens_at).toLocaleString("zh-TW")} ～ {new Date(c.closes_at).toLocaleString("zh-TW")}
                </td>
                <td>{c.gift_base_unit}</td>
                <td className="admin-row-actions">
                  <Link href={`/admin/campaigns/${c.id}/gift-styles`} className="admin-link-btn">
                    滿贈款式
                  </Link>
                  <Link href={`/admin/campaigns/${c.id}/split-order`} className="admin-link-btn">
                    拆單工具
                  </Link>
                  <Link href={`/admin/campaigns/${c.id}/orders`} className="admin-link-btn">
                    訂單
                  </Link>
                  <Link href={`/admin/campaigns/${c.id}/cost-sheet`} className="admin-link-btn">
                    成本SHEET
                  </Link>
                  <a href={`/api/admin/campaigns/${c.id}/export`} className="admin-link-btn">
                    匯出Excel
                  </a>
                  <button className="admin-link-btn danger" onClick={() => handleDelete(c.id)}>
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

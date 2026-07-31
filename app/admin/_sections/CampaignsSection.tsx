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
  sort_order: number;
  [key: string]: any;
};

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

function emptyRates() {
  return Object.fromEntries(TXN_COMBOS.map((c) => [c.key, { enabled: true, rate: "" }]));
}

export default function CampaignsSection({ isOwner }: { isOwner: boolean }) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null); // null=新增表單關閉；"new"=新增；否則是編輯中的id
  const [name, setName] = useState("");
  const [opensAt, setOpensAt] = useState("");
  const [closesAt, setClosesAt] = useState("");
  const [giftBaseUnit, setGiftBaseUnit] = useState(100);
  const [vendorOrderGiftCap, setVendorOrderGiftCap] = useState<number | "">("");
  const [codCampaignCap, setCodCampaignCap] = useState<number | "">("");
  const [rates, setRates] = useState<Record<string, { enabled: boolean; rate: string }>>(emptyRates());

  const [notifyingId, setNotifyingId] = useState<string | null>(null);
  const [notifySubject, setNotifySubject] = useState("");
  const [notifyBody, setNotifyBody] = useState("");
  const [notifyShopLink, setNotifyShopLink] = useState("");
  const [notifyRecipients, setNotifyRecipients] = useState<{ emailCount: number; memberCount: number } | null>(null);
  const [notifyResult, setNotifyResult] = useState<any>(null);
  const [notifySending, setNotifySending] = useState(false);

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

  function openNew() {
    setEditingId("new");
    setName("");
    setOpensAt("");
    setCloesAtReset();
    setGiftBaseUnit(100);
    setVendorOrderGiftCap("");
    setCodCampaignCap("");
    setRates(emptyRates());
  }
  function setCloesAtReset() {
    setClosesAt("");
  }

  function openEdit(c: Campaign) {
    setEditingId(c.id);
    setName(c.name);
    setOpensAt(c.opens_at?.slice(0, 16) || "");
    setClosesAt(c.closes_at?.slice(0, 16) || "");
    setGiftBaseUnit(c.gift_base_unit || 100);
    setVendorOrderGiftCap(c.vendor_order_gift_cap ?? "");
    setCodCampaignCap(c.cod_campaign_cap ?? "");
    const r = emptyRates();
    for (const combo of TXN_COMBOS) {
      r[combo.key] = {
        enabled: c[`${combo.key}_enabled`] ?? true,
        rate: c[`${combo.key}_rate`] != null ? String(c[`${combo.key}_rate`]) : "",
      };
    }
    setRates(r);
  }

  async function handleSave() {
    setError("");
    const rateFields: Record<string, any> = {};
    for (const combo of TXN_COMBOS) {
      rateFields[`${combo.key}_enabled`] = rates[combo.key].enabled;
      rateFields[`${combo.key}_rate`] = rates[combo.key].rate ? Number(rates[combo.key].rate) : null;
    }

    try {
      if (editingId === "new") {
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
      } else if (editingId) {
        const res = await fetch(`/api/admin/campaigns/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            opens_at: opensAt,
            closes_at: closesAt,
            gift_base_unit: giftBaseUnit,
            vendor_order_gift_cap: vendorOrderGiftCap || null,
            cod_campaign_cap: codCampaignCap || null,
            ...rateFields,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "更新失敗");
      }
      setEditingId(null);
      load();
    } catch (e: any) {
      setError(e.message);
    }
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

  async function persistOrder(next: Campaign[]) {
    setCampaigns(next);
    await fetch("/api/admin/campaigns/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: next.map((c) => c.id) }),
    });
  }

  function handleDrop(targetId: string) {
    if (!draggedId || draggedId === targetId) return;
    const next = [...campaigns];
    const fromIdx = next.findIndex((c) => c.id === draggedId);
    const toIdx = next.findIndex((c) => c.id === targetId);
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    persistOrder(next);
    setDraggedId(null);
  }

  async function openNotify(id: string) {
    setNotifyingId(id);
    setNotifySubject("");
    setNotifyBody("");
    setNotifyShopLink("");
    setNotifyResult(null);
    const res = await fetch(`/api/admin/campaigns/${id}/notify-recipients`);
    const data = await res.json();
    if (res.ok) setNotifyRecipients(data);
  }

  async function handleSendNotify() {
    if (!notifyingId) return;
    setNotifySending(true);
    try {
      const res = await fetch(`/api/admin/campaigns/${notifyingId}/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: notifySubject, body: notifyBody, shopLink: notifyShopLink }),
      });
      const data = await res.json();
      setNotifyResult(data);
    } finally {
      setNotifySending(false);
    }
  }

  return (
    <div>
      <p className="admin-sub">每個檔期＝一次開放採購的時間區間，取名如「XX訂購」。拖曳可調整順序。</p>
      {error && <div className="admin-error-box">{error}</div>}

      <div className="admin-toolbar">
        <button className="btn" onClick={openNew}>
          ＋ 新增檔期
        </button>
      </div>

      {editingId && (
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
              <input type="number" value={giftBaseUnit} onChange={(e) => setGiftBaseUnit(Number(e.target.value))} />
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

          <div style={{ marginTop: 16, marginBottom: 8, fontSize: 14, fontWeight: 500 }}>8種交易組合（各自啟用開關 + 匯率）</div>
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
                      onChange={(e) => setRates((prev) => ({ ...prev, [combo.key]: { ...prev[combo.key], enabled: e.target.checked } }))}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      style={{ width: 90 }}
                      value={rates[combo.key].rate}
                      onChange={(e) => setRates((prev) => ({ ...prev, [combo.key]: { ...prev[combo.key], rate: e.target.value } }))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="admin-form-actions">
            <button className="btn" onClick={handleSave}>
              {editingId === "new" ? "建立檔期" : "儲存變更"}
            </button>
            <button onClick={() => setEditingId(null)}>取消</button>
          </div>
        </div>
      )}

      {notifyingId && (
        <div className="admin-form-card">
          <div style={{ fontWeight: 500, marginBottom: 8 }}>到貨/開賣通知信</div>
          {notifyRecipients && (
            <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>
              收件人：{notifyRecipients.memberCount} 位下單顧客，其中 {notifyRecipients.emailCount} 個不重複Email
            </div>
          )}
          <div className="admin-form-row">
            <label>信件標題（可用 {"{檔期名稱}"} 佔位符）</label>
            <input value={notifySubject} onChange={(e) => setNotifySubject(e.target.value)} />
          </div>
          <div className="admin-form-row">
            <label>內文（可用 {"{檔期名稱}"} 佔位符；文字裡的「賣場」兩字會自動變成連結）</label>
            <textarea rows={5} value={notifyBody} onChange={(e) => setNotifyBody(e.target.value)} />
          </div>
          <div className="admin-form-row">
            <label>賣場連結（選填）</label>
            <input value={notifyShopLink} onChange={(e) => setNotifyShopLink(e.target.value)} />
          </div>
          <div className="admin-form-actions">
            <button className="btn" onClick={handleSendNotify} disabled={notifySending}>
              {notifySending ? "寄送中…" : "發送通知信"}
            </button>
            <button onClick={() => setNotifyingId(null)}>關閉</button>
          </div>
          {notifyResult && (
            <div style={{ marginTop: 8, fontSize: 13 }}>
              成功寄出 {notifyResult.sent} 封
              {notifyResult.failed?.length > 0 && (
                <ul style={{ color: "var(--danger)" }}>
                  {notifyResult.failed.map((f: string, i: number) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="admin-empty">載入中…</div>
      ) : campaigns.length === 0 ? (
        <div className="admin-empty">還沒有任何檔期</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {campaigns.map((c) => (
            <div
              key={c.id}
              draggable
              onDragStart={() => setDraggedId(c.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(c.id)}
              style={{ background: "#fff", border: "1px solid #E5E1D3", borderRadius: 8, padding: 12, cursor: "grab" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <span>
                  ⠿ <strong>{c.name}</strong>
                  <span style={{ fontSize: 13, color: "var(--muted)", marginLeft: 8 }}>
                    {new Date(c.opens_at).toLocaleString("zh-TW")} ～ {new Date(c.closes_at).toLocaleString("zh-TW")}
                  </span>
                </span>
                <div className="admin-row-actions" style={{ flexWrap: "wrap" }}>
                  <button className="admin-link-btn" onClick={() => openEdit(c)}>
                    編輯
                  </button>
                  <Link href={`/admin/campaigns/${c.id}/products`} className="admin-link-btn">
                    檔期商品
                  </Link>
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
                  {isOwner && (
                    <button className="admin-link-btn" onClick={() => openNotify(c.id)}>
                      到貨通知信
                    </button>
                  )}
                  <button className="admin-link-btn danger" onClick={() => handleDelete(c.id)}>
                    刪除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

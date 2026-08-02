"use client";
import { useEffect, useState } from "react";

type Campaign = { id: string; name: string; opens_at: string; closes_at: string; gift_base_unit: number; vendor_order_gift_cap: number | null; cod_campaign_cap: number | null; [key: string]: any };

const TXN_COMBOS = [
  { key: "txn_bank_discount_gift", label: "匯款・有滿減・有滿贈" },
  { key: "txn_bank_discount_nogift", label: "匯款・有滿減・無滿贈" },
  { key: "txn_bank_nodiscount_gift", label: "匯款・無滿減・有滿贈" },
  { key: "txn_bank_nodiscount_nogift", label: "匯款・無滿減・無滿贈" },
  { key: "txn_cod_discount_gift", label: "取付・有滿減・有滿贈" },
  { key: "txn_cod_discount_nogift", label: "取付・有滿減・無滿贈" },
  { key: "txn_cod_nodiscount_gift", label: "取付・無滿減・有滿贈" },
  { key: "txn_cod_nodiscount_nogift", label: "取付・無滿減・無滿贈" },
];
function emptyRates() {
  return Object.fromEntries(TXN_COMBOS.map((c) => [c.key, { enabled: true, rate: "" }]));
}

export default function CampaignsSection() {
  /** 把資料庫存的 UTC 時間轉成台灣時間格式的 datetime-local 字串（給表單顯示用） */
  function toTaipeiDatetimeLocal(iso: string): string {
    const d = new Date(iso);
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value || "00";
    return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
  }
  /** 把表單填的 datetime-local 字串當成台灣時間解讀，轉成正確的 UTC ISO 字串存進資料庫
   *  （不管管理者的瀏覽器本身設定在哪個時區，都固定用台灣時間解讀，避免跳時區） */
  function fromTaipeiDatetimeLocal(value: string): string {
    return new Date(`${value}:00+08:00`).toISOString();
  }
  const [list, setList] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null); // "new" 或某個id
  const [name, setName] = useState("");
  const [opensAt, setOpensAt] = useState("");
  const [closesAt, setClosesAt] = useState("");
  const [giftBaseUnit, setGiftBaseUnit] = useState(100);
  const [vendorOrderGiftCap, setVendorOrderGiftCap] = useState<number | "">("");
  const [codCampaignCap, setCodCampaignCap] = useState<number | "">("");
  const [rates, setRates] = useState<Record<string, { enabled: boolean; rate: string }>>(emptyRates());

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/campaigns");
    const data = await res.json();
    setList(data.campaigns || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function openNew() {
    setEditingId("new"); setName(""); setOpensAt(""); setClosesAt("");
    setGiftBaseUnit(100); setVendorOrderGiftCap(""); setCodCampaignCap(""); setRates(emptyRates());
  }
  function openEdit(c: Campaign) {
    setEditingId(c.id); setName(c.name);
    setOpensAt(c.opens_at ? toTaipeiDatetimeLocal(c.opens_at) : ""); setClosesAt(c.closes_at ? toTaipeiDatetimeLocal(c.closes_at) : "");
    setGiftBaseUnit(c.gift_base_unit || 100);
    setVendorOrderGiftCap(c.vendor_order_gift_cap ?? "");
    setCodCampaignCap(c.cod_campaign_cap ?? "");
    const r = emptyRates();
    for (const combo of TXN_COMBOS) {
      r[combo.key] = { enabled: c[`${combo.key}_enabled`] ?? true, rate: c[`${combo.key}_rate`] != null ? String(c[`${combo.key}_rate`]) : "" };
    }
    setRates(r);
  }

  async function save() {
    setMsg("");
    const rateFields: Record<string, any> = {};
    for (const combo of TXN_COMBOS) {
      rateFields[`${combo.key}_enabled`] = rates[combo.key].enabled;
      rateFields[`${combo.key}_rate`] = rates[combo.key].rate ? Number(rates[combo.key].rate) : null;
    }
    try {
      const res = editingId === "new"
        ? await fetch("/api/admin/campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, opensAt: fromTaipeiDatetimeLocal(opensAt), closesAt: fromTaipeiDatetimeLocal(closesAt), giftBaseUnit, vendorOrderGiftCap: vendorOrderGiftCap || null, codCampaignCap: codCampaignCap || null, rates: rateFields }) })
        : await fetch(`/api/admin/campaigns/${editingId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, opens_at: fromTaipeiDatetimeLocal(opensAt), closes_at: fromTaipeiDatetimeLocal(closesAt), gift_base_unit: giftBaseUnit, vendor_order_gift_cap: vendorOrderGiftCap || null, cod_campaign_cap: codCampaignCap || null, ...rateFields }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "儲存失敗");
      setEditingId(null);
      load();
    } catch (e: any) {
      setMsg(e.message);
    }
  }

  async function deleteItem(id: string) {
    if (!confirm("確定要刪除這個檔期嗎？")) return;
    await fetch(`/api/admin/campaigns/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="auth-card">
      <h3>檔期管理</h3>
      <p style={{ fontSize: 13, color: "#8A8779" }}>檔期純粹是時間窗口，開放時間內可下單，時間外僅能瀏覽</p>

      {!editingId && <button className="btn" onClick={openNew}>＋ 新增檔期</button>}
      {msg && <div style={{ fontSize: 13, color: "#dc2626", marginTop: 6 }}>{msg}</div>}

      {editingId && (
        <div style={{ marginTop: 12, borderTop: "1px solid #EDE9DC", paddingTop: 12 }}>
          <div className="id-row"><span className="id-label">名稱</span><input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="如：XX訂購" /></div>
          <div className="id-row"><span className="id-label">開放起始</span><input type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} /></div>
          <div className="id-row"><span className="id-label">開放結束</span><input type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} /></div>
          <div className="id-row"><span className="id-label">滿贈基礎單位</span><input type="number" value={giftBaseUnit} onChange={(e) => setGiftBaseUnit(Number(e.target.value))} /></div>
          <div className="id-row"><span className="id-label">廠商採購單贈品上限</span><input type="number" value={vendorOrderGiftCap} onChange={(e) => setVendorOrderGiftCap(e.target.value === "" ? "" : Number(e.target.value))} /></div>
          <div className="id-row"><span className="id-label">取付檔期總上限</span><input type="number" value={codCampaignCap} onChange={(e) => setCodCampaignCap(e.target.value === "" ? "" : Number(e.target.value))} /></div>

          <p style={{ fontSize: 13, fontWeight: 600, margin: "12px 0 6px" }}>8種交易組合</p>
          {TXN_COMBOS.map((combo) => (
            <div key={combo.key} className="id-row">
              <span className="id-label" style={{ minWidth: 160 }}>{combo.label}</span>
              <input type="checkbox" checked={rates[combo.key].enabled} onChange={(e) => setRates((prev) => ({ ...prev, [combo.key]: { ...prev[combo.key], enabled: e.target.checked } }))} />
              <input type="number" step="0.01" style={{ width: 90 }} value={rates[combo.key].rate} onChange={(e) => setRates((prev) => ({ ...prev, [combo.key]: { ...prev[combo.key], rate: e.target.value } }))} placeholder="匯率" />
            </div>
          ))}

          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button className="btn" onClick={save}>{editingId === "new" ? "建立檔期" : "儲存變更"}</button>
            <button className="btn secondary" onClick={() => setEditingId(null)}>取消</button>
          </div>
        </div>
      )}

      <div style={{ marginTop: 12, borderTop: "1px solid #EDE9DC", paddingTop: 12 }}>
        {loading ? <div style={{ fontSize: 13, color: "#8A8779" }}>載入中…</div> : list.length === 0 ? (
          <div style={{ fontSize: 13, color: "#8A8779" }}>目前沒有檔期</div>
        ) : (
          list.map((c) => (
            <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14, marginBottom: 8 }}>
              <span>{c.name}<span style={{ fontSize: 12, color: "#8A8779", marginLeft: 8 }}>{new Date(c.opens_at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })} ~ {new Date(c.closes_at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}</span></span>
              <span>
                <button className="btn small secondary" onClick={() => openEdit(c)} style={{ marginRight: 6 }}>編輯</button>
                <button className="btn small danger" onClick={() => deleteItem(c.id)}>刪除</button>
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

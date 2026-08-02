"use client";
import { useEffect, useState } from "react";

type Campaign = { id: string; name: string };

export default function OrdersSection() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/admin/campaigns").then((r) => r.json()).then((d) => setCampaigns(d.campaigns || []));
  }, []);

  useEffect(() => {
    if (!campaignId) { setOrders([]); return; }
    setLoading(true);
    fetch(`/api/admin/campaigns/${campaignId}/orders`).then((r) => r.json()).then((d) => { setOrders(d.orders || []); setLoading(false); });
  }, [campaignId]);

  return (
    <div className="auth-card">
      <h3>訂單管理</h3>
      <div className="id-row">
        <span className="id-label">選擇檔期</span>
        <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} style={{ flex: 1, padding: 8 }}>
          <option value="">請選擇</option>
          {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      {campaignId && (
        loading ? <div style={{ fontSize: 13, color: "#8A8779" }}>載入中…</div> : orders.length === 0 ? (
          <div style={{ fontSize: 13, color: "#8A8779" }}>這個檔期還沒有訂單</div>
        ) : (
          orders.map((o) => (
            <div key={o.id} style={{ padding: "8px 0", borderBottom: "1px dashed #EDE9DC", fontSize: 13 }}>
              {o.customerName} · {o.txnMethod} · {o.itemCount} 項品項 · {new Date(o.createdAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}
            </div>
          ))
        )
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

export default function CampaignOrdersPage() {
  const params = useParams();
  const campaignId = params.id as string;
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/admin/campaigns/${campaignId}/orders`)
      .then((r) => r.json())
      .then((d) => setOrders(d.orders || []))
      .finally(() => setLoading(false));
  }, [campaignId]);

  return (
    <div className="admin-page">
      <nav className="admin-nav">
        <Link href="/admin">← 後台首頁</Link>
      </nav>
      <h1>訂單管理</h1>
      <p className="admin-sub">點進單張訂單可查看到貨狀態、建立出貨批次</p>

      {loading ? (
        <div className="admin-empty">載入中…</div>
      ) : orders.length === 0 ? (
        <div className="admin-empty">這個檔期還沒有任何訂單</div>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>顧客</th>
              <th>下單時間</th>
              <th>交易方式</th>
              <th>品項數</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td>{o.customerName}</td>
                <td style={{ fontSize: 13, color: "var(--muted)" }}>{new Date(o.createdAt).toLocaleString("zh-TW")}</td>
                <td>{o.txnMethod === "bank" ? "匯款" : "取付"}</td>
                <td>{o.itemCount}</td>
                <td>
                  <Link href={`/admin/orders/${o.id}`} className="admin-link-btn">
                    管理
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

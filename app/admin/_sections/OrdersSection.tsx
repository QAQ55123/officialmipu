"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type CancelRequest = {
  orderId: string;
  username: string;
  campaignName: string;
  txnMethod: string;
  cancelRequestedAt: string;
  total: number;
};

export default function OrdersSection({ isOwner }: { isOwner: boolean }) {
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);
  const [cancelRequests, setCancelRequests] = useState<CancelRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/campaigns");
      const data = await res.json();
      setCampaigns(data.campaigns || []);

      if (isOwner) {
        const cRes = await fetch("/api/admin/orders/cancel-requests");
        const cData = await cRes.json();
        if (cRes.ok) setCancelRequests(cData.requests || []);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [isOwner]);

  async function handleApprove(orderId: string) {
    if (!confirm("確定核准取消？這會直接刪除這張訂單。")) return;
    await fetch("/api/admin/orders/cancel-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId }),
    });
    load();
  }

  async function handleReject(orderId: string) {
    await fetch("/api/admin/orders/cancel-requests", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId }),
    });
    load();
  }

  return (
    <div>
      {error && <div className="admin-error-box">{error}</div>}

      {isOwner && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontWeight: 500, marginBottom: 8 }}>取消申請審核</div>
          {cancelRequests.length === 0 ? (
            <div className="admin-empty">目前沒有待審核的取消申請</div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>顧客</th>
                  <th>檔期</th>
                  <th>交易方式</th>
                  <th>金額</th>
                  <th>申請時間</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {cancelRequests.map((r) => (
                  <tr key={r.orderId}>
                    <td>{r.username}</td>
                    <td>{r.campaignName}</td>
                    <td>{r.txnMethod}</td>
                    <td>NT$ {r.total}</td>
                    <td style={{ fontSize: 13, color: "var(--muted)" }}>{new Date(r.cancelRequestedAt).toLocaleString("zh-TW")}</td>
                    <td className="admin-row-actions">
                      <button className="admin-link-btn" onClick={() => handleApprove(r.orderId)}>
                        核准取消
                      </button>
                      <button className="admin-link-btn danger" onClick={() => handleReject(r.orderId)}>
                        拒絕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div style={{ fontWeight: 500, marginBottom: 8 }}>依檔期查看訂單</div>
      {loading ? (
        <div className="admin-empty">載入中…</div>
      ) : campaigns.length === 0 ? (
        <div className="admin-empty">還沒有任何檔期</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {campaigns.map((c) => (
            <Link
              key={c.id}
              href={`/admin/campaigns/${c.id}/orders`}
              style={{ padding: "10px 14px", background: "#fff", border: "1px solid #E5E1D3", borderRadius: 8, textDecoration: "none", color: "inherit" }}
            >
              {c.name}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

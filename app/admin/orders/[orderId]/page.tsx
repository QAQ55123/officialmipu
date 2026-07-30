"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type Candidate = { vendorItemId: string; customerName: string; qty: number };
type ArrivalStatus = "arrived" | "partial" | "not_arrived" | "untracked";
type ItemStatus = {
  orderItemId: string;
  productName: string;
  styleName: string | null;
  qty: number;
  arrivedQty: number | null;
  arrivalStatus: ArrivalStatus;
  candidates: Candidate[];
  isGift: boolean;
};

function statusBadge(item: ItemStatus) {
  if (item.arrivalStatus === "arrived") return { label: "已到貨", bg: "#E6F4EA", fg: "#1E7A3D" };
  if (item.arrivalStatus === "partial") return { label: `部分到貨 ${item.arrivedQty}/${item.qty}`, bg: "#FDF3E0", fg: "#B45309" };
  if (item.arrivalStatus === "untracked") return { label: "未逐筆追蹤（請自行核對缺口總覽）", bg: "#EFEAF9", fg: "#6D4FA8" };
  return { label: "未到貨", bg: "#FDF3E0", fg: "#B45309" };
}

export default function CustomerOrderPage() {
  const params = useParams();
  const orderId = params.orderId as string;

  const [items, setItems] = useState<ItemStatus[]>([]);
  const [memberId, setMemberId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [checked, setChecked] = useState<string[]>([]);
  const [batches, setBatches] = useState<any[]>([]);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/admin/orders/${orderId}/items`);
    const data = await res.json();
    setItems(data.items || []);
    setMemberId(data.memberId || "");
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [orderId]);

  function toggleCheck(id: string) {
    setChecked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleCreateBatch() {
    const orderItemIds = items.filter((i) => checked.includes(i.orderItemId) && !i.isGift).map((i) => i.orderItemId);
    const giftSelectionIds = items.filter((i) => checked.includes(i.orderItemId) && i.isGift).map((i) => i.orderItemId);

    const res = await fetch(`/api/admin/orders/${orderId}/shipping-batches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderItemIds, giftSelectionIds }),
    });
    const data = await res.json();
    if (res.ok) {
      setBatches((prev) => [...prev, data.batch]);
      setChecked([]);
      load();
    }
  }

  async function handleBorrow(vendorItemId: string) {
    // 挪用：呼叫拆單品項的 reassign 動作，把對方那筆的顧客改成這張訂單的顧客
    await fetch(`/api/admin/split-order/order-items/${vendorItemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reassign", newCustomerMemberId: memberId }),
    });
    load();
  }

  if (loading) return <div className="admin-page">載入中…</div>;

  const selectedFreightNote = "運費＝各品項固定運費金額加總（滿贈固定為0），批次確定後才會顯示在顧客訂單畫面上";

  return (
    <div className="admin-page" style={{ maxWidth: 700 }}>
      <nav className="admin-nav">
        <Link href="/admin">← 後台首頁</Link>
      </nav>
      <h1>顧客訂單</h1>
      <p className="admin-sub">{selectedFreightNote}</p>

      <div style={{ background: "#fff", border: "1px solid #E5E1D3", borderRadius: 12, padding: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {items.map((item) => {
            const badge = statusBadge(item);
            const selectable = item.arrivalStatus === "arrived" || item.arrivalStatus === "untracked";
            return (
              <div key={item.orderItemId}>
                <div style={{ display: "grid", gridTemplateColumns: "20px 1fr 50px 160px", gap: 8, alignItems: "center", fontSize: 13, padding: "6px 8px", background: "#F7F5EC", borderRadius: 6 }}>
                  {selectable ? (
                    <input type="checkbox" checked={checked.includes(item.orderItemId)} onChange={() => toggleCheck(item.orderItemId)} />
                  ) : (
                    <span />
                  )}
                  <span>
                    {item.productName}
                    {item.styleName ? `（${item.styleName}）` : ""}
                    {item.isGift && <span style={{ color: "#8B5CF6", marginLeft: 6 }}>（滿贈）</span>}
                  </span>
                  <span style={{ textAlign: "right", color: "var(--muted)" }}>x{item.qty}</span>
                  <span style={{ textAlign: "right" }}>
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: badge.bg, color: badge.fg }}>
                      {badge.label}
                    </span>
                  </span>
                </div>

                {item.arrivalStatus !== "arrived" && item.arrivalStatus !== "untracked" && item.candidates.length > 0 && (
                  <div style={{ marginLeft: 20, padding: "8px 10px", background: "#EFEAF9", borderRadius: 6, fontSize: 12, marginTop: 4 }}>
                    <div style={{ color: "#6D4FA8", marginBottom: 6 }}>其他顧客有相同商品已到貨，可挪用湊齊：</div>
                    {item.candidates.map((c) => (
                      <div key={c.vendorItemId} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0" }}>
                        <span>
                          {c.customerName} 有 {c.qty} 個已到貨
                        </span>
                        <button onClick={() => handleBorrow(c.vendorItemId)} style={{ fontSize: 11, padding: "2px 8px" }}>
                          挪用
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button className="btn" style={{ marginTop: 16 }} disabled={checked.length === 0} onClick={handleCreateBatch}>
          建立出貨批次
        </button>
      </div>

      {batches.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>已建立的出貨批次</div>
          {batches.map((b, i) => (
            <div key={b.id} style={{ fontSize: 13, padding: "8px 10px", background: "#F0EEE4", borderRadius: 6, marginBottom: 6 }}>
              出貨批次 #{i + 1}（確定時間：{new Date(b.confirmed_at).toLocaleString("zh-TW")}）
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

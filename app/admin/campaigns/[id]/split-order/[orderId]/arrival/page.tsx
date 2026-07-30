"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type ShipmentItem = { id: string; purchase_order_item_id: string | null; purchase_order_gift_id: string | null };
type Shipment = { id: string; tracking_no: string; arrived: boolean; vendor_shipment_items: ShipmentItem[] };
type VendorOrderNumber = { id: string; vendor_order_no: string; vendor_shipments: Shipment[] };
type PoItem = { id: string; qty: number; customerName: string; productName: string; styleName: string | null };
type PoGift = { id: string; qty: number; styleName: string };

export default function ArrivalTrackingPage() {
  const params = useParams();
  const orderId = params.orderId as string;

  const [vendorOrderNumbers, setVendorOrderNumbers] = useState<VendorOrderNumber[]>([]);
  const [loading, setLoading] = useState(true);
  const [newVendorOrderNo, setNewVendorOrderNo] = useState("");
  const [addingShipmentFor, setAddingShipmentFor] = useState<string | null>(null);
  const [newTracking, setNewTracking] = useState("");
  const [checkedItemIds, setCheckedItemIds] = useState<string[]>([]);
  const [checkedGiftIds, setCheckedGiftIds] = useState<string[]>([]);

  async function load() {
    setLoading(true);
    const vonRes = await fetch(`/api/admin/split-order/orders/${orderId}/vendor-order-numbers`).then((r) => r.json());
    setVendorOrderNumbers(vonRes.vendorOrderNumbers || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [orderId]);

  async function handleAddVendorOrderNumber() {
    if (!newVendorOrderNo.trim()) return;
    await fetch(`/api/admin/split-order/orders/${orderId}/vendor-order-numbers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vendorOrderNo: newVendorOrderNo }),
    });
    setNewVendorOrderNo("");
    load();
  }

  async function handleAddShipment(vonId: string) {
    if (!newTracking.trim() || (checkedItemIds.length === 0 && checkedGiftIds.length === 0)) return;
    await fetch(`/api/admin/vendor-order-numbers/${vonId}/shipments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackingNo: newTracking, purchaseOrderItemIds: checkedItemIds, purchaseOrderGiftIds: checkedGiftIds }),
    });
    setNewTracking("");
    setCheckedItemIds([]);
    setCheckedGiftIds([]);
    setAddingShipmentFor(null);
    load();
  }

  async function toggleArrived(shipmentId: string, arrived: boolean) {
    await fetch(`/api/admin/shipments/${shipmentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ arrived: !arrived }),
    });
    load();
  }

  if (loading) return <div className="admin-page">載入中…</div>;

  return (
    <div className="admin-page" style={{ maxWidth: 800 }}>
      <nav className="admin-nav">
        <Link href="../../split-order">← 回拆單頁面</Link>
      </nav>
      <h1>到貨追蹤</h1>
      <p className="admin-sub">
        我方採購單 → 廠商訂單編號（可能拆成A/B/C多筆）→ 物流單號（一個廠商訂單編號可能又拆成多筆物流單號）
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {vendorOrderNumbers.map((von) => {
          const total = von.vendor_shipments.length;
          const arrivedCount = von.vendor_shipments.filter((s) => s.arrived).length;
          return (
            <div key={von.id} style={{ background: "#fff", border: "1px solid #E5E1D3", borderRadius: 12, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontWeight: 500 }}>廠商訂單編號 {von.vendor_order_no}</span>
                <span
                  style={{
                    fontSize: 12,
                    padding: "3px 10px",
                    borderRadius: 4,
                    background: total > 0 && arrivedCount === total ? "#E6F4EA" : "#FDF3E0",
                    color: total > 0 && arrivedCount === total ? "#1E7A3D" : "#B45309",
                  }}
                >
                  {arrivedCount} / {total} 已到貨
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6, borderTop: "1px solid #E5E1D3", paddingTop: 8 }}>
                {von.vendor_shipments.map((sh) => (
                  <div key={sh.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, padding: "6px 8px", background: "#F7F5EC", borderRadius: 6 }}>
                    <button
                      onClick={() => toggleArrived(sh.id, sh.arrived)}
                      style={{
                        padding: "4px 10px",
                        fontSize: 12,
                        background: sh.arrived ? "#E6F4EA" : "#fff",
                        color: sh.arrived ? "#1E7A3D" : "#9A9787",
                      }}
                    >
                      {sh.arrived ? "已到貨" : "未到貨"}
                    </button>
                    <span style={{ color: "var(--muted)", fontFamily: "monospace" }}>{sh.tracking_no}</span>
                    <span style={{ color: "var(--muted)" }}>{sh.vendor_shipment_items.length} 個品項</span>
                  </div>
                ))}
              </div>

              {addingShipmentFor === von.id ? (
                <ShipmentForm
                  orderId={orderId}
                  vonId={von.id}
                  tracking={newTracking}
                  setTracking={setNewTracking}
                  checkedItemIds={checkedItemIds}
                  setCheckedItemIds={setCheckedItemIds}
                  checkedGiftIds={checkedGiftIds}
                  setCheckedGiftIds={setCheckedGiftIds}
                  onConfirm={() => handleAddShipment(von.id)}
                />
              ) : (
                <button onClick={() => setAddingShipmentFor(von.id)} style={{ marginTop: 8, fontSize: 13 }}>
                  ＋ 新增物流單號
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <input placeholder="廠商訂單編號，如 D" value={newVendorOrderNo} onChange={(e) => setNewVendorOrderNo(e.target.value)} />
        <button className="btn" onClick={handleAddVendorOrderNumber}>
          ＋ 新增廠商訂單編號
        </button>
      </div>
    </div>
  );
}

function ShipmentForm({ orderId, checkedItemIds, setCheckedItemIds, checkedGiftIds, setCheckedGiftIds, tracking, setTracking, onConfirm }: any) {
  const [items, setItems] = useState<any[]>([]);
  const [gifts, setGifts] = useState<any[]>([]);

  useEffect(() => {
    fetch(`/api/admin/split-order/orders/${orderId}`)
      .then((r) => r.json())
      .then((d) => {
        setItems(d.items || []);
        setGifts(d.gifts || []);
      });
  }, [orderId]);

  function toggleItem(id: string) {
    setCheckedItemIds((prev: string[]) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
  function toggleGift(id: string) {
    setCheckedGiftIds((prev: string[]) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <div style={{ marginTop: 8, background: "#F7F5EC", borderRadius: 8, padding: 10, fontSize: 13 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span>物流單號</span>
        <input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="SF1234567xxx" />
      </div>
      <div style={{ color: "var(--muted)", marginBottom: 6 }}>這次寄送包含哪些品項（一般商品與滿贈可任意勾選，滿贈也能單獨成一批）</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
        {items.map((it) => (
          <label key={it.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={checkedItemIds.includes(it.id)} onChange={() => toggleItem(it.id)} />
            {it.customerName} · {it.productName}
            {it.styleName ? `（${it.styleName}）` : ""} x{it.qty}
          </label>
        ))}
        {gifts.map((g) => (
          <label key={g.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={checkedGiftIds.includes(g.id)} onChange={() => toggleGift(g.id)} />
            <span style={{ color: "#8B5CF6" }}>滿贈</span> {g.styleName} x{g.qty}
          </label>
        ))}
        {items.length === 0 && gifts.length === 0 && <span style={{ color: "var(--muted)" }}>這張採購單目前沒有品項</span>}
      </div>
      <button onClick={onConfirm}>加入</button>
    </div>
  );
}

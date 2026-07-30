"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

export default function OrderConfirmationPage() {
  const params = useParams();
  const [order, setOrder] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/orders/${params.id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setOrder(d.order);
      });
  }, [params.id]);

  if (error) return <div style={{ padding: 40, textAlign: "center", color: "#C0392B" }}>{error}</div>;
  if (!order) return <div style={{ padding: 40, textAlign: "center", color: "#9A9787" }}>載入中…</div>;

  return (
    <div style={{ maxWidth: 500, margin: "0 auto", padding: "40px 16px", textAlign: "center" }}>
      <h1 style={{ fontSize: 20 }}>訂單已送出</h1>
      <p style={{ color: "#9A9787", fontSize: 14, marginBottom: 24 }}>
        感謝您的訂購，運費將在店家整理出貨批次後另外顯示
      </p>
      <div style={{ textAlign: "left", border: "1px solid #E5E1D3", borderRadius: 10, padding: 16 }}>
        {order.order_items.map((item: any) => (
          <div key={item.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 6 }}>
            <span>
              {item.product_variants?.products?.name}
              {item.product_variants?.style_name ? `（${item.product_variants.style_name}）` : ""} x{item.qty}
            </span>
            <span>NT$ {item.unit_amount_twd * item.qty}</span>
          </div>
        ))}
        {order.order_gift_selections?.length > 0 && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed #E5E1D3", fontSize: 13, color: "#9A9787" }}>
            滿贈：
            {order.order_gift_selections.map((g: any) => `${g.gift_styles?.style_name} x${g.qty}`).join("、")}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CartProvider, useCart } from "@/lib/cartContext";

function CheckoutInner({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const { items, clear } = useCart();
  const [txnMethod, setTxnMethod] = useState<"bank" | "cod">("bank");
  const [total, setTotal] = useState<number | null>(null);
  const [anyDisabled, setAnyDisabled] = useState(false);
  const [codAvailable, setCodAvailable] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const wantsGift = typeof window !== "undefined" ? JSON.parse(sessionStorage.getItem("checkoutWantsGift") || "false") : false;
  const giftSelections =
    typeof window !== "undefined" ? JSON.parse(sessionStorage.getItem("checkoutGiftSelections") || "[]") : [];

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((d) => {
        if (!d.loggedIn) router.push("/login");
      });
  }, []);

  useEffect(() => {
    if (items.length === 0) return;
    fetch("/api/checkout/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId,
        txnMethod,
        wantsGift,
        items: items.map((i) => ({ productVariantId: i.productVariantId, qty: i.qty })),
      }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setError(d.error);
          return;
        }
        setTotal(d.total);
        setAnyDisabled(d.anyDisabled);
        setCodAvailable(d.codAvailable);
      });
  }, [campaignId, txnMethod, items]);

  async function handleSubmit() {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/orders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          txnMethod,
          items: items.map((i) => ({ productVariantId: i.productVariantId, qty: i.qty })),
          wantsGift,
          giftSelections,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "送出訂單失敗");
      clear();
      sessionStorage.removeItem("checkoutGiftSelections");
      sessionStorage.removeItem("checkoutWantsGift");
      router.push(`/orders/${data.order.id}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (items.length === 0) {
    return <div style={{ padding: 40, textAlign: "center", color: "#9A9787" }}>購物車是空的</div>;
  }

  return (
    <div style={{ maxWidth: 500, margin: "0 auto", padding: "24px 16px" }}>
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>結帳</h1>
      <button className="admin-link-btn" onClick={() => router.push("/cart")} style={{ marginBottom: 16 }}>
        ← 返回購物車
      </button>

      {error && <div className="admin-error-box">{error}</div>}

      <div style={{ border: "1px solid #E5E1D3", borderRadius: 10, padding: 16, marginBottom: 16 }}>
        {items.map((i) => (
          <div key={i.productVariantId} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 8 }}>
            <span>
              {i.productName}
              {i.styleName ? `（${i.styleName}）` : ""} x{i.qty}
            </span>
          </div>
        ))}

        <div style={{ borderTop: "1px dashed #E5E1D3", marginTop: 8, paddingTop: 10, fontSize: 13, color: "#9A9787" }}>
          這個檔期的交易方式
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button
            className={txnMethod === "bank" ? "btn" : ""}
            style={txnMethod !== "bank" ? { border: "1px solid #E5E1D3", background: "#fff" } : {}}
            onClick={() => setTxnMethod("bank")}
          >
            匯款
          </button>
          <button
            className={txnMethod === "cod" ? "btn" : ""}
            style={txnMethod !== "cod" ? { border: "1px solid #E5E1D3", background: "#fff" } : {}}
            disabled={!codAvailable}
            onClick={() => setTxnMethod("cod")}
          >
            取付{!codAvailable && "（本檔期已額滿）"}
          </button>
        </div>

        {anyDisabled && (
          <div style={{ fontSize: 13, color: "#C0392B", marginTop: 10 }}>
            部分商品在此交易方式下未開放購買，請聯繫店家或改選其他交易方式
          </div>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 16, border: "1px solid #E5E1D3", borderRadius: 10, marginBottom: 20 }}>
        <span style={{ fontSize: 15 }}>總計</span>
        <span style={{ fontSize: 20, fontWeight: 600 }}>{total != null ? `NT$ ${total}` : "計算中…"}</span>
      </div>

      <button className="btn" style={{ width: "100%" }} disabled={submitting || anyDisabled} onClick={handleSubmit}>
        {submitting ? "送出中…" : "確認送出訂單"}
      </button>
    </div>
  );
}

export default function CheckoutPage() {
  const [campaignId, setCampaignId] = useState<string | null>(null);

  useEffect(() => {
    setCampaignId(localStorage.getItem("activeCampaignId"));
  }, []);

  if (!campaignId) {
    return <div style={{ padding: 40, textAlign: "center", color: "#9A9787" }}>找不到購物車</div>;
  }

  return (
    <CartProvider campaignId={campaignId}>
      <CheckoutInner campaignId={campaignId} />
    </CartProvider>
  );
}

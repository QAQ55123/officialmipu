"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CartProvider, useCart } from "@/lib/cartContext";

type StyleLimit = { giftStyleId: string; styleName: string; max: number };
type QuoteResult = { cartSubtotal: number; quota: number; styleLimits: StyleLimit[] };

function CartInner({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const { items, updateQty, removeItem } = useCart();
  const [wantsGift, setWantsGift] = useState(true);
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [giftPicks, setGiftPicks] = useState<Record<string, number>>({});
  const [loadingQuote, setLoadingQuote] = useState(false);

  const subtotal = items.reduce((s, i) => s + i.unitAmount * i.qty, 0);

  useEffect(() => {
    if (items.length === 0) return;
    setLoadingQuote(true);
    fetch("/api/cart/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId,
        items: items.map((i) => ({ productVariantId: i.productVariantId, qty: i.qty })),
      }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (!d.error) setQuote(d);
      })
      .finally(() => setLoadingQuote(false));
  }, [campaignId, items]);

  const pickedTotal = Object.values(giftPicks).reduce((s, n) => s + n, 0);

  function adjustPick(styleId: string, delta: number, max: number) {
    setGiftPicks((prev) => {
      const current = prev[styleId] || 0;
      const next = Math.max(0, Math.min(max, current + delta));
      // 也不能超過總quota
      const otherTotal = Object.entries(prev)
        .filter(([k]) => k !== styleId)
        .reduce((s, [, v]) => s + v, 0);
      const capped = quote ? Math.min(next, quote.quota - otherTotal) : next;
      return { ...prev, [styleId]: Math.max(0, capped) };
    });
  }

  function goCheckout() {
    sessionStorage.setItem(
      "checkoutGiftSelections",
      JSON.stringify(
        Object.entries(giftPicks)
          .filter(([, qty]) => qty > 0)
          .map(([giftStyleId, qty]) => ({ giftStyleId, qty }))
      )
    );
    sessionStorage.setItem("checkoutWantsGift", JSON.stringify(wantsGift));
    router.push("/checkout");
  }

  if (items.length === 0) {
    return (
      <div style={{ maxWidth: 600, margin: "60px auto", textAlign: "center", color: "#9A9787" }}>
        購物車是空的
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "24px 16px 40px" }}>
      <h1 style={{ fontSize: 20, marginBottom: 16 }}>購物車</h1>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
        {items.map((i) => (
          <div
            key={i.productVariantId}
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 10, border: "1px solid #E5E1D3", borderRadius: 8 }}
          >
            <div>
              <div style={{ fontSize: 14 }}>
                {i.productName}
                {i.styleName ? `（${i.styleName}）` : ""}
              </div>
              <div style={{ fontSize: 13, color: "#9A9787" }}>NT$ {i.unitAmount}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="number"
                min={1}
                value={i.qty}
                onChange={(e) => updateQty(i.productVariantId, Number(e.target.value))}
                style={{ width: 50 }}
              />
              <button className="admin-link-btn danger" onClick={() => removeItem(i.productVariantId)}>
                移除
              </button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, marginBottom: 16 }}>
        <span>小計</span>
        <span>NT$ {subtotal}</span>
      </div>

      <div style={{ marginBottom: 8 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
          <input type="checkbox" checked={wantsGift} onChange={(e) => setWantsGift(e.target.checked)} />
          要選擇滿贈
        </label>
      </div>

      {wantsGift && (
        <div style={{ border: "1px solid #E5E1D3", borderRadius: 8, padding: 14, marginBottom: 20 }}>
          {loadingQuote ? (
            <div style={{ color: "#9A9787", fontSize: 13 }}>計算滿贈額度中…</div>
          ) : quote ? (
            <>
              <div style={{ fontSize: 13, color: "#9A9787", marginBottom: 10 }}>
                可選 {pickedTotal} / {quote.quota} 個
              </div>
              {quote.styleLimits.length === 0 ? (
                <div style={{ fontSize: 13, color: "#9A9787" }}>目前金額尚未解鎖任何滿贈款式</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {quote.styleLimits.map((s) => {
                    const picked = giftPicks[s.giftStyleId] || 0;
                    return (
                      <div key={s.giftStyleId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 14 }}>
                          {s.styleName}
                          {s.max === 0 && <span style={{ color: "#9A9787", fontSize: 12 }}>（尚未解鎖）</span>}
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <button
                            onClick={() => adjustPick(s.giftStyleId, -1, s.max)}
                            disabled={picked <= 0}
                            style={{ width: 28 }}
                          >
                            −
                          </button>
                          <span style={{ minWidth: 20, textAlign: "center" }}>{picked}</span>
                          <button
                            onClick={() => adjustPick(s.giftStyleId, 1, s.max)}
                            disabled={picked >= s.max || pickedTotal >= quote.quota}
                            style={{ width: 28 }}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : null}
        </div>
      )}

      <button className="btn" style={{ width: "100%" }} onClick={goCheckout}>
        前往結帳
      </button>
    </div>
  );
}

export default function CartPage() {
  const [campaignId, setCampaignId] = useState<string | null>(null);

  useEffect(() => {
    setCampaignId(localStorage.getItem("activeCampaignId"));
  }, []);

  if (!campaignId) {
    return <div style={{ padding: 40, textAlign: "center", color: "#9A9787" }}>找不到購物車，請先從檔期頁面選購商品</div>;
  }

  return (
    <CartProvider campaignId={campaignId}>
      <CartInner campaignId={campaignId} />
    </CartProvider>
  );
}

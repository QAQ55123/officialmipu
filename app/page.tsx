"use client";
import { useEffect, useState, useMemo } from "react";
import { ShoppingCart } from "lucide-react";

type Series = { id: string; name: string; is_gift_series: boolean };
type Variant = { id: string; style_name: string | null };
type Product = {
  id: string;
  name: string;
  amount: number;
  image_url: string | null;
  series_id: string | null;
  cod_allowed: boolean;
  product_variants: Variant[];
};
type CartEntry = { productVariantId: string; productId: string; name: string; style: string | null; qty: number; price: number; imageUrl: string | null };
type CampaignInfo = { id: string; name: string; gift_base_unit: number; vendor_order_gift_cap: number | null; cod_campaign_cap: number | null; cod_campaign_used: number };

const fmt = (n: number) => new Intl.NumberFormat("zh-TW").format(Math.round(n));
const CART_KEY = "neworder_cart";

export default function Home() {
  const [view, setView] = useState<"browse" | "product" | "cart" | "checkout">("browse");
  const [series, setSeries] = useState<Series[]>([]);
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [campaign, setCampaign] = useState<CampaignInfo | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [detailStyle, setDetailStyle] = useState<string | null>(null);
  const [detailQty, setDetailQty] = useState(1);

  const [cart, setCart] = useState<CartEntry[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(window.localStorage.getItem(CART_KEY) || "[]");
    } catch {
      return [];
    }
  });
  useEffect(() => {
    window.localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }, [cart]);

  const [wantsGift, setWantsGift] = useState(true);
  const [giftQuota, setGiftQuota] = useState<{ quota: number; styleLimits: any[] } | null>(null);
  const [giftPicks, setGiftPicks] = useState<Record<string, number>>({});

  const [txnMethod, setTxnMethod] = useState<"bank" | "cod">("bank");
  const [checkoutQuote, setCheckoutQuote] = useState<{ total: number; anyDisabled: boolean; codAvailable: boolean; codBlockedItems: string[] } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/series").then((r) => r.json()),
      fetch("/api/products").then((r) => r.json()),
      fetch("/api/campaigns/current").then((r) => r.json()),
    ]).then(([sData, pData, cData]) => {
      setSeries(sData.series || []);
      setProducts(pData.products || []);
      setCampaign(cData.campaign);
      setIsOpen(cData.isOpen);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (view !== "cart" || cart.length === 0 || !campaign) return;
    fetch("/api/cart/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: campaign.id, items: cart.map((c) => ({ productVariantId: c.productVariantId, qty: c.qty })) }),
    })
      .then((r) => r.json())
      .then((d) => setGiftQuota(d));
  }, [view, cart, campaign]);

  useEffect(() => {
    if (view !== "checkout") return;
    fetch("/api/auth/session").then((r) => r.json()).then((d) => {
      if (!d.loggedIn) window.location.href = "/login";
    });
  }, [view]);

  useEffect(() => {
    if (view !== "checkout" || cart.length === 0 || !campaign) return;
    fetch("/api/checkout/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: campaign.id, txnMethod, wantsGift, items: cart.map((c) => ({ productVariantId: c.productVariantId, qty: c.qty })) }),
    })
      .then((r) => r.json())
      .then((d) => setCheckoutQuote(d));
  }, [view, cart, campaign, txnMethod, wantsGift]);

  const filteredProducts = useMemo(
    () => (selectedSeriesId ? products.filter((p) => p.series_id === selectedSeriesId) : products),
    [products, selectedSeriesId]
  );
  const cartCount = cart.reduce((s, e) => s + e.qty, 0);

  function openProduct(p: Product) {
    setDetailProduct(p);
    const hasStyles = p.product_variants.length > 1 || p.product_variants[0]?.style_name;
    setDetailStyle(hasStyles ? null : p.product_variants[0]?.style_name ?? null);
    setDetailQty(1);
    setView("product");
  }

  function addToCart() {
    if (!detailProduct) return;
    const hasStyles = detailProduct.product_variants.length > 1 || detailProduct.product_variants[0]?.style_name;
    if (hasStyles && !detailStyle) return;
    const variant = detailProduct.product_variants.find((v) => v.style_name === detailStyle) || detailProduct.product_variants[0];

    setCart((prev) => {
      const key = variant.id;
      const existing = prev.find((e) => e.productVariantId === key);
      if (existing) {
        return prev.map((e) => (e.productVariantId === key ? { ...e, qty: e.qty + detailQty } : e));
      }
      return [
        ...prev,
        {
          productVariantId: variant.id,
          productId: detailProduct.id,
          name: detailProduct.name,
          style: variant.style_name,
          qty: detailQty,
          price: detailProduct.amount,
          imageUrl: detailProduct.image_url,
        },
      ];
    });
    setView("cart");
  }

  function changeQty(variantId: string, delta: number) {
    setCart((prev) => prev.map((e) => (e.productVariantId === variantId ? { ...e, qty: Math.max(1, e.qty + delta) } : e)));
  }
  function removeItem(variantId: string) {
    setCart((prev) => prev.filter((e) => e.productVariantId !== variantId));
  }

  function adjustGiftPick(styleId: string, delta: number, max: number) {
    setGiftPicks((prev) => {
      const current = prev[styleId] || 0;
      const next = Math.max(0, Math.min(max, current + delta));
      const otherTotal = Object.entries(prev).filter(([k]) => k !== styleId).reduce((s, [, v]) => s + v, 0);
      const capped = giftQuota ? Math.min(next, giftQuota.quota - otherTotal) : next;
      return { ...prev, [styleId]: Math.max(0, capped) };
    });
  }

  async function submitOrder() {
    if (!campaign) return;
    setSubmitting(true);
    setCheckoutError("");
    try {
      const res = await fetch("/api/orders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: campaign.id,
          txnMethod,
          items: cart.map((c) => ({ productVariantId: c.productVariantId, qty: c.qty })),
          wantsGift,
          giftSelections: Object.entries(giftPicks).filter(([, q]) => q > 0).map(([giftStyleId, qty]) => ({ giftStyleId, qty })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "送出訂單失敗");
      setCart([]);
      setGiftPicks({});
      alert("訂單已送出！");
      setView("browse");
    } catch (e: any) {
      setCheckoutError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  function renderSeriesTree() {
    return (
      <>
        <div className={`category-item root ${!selectedSeriesId ? "active" : ""}`} onClick={() => setSelectedSeriesId(null)}>
          全部
        </div>
        {series.filter((s) => !s.is_gift_series).map((s) => (
          <div key={s.id} className={`category-item ${selectedSeriesId === s.id ? "active" : ""}`} onClick={() => setSelectedSeriesId(s.id)}>
            <span>{s.name}</span>
          </div>
        ))}
      </>
    );
  }

  if (loading) return <div className="spinner">載入中…</div>;

  return (
    <div>
      <div className="topbar" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderBottom: "1px solid var(--line)" }}>
        <span style={{ fontWeight: 700, cursor: "pointer" }} onClick={() => setView("browse")}>
          訂購網站
        </span>
        <button className="mibu-cart-wrap" onClick={() => setView("cart")} style={{ background: "none", border: "none", cursor: "pointer" }} aria-label="購物車">
          <ShoppingCart size={19} color="var(--muted)" />
          {cartCount > 0 && <span className="mibu-cart-badge">{cartCount}</span>}
        </button>
      </div>

      {!isOpen && (
        <div style={{ background: "#FCEBEB", color: "#791F1F", fontSize: 13, textAlign: "center", padding: "8px 12px" }}>
          目前沒有開放中的檔期，僅供瀏覽，暫時無法加入購物車下單
        </div>
      )}

      <div className="mibu-content-row" style={{ maxWidth: 1200, margin: "0 auto" }}>
        <aside className="category-sidebar-desktop" style={{ display: view === "browse" ? undefined : "none" }}>
          <p className="category-tree-title">系列</p>
          {renderSeriesTree()}
        </aside>

        <main className="main" style={{ flex: 1, minWidth: 0, padding: "20px 24px" }}>
          {view === "browse" && (
            <div>
              <div className="plan-grid">
                {filteredProducts.map((p) => (
                  <div key={p.id} className="plan-card-v2" onClick={() => openProduct(p)}>
                    <div className="plan-card-v2-img">
                      {p.image_url && <img src={p.image_url} alt={p.name} />}
                      {!p.cod_allowed && <span className="plan-card-v2-tag">不開放取付</span>}
                    </div>
                    <div className="plan-card-v2-body">
                      <p className="plan-card-v2-name">{p.name}</p>
                      <p className="plan-card-v2-meta">NT$ {fmt(p.amount)}</p>
                    </div>
                  </div>
                ))}
                {filteredProducts.length === 0 && <div className="spinner">沒有符合條件的商品</div>}
              </div>
            </div>
          )}

          {view === "product" && detailProduct && (
            <div>
              <a className="checkout-back-link" onClick={() => setView("browse")}>
                <span aria-hidden="true">←</span>返回商品列表
              </a>
              <div className="product-card-v3">
                <div className="product-gallery-v3">
                  {detailProduct.image_url ? <img src={detailProduct.image_url} alt={detailProduct.name} /> : <span className="product-gallery-v3-empty">沒有圖片</span>}
                </div>
                <div className="product-title-block">
                  <h4 style={{ margin: 0, fontSize: 20 }}>{detailProduct.name}</h4>
                </div>
                <div className="product-info-v3">
                  {(detailProduct.product_variants.length > 1 || detailProduct.product_variants[0]?.style_name) && (
                    <>
                      <p className="product-info-v3-label">選擇款式</p>
                      <div className="style-pills">
                        {detailProduct.product_variants.map((v) => (
                          <button
                            key={v.id}
                            className={`style-pill ${detailStyle === v.style_name ? "active" : ""}`}
                            onClick={() => setDetailStyle(v.style_name)}
                          >
                            {v.style_name}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  <div className="stepper stepper-lg">
                    <button className="step-btn" disabled={detailQty <= 1} onClick={() => setDetailQty((q) => Math.max(1, q - 1))}>－</button>
                    <input className="qty" type="number" min={1} value={detailQty} onChange={(e) => setDetailQty(Math.max(1, Number(e.target.value)))} />
                    <button className="step-btn" onClick={() => setDetailQty((q) => q + 1)}>＋</button>
                  </div>
                  <div className="product-checkout-row">
                    <span className="product-checkout-total">總計</span>
                    <span className="product-price-v3">NT$ {fmt(detailProduct.amount * detailQty)}</span>
                  </div>
                  <button className="btn" style={{ width: "100%", marginTop: 12 }} disabled={!isOpen} onClick={addToCart}>
                    {isOpen ? "加入購物車" : "目前非開放購買"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {view === "cart" && (
            <div>
              <h2 className="section-title">購物車</h2>
              {cart.length === 0 ? (
                <div className="cart-empty">
                  <div className="cart-empty-icon"><ShoppingCart size={32} /></div>
                  <p>購物車是空的</p>
                  <button className="btn" onClick={() => setView("browse")}>去逛逛商品</button>
                </div>
              ) : (
                <>
                  {cart.map((e) => (
                    <div className="cart-item-row" key={e.productVariantId}>
                      <div className="cart-item-left">
                        {e.imageUrl ? <img src={e.imageUrl} alt={e.name} className="cart-item-img" /> : <div className="cart-item-img cart-item-img-empty" />}
                        <div className="cart-item-info">
                          <span className="cart-item-name">{e.name}{e.style ? `（${e.style}）` : ""}</span>
                          <span className="cart-item-unit-price">NT$ {fmt(e.price)} / 件</span>
                        </div>
                      </div>
                      <div className="cart-item-right">
                        <div className="stepper">
                          <button className="step-btn" disabled={e.qty <= 1} onClick={() => changeQty(e.productVariantId, -1)}>－</button>
                          <input className="qty" type="number" min={1} value={e.qty} readOnly />
                          <button className="step-btn" onClick={() => changeQty(e.productVariantId, 1)}>＋</button>
                        </div>
                        <span className="cart-item-price">NT$ {fmt(e.qty * e.price)}</span>
                        <span className="cart-item-remove" onClick={() => removeItem(e.productVariantId)} title="移除">×</span>
                      </div>
                    </div>
                  ))}

                  <div style={{ margin: "16px 0" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                      <input type="checkbox" checked={wantsGift} onChange={(e) => setWantsGift(e.target.checked)} />
                      要選擇滿贈
                    </label>
                  </div>

                  {wantsGift && giftQuota && (
                    <div style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 14, marginBottom: 16 }}>
                      <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 10 }}>
                        可選 {Object.values(giftPicks).reduce((s, n) => s + n, 0)} / {giftQuota.quota} 個
                      </div>
                      {giftQuota.styleLimits.map((s: any) => {
                        const picked = giftPicks[s.giftStyleId] || 0;
                        return (
                          <div key={s.giftStyleId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                            <span style={{ fontSize: 14 }}>{s.styleName}{s.max === 0 && <span style={{ color: "var(--muted)", fontSize: 12 }}>（尚未解鎖）</span>}</span>
                            <div className="stepper">
                              <button className="step-btn" disabled={picked <= 0} onClick={() => adjustGiftPick(s.giftStyleId, -1, s.max)}>－</button>
                              <input className="qty" value={picked} readOnly />
                              <button className="step-btn" disabled={picked >= s.max} onClick={() => adjustGiftPick(s.giftStyleId, 1, s.max)}>＋</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="cart-checkout-bar">
                    <span style={{ fontWeight: 600 }}>合計 NT$ {fmt(cart.reduce((s, e) => s + e.qty * e.price, 0))}</span>
                    <button className="btn" disabled={!isOpen} onClick={() => setView("checkout")}>
                      {isOpen ? "前往結帳" : "目前非開放購買"}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {view === "checkout" && (
            <div>
              <h2 className="section-title">結帳</h2>
              <a className="checkout-back-link" onClick={() => setView("cart")}>
                <span aria-hidden="true">←</span>返回購物車
              </a>

              {cart.map((e) => (
                <div className="cart-item-row" key={e.productVariantId}>
                  <div className="cart-item-left">
                    {e.imageUrl ? <img src={e.imageUrl} alt={e.name} className="cart-item-img" /> : <div className="cart-item-img cart-item-img-empty" />}
                    <span>{e.name}{e.style ? `（${e.style}）` : ""} x{e.qty}</span>
                  </div>
                  <span className="cart-item-price">NT$ {fmt(e.qty * e.price)}</span>
                </div>
              ))}

              <div style={{ marginTop: 16 }}>
                <div className="id-label" style={{ marginBottom: 6 }}>交易方式</div>
                <div className="source-btns">
                  <button className={`src-btn ${txnMethod === "bank" ? "active" : ""}`} onClick={() => setTxnMethod("bank")}>匯款</button>
                  <button
                    className={`src-btn ${txnMethod === "cod" ? "active" : ""}`}
                    disabled={checkoutQuote ? !checkoutQuote.codAvailable : false}
                    onClick={() => setTxnMethod("cod")}
                  >
                    取付
                  </button>
                </div>
                {checkoutQuote && !checkoutQuote.codAvailable && (
                  <div style={{ color: "#B3261E", fontSize: 12, marginTop: 6 }}>取付金額已超過本檔期設定的數量，請改用匯款</div>
                )}
                {checkoutQuote && checkoutQuote.codBlockedItems.length > 0 && txnMethod === "cod" && (
                  <div style={{ color: "#B3261E", fontSize: 12, marginTop: 6 }}>
                    以下商品不開放取付，請改用匯款或從購物車移除：{checkoutQuote.codBlockedItems.join("、")}
                  </div>
                )}
              </div>

              {checkoutError && <div style={{ color: "#B3261E", fontSize: 13, marginTop: 12 }}>{checkoutError}</div>}

              <div className="cart-checkout-bar">
                <span style={{ fontWeight: 600 }}>總計 NT$ {checkoutQuote ? fmt(checkoutQuote.total) : "…"}</span>
                <button className="btn" disabled={submitting || (checkoutQuote?.codBlockedItems.length ?? 0) > 0} onClick={submitOrder}>
                  {submitting ? "送出中…" : "確認送出訂單"}
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

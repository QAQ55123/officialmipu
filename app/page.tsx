"use client";
import { useEffect, useState, useMemo, useRef } from "react";
import { ShoppingCart } from "lucide-react";

type Series = { id: string; name: string; is_gift_series: boolean };
type Variant = { id: string; style_name: string | null; amount: number; image_url: string | null; cod_allowed: boolean; has_discount_flag: boolean };
type Product = { id: string; name: string; series_id: string | null; product_variants: Variant[] };
type CartEntry = { productVariantId: string; productId: string; name: string; style: string | null; qty: number; price: number; imageUrl: string | null };
type CampaignInfo = { id: string; name: string; gift_base_unit: number; vendor_order_gift_cap: number | null; cod_campaign_cap: number | null; cod_campaign_used: number };

const fmt = (n: number) => new Intl.NumberFormat("zh-TW").format(Math.round(n));
const CART_KEY = "neworder_cart";

export default function Home() {
  const [view, setView] = useState<"browse" | "product" | "cart" | "checkout" | "identity">("browse");
  const [pendingAction, setPendingAction] = useState<"checkout" | null>(null);
  const [series, setSeries] = useState<Series[]>([]);
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [campaign, setCampaign] = useState<CampaignInfo | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const [toast, setToast] = useState("");
  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 2200);
  }

  // 登入狀態
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null); // null=還不知道
  async function checkSession() {
    const res = await fetch("/api/auth/session");
    const data = await res.json();
    setLoggedIn(!!data.loggedIn);
    return !!data.loggedIn;
  }
  useEffect(() => { checkSession(); }, []);

  // 內嵌登入/註冊（比照原本：不是獨立頁面，是同一個單頁應用程式裡的一個view）
  const [authTab, setAuthTab] = useState<"login" | "register">("login");
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [regUsername, setRegUsername] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirmPassword, setRegConfirmPassword] = useState("");
  const [regProfileUrl, setRegProfileUrl] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [authMsg, setAuthMsg] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [registerDone, setRegisterDone] = useState(false);
  const [registerVerifyEmailSent, setRegisterVerifyEmailSent] = useState(true);

  function requireLoginThen(action: "checkout") {
    if (loggedIn) {
      setView(action);
      return;
    }
    setPendingAction(action);
    setAuthTab("login");
    setAuthMsg("");
    setRegisterDone(false);
    setView("identity");
  }

  async function onLogin() {
    setAuthMsg(""); setAuthSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: loginUsername, password: loginPassword }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "登入失敗");
      await checkSession();
      setView(pendingAction || "browse");
      setPendingAction(null);
    } catch (e: any) {
      setAuthMsg(e.message);
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function onRegister() {
    setAuthMsg(""); setAuthSubmitting(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: regUsername, password: regPassword, confirmPassword: regConfirmPassword, profileUrl: regProfileUrl, email: regEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "註冊失敗");
      await checkSession();
      setRegisterVerifyEmailSent(!!data.verifyEmailSent);
      setRegisterDone(true);
    } catch (e: any) {
      setAuthMsg(e.message);
    } finally {
      setAuthSubmitting(false);
    }
  }
  function continueAfterRegister() {
    setRegisterDone(false);
    setView(pendingAction || "browse");
    setPendingAction(null);
  }

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
    ])
      .then(([sData, pData, cData]) => {
        if (sData.error || pData.error || cData.error) {
          setLoadError(sData.error || pData.error || cData.error);
          setLoading(false);
          return;
        }
        setSeries(sData.series || []);
        setProducts((pData.products || []).filter((p: Product) => p.product_variants.length > 0));
        setCampaign(cData.campaign);
        setIsOpen(cData.isOpen);
        setLoading(false);
      })
      .catch((e) => {
        setLoadError(e.message || "連線失敗");
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (view !== "cart" || cart.length === 0 || !campaign) return;
    fetch("/api/cart/quote", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: campaign.id, items: cart.map((c) => ({ productVariantId: c.productVariantId, qty: c.qty })) }),
    }).then((r) => r.json()).then((d) => setGiftQuota(d));
  }, [view, cart, campaign]);

  useEffect(() => {
    if (view !== "checkout" || cart.length === 0 || !campaign) return;
    fetch("/api/checkout/quote", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: campaign.id, txnMethod, wantsGift, items: cart.map((c) => ({ productVariantId: c.productVariantId, qty: c.qty })) }),
    }).then((r) => r.json()).then((d) => setCheckoutQuote(d));
  }, [view, cart, campaign, txnMethod, wantsGift]);

  const filteredProducts = useMemo(
    () => (selectedSeriesId ? products.filter((p) => p.series_id === selectedSeriesId) : products),
    [products, selectedSeriesId]
  );
  const cartCount = cart.reduce((s, e) => s + e.qty, 0);

  // 商品詳情：每個款式各自暫存數量，全部調完一次「加入購物車」才一起送進去（比照原本邏輯）
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [detailStyle, setDetailStyle] = useState<string | null>(null);
  const [stagedQty, setStagedQty] = useState<Record<string, number>>({});

  function openProduct(p: Product) {
    setDetailProduct(p);
    setDetailStyle(p.product_variants[0]?.style_name ?? null);
    setStagedQty({});
    setView("product");
  }

  function changeStagedQty(variantId: string, delta: number) {
    setStagedQty((prev) => {
      const next = { ...prev };
      const cur = next[variantId] || 0;
      const val = Math.max(0, cur + delta);
      if (val === 0) delete next[variantId];
      else next[variantId] = val;
      return next;
    });
  }
  function setStagedQtyExact(variantId: string, raw: string) {
    const val = Math.max(0, Math.floor(Number(raw)) || 0);
    setStagedQty((prev) => {
      const next = { ...prev };
      if (val === 0) delete next[variantId];
      else next[variantId] = val;
      return next;
    });
  }

  function commitAddToCart() {
    if (!detailProduct) return;
    const entries = Object.entries(stagedQty).filter(([, q]) => q > 0);
    if (entries.length === 0) return showToast("請至少選擇一項款式的數量");

    setCart((prev) => {
      const next = [...prev];
      for (const [variantId, qty] of entries) {
        const variant = detailProduct.product_variants.find((v) => v.id === variantId);
        if (!variant) continue;
        const idx = next.findIndex((e) => e.productVariantId === variantId);
        if (idx >= 0) {
          next[idx] = { ...next[idx], qty: next[idx].qty + qty };
        } else {
          next.push({ productVariantId: variantId, productId: detailProduct.id, name: detailProduct.name, style: variant.style_name, qty, price: variant.amount, imageUrl: variant.image_url });
        }
      }
      return next;
    });
    setStagedQty({});
    showToast("已加入購物車");
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
    setSubmitting(true); setCheckoutError("");
    try {
      const res = await fetch("/api/orders/create", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: campaign.id, txnMethod,
          items: cart.map((c) => ({ productVariantId: c.productVariantId, qty: c.qty })),
          wantsGift,
          giftSelections: Object.entries(giftPicks).filter(([, q]) => q > 0).map(([giftStyleId, qty]) => ({ giftStyleId, qty })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "送出訂單失敗");
      setCart([]); setGiftPicks({});
      showToast("訂單已送出！");
      setView("browse");
    } catch (e: any) {
      setCheckoutError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="spinner">載入中…</div>;
  if (loadError) return <div style={{ padding: 40, textAlign: "center", color: "#791F1F" }}>發生錯誤：{loadError}</div>;

  // 內嵌登入/註冊畫面（比照原本：不是獨立頁面）
  if (view === "identity") {
    return (
      <div style={{ maxWidth: 460, margin: "48px auto", padding: "0 16px" }}>
        <div className="auth-card" style={{ margin: 0 }}>
          {registerDone ? (
            <div style={{ textAlign: "center" }}>
              <h2 className="section-title">註冊成功</h2>
              <p style={{ color: "#6B6858", fontSize: 14 }}>
                {registerVerifyEmailSent ? "已寄出驗證信到你的信箱，記得去點連結驗證。" : "但驗證信寄送失敗了，可以之後到帳號設定重新觸發寄送。"}
              </p>
              <button className="btn" onClick={continueAfterRegister}>開始逛逛</button>
            </div>
          ) : (
            <>
              <a className="checkout-back-link" onClick={() => { setPendingAction(null); setView("browse"); }}>← 返回</a>
              {pendingAction === "checkout" && <div className="rules-box">結帳前，請先登入</div>}
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <button className={`src-btn ${authTab === "login" ? "active" : ""}`} onClick={() => { setAuthTab("login"); setAuthMsg(""); }}>登入</button>
                <button className={`src-btn ${authTab === "register" ? "active" : ""}`} onClick={() => { setAuthTab("register"); setAuthMsg(""); }}>註冊新帳號</button>
              </div>
              {authTab === "login" ? (
                <>
                  <h2 className="section-title">登入</h2>
                  <div className="id-row"><span className="id-label">帳號</span><input type="text" value={loginUsername} onChange={(e) => setLoginUsername(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onLogin()} /></div>
                  <div className="id-row"><span className="id-label">密碼</span><input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onLogin()} /></div>
                  <div className="auth-msg">{authMsg}</div>
                  <button className="btn" onClick={onLogin} disabled={authSubmitting}>{authSubmitting ? "登入中…" : "登入"}</button>
                  <p style={{ fontSize: 13, marginTop: 10 }}><a href="/forgot-password" style={{ color: "var(--muted)" }}>忘記密碼？</a></p>
                </>
              ) : (
                <>
                  <h2 className="section-title">建立新帳號</h2>
                  <div className="id-row"><span className="id-label">帳號</span><input type="text" value={regUsername} onChange={(e) => setRegUsername(e.target.value)} /></div>
                  <div className="id-row"><span className="id-label">密碼</span><input type="password" value={regPassword} onChange={(e) => setRegPassword(e.target.value)} placeholder="至少 6 個字" /></div>
                  <div className="id-row"><span className="id-label">確認密碼</span><input type="password" value={regConfirmPassword} onChange={(e) => setRegConfirmPassword(e.target.value)} /></div>
                  <div className="id-row"><span className="id-label">個人頁網址</span><input type="text" value={regProfileUrl} onChange={(e) => setRegProfileUrl(e.target.value)} placeholder="選填，例如你的FB個人首頁" /></div>
                  <div className="id-row"><span className="id-label">Email</span><input type="text" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} placeholder="會寄驗證信" /></div>
                  <div className="auth-msg">{authMsg}</div>
                  <button className="btn" onClick={onRegister} disabled={authSubmitting}>{authSubmitting ? "建立中…" : "註冊"}</button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="topbar" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderBottom: "1px solid var(--line)" }}>
        <span style={{ fontWeight: 700, cursor: "pointer" }} onClick={() => setView("browse")}>訂購網站</span>
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

      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>

      <div className="mibu-content-row" style={{ maxWidth: 1200, margin: "0 auto" }}>
        <aside className="category-sidebar-desktop" style={{ display: view === "browse" ? undefined : "none" }}>
          <p className="category-tree-title">系列</p>
          <div className={`category-item root ${!selectedSeriesId ? "active" : ""}`} onClick={() => setSelectedSeriesId(null)}>全部</div>
          {series.filter((s) => !s.is_gift_series).map((s) => (
            <div key={s.id} className={`category-item ${selectedSeriesId === s.id ? "active" : ""}`} onClick={() => setSelectedSeriesId(s.id)}><span>{s.name}</span></div>
          ))}
        </aside>

        <main className="main" style={{ flex: 1, minWidth: 0, padding: "20px 24px" }}>
          {view === "browse" && (
            <div className="plan-grid">
              {filteredProducts.map((p) => {
                const prices = p.product_variants.map((v) => v.amount);
                const minPrice = Math.min(...prices);
                const maxPrice = Math.max(...prices);
                return (
                  <div key={p.id} className="plan-card-v2" onClick={() => openProduct(p)}>
                    <div className="plan-card-v2-img">{p.product_variants[0]?.image_url && <img src={p.product_variants[0].image_url} alt={p.name} />}</div>
                    <div className="plan-card-v2-body">
                      <p className="plan-card-v2-name">{p.name}</p>
                      <p className="plan-card-v2-meta">NT$ {minPrice === maxPrice ? fmt(minPrice) : `${fmt(minPrice)} ~ ${fmt(maxPrice)}`}</p>
                    </div>
                  </div>
                );
              })}
              {filteredProducts.length === 0 && <div className="spinner">沒有符合條件的商品</div>}
            </div>
          )}

          {view === "product" && detailProduct && (() => {
            const current = detailProduct.product_variants.find((v) => v.style_name === detailStyle) || detailProduct.product_variants[0];
            const qty = stagedQty[current.id] || 0;
            const stagedTotal = Object.entries(stagedQty).reduce((sum, [vid, q]) => {
              const v = detailProduct.product_variants.find((vv) => vv.id === vid);
              return sum + (v ? v.amount * q : 0);
            }, 0);
            const stagedCount = Object.values(stagedQty).reduce((s, n) => s + n, 0);
            return (
              <div>
                <a className="checkout-back-link" onClick={() => setView("browse")}><span aria-hidden="true">←</span>返回商品列表</a>
                <div className="product-card-v3">
                  <div className="product-gallery-v3">
                    {current.image_url ? <img src={current.image_url} alt={detailProduct.name} /> : <div className="product-gallery-v3-empty">尚無圖片</div>}
                  </div>
                  <div className="product-info-v3">
                    <div className="product-price-row">
                      <span className="product-price-v3">NT$ {fmt(current.amount)}</span>
                    </div>
                    {!current.cod_allowed && <div style={{ fontSize: 12, color: "#791F1F", marginBottom: 8 }}>這個款式不開放取付</div>}

                    <h4 style={{ margin: "0 0 10px" }}>{detailProduct.name}</h4>

                    <div className="product-info-v3-label">款式</div>
                    <div className="style-pills">
                      {detailProduct.product_variants.map((v) => (
                        <button key={v.id} className={`style-pill ${detailStyle === v.style_name ? "active" : ""}`} onClick={() => setDetailStyle(v.style_name)}>
                          {v.style_name || "單一款式"}
                          {(stagedQty[v.id] || 0) > 0 && <span className="style-pill-badge">{stagedQty[v.id]}</span>}
                        </button>
                      ))}
                    </div>

                    <div className="product-info-v3-label">數量</div>
                    <div className="stepper stepper-lg">
                      <button className="step-btn" disabled={qty <= 0} onClick={() => changeStagedQty(current.id, -1)}>－</button>
                      <input className="qty" type="number" min={0} value={qty} onChange={(e) => setStagedQtyExact(current.id, e.target.value)} />
                      <button className="step-btn" onClick={() => changeStagedQty(current.id, 1)}>＋</button>
                    </div>

                    <div className="product-checkout-row">
                      <span className="product-checkout-total">合計 NT$ {fmt(stagedTotal)}</span>
                      <button className="btn" disabled={!isOpen || stagedCount === 0} onClick={commitAddToCart}>
                        {isOpen ? "加入購物車" : "目前非開放購買"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

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
                      <input type="checkbox" checked={wantsGift} onChange={(e) => setWantsGift(e.target.checked)} />要選擇滿贈
                    </label>
                  </div>

                  {wantsGift && giftQuota && (
                    <div style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 14, marginBottom: 16 }}>
                      <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 10 }}>可選 {Object.values(giftPicks).reduce((s, n) => s + n, 0)} / {giftQuota.quota} 個</div>
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
                    <button className="btn" disabled={!isOpen} onClick={() => requireLoginThen("checkout")}>
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
              <a className="checkout-back-link" onClick={() => setView("cart")}><span aria-hidden="true">←</span>返回購物車</a>

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
                  <button className={`src-btn ${txnMethod === "cod" ? "active" : ""}`} disabled={checkoutQuote ? !checkoutQuote.codAvailable : false} onClick={() => setTxnMethod("cod")}>取付</button>
                </div>
                {checkoutQuote && !checkoutQuote.codAvailable && <div style={{ color: "#B3261E", fontSize: 12, marginTop: 6 }}>取付金額已超過本檔期設定的數量，請改用匯款</div>}
                {checkoutQuote && checkoutQuote.codBlockedItems.length > 0 && txnMethod === "cod" && (
                  <div style={{ color: "#B3261E", fontSize: 12, marginTop: 6 }}>以下商品不開放取付，請改用匯款或從購物車移除：{checkoutQuote.codBlockedItems.join("、")}</div>
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

"use client";
import { useEffect, useState, useRef, useMemo } from "react";
import { Menu, Search, UserCircle, ShoppingCart, X, ChevronDown, ChevronRight, Heart, Bell } from "lucide-react";

type Category = { id: string; name: string; parentId: string | null };
type Plan = {
  id: string; name: string; imageUrl?: string; codLimit: number; allowCodOnRemitLink?: boolean; deadline?: string; closed: boolean;
  categoryId?: string | null; categoryName?: string | null; categoryParentId?: string | null;
  promoImages?: string[];
};
type Product = { id: string; name: string; style: string; price: number; imageUrl?: string };
type CartItem = { name: string; style: string; qty: number };
type GlobalCartEntry = {
  planId: string;
  planName: string;
  planDeadline: string | null;
  productName: string;
  style: string;
  qty: number;
  price: number;
  imageUrl?: string;
};

const FULFILLMENT_STATUS_MAP: Record<string, { label: string; color: string }> = {
  purchased: { label: "企劃商品已購買", color: "#4bd6af" },
  shipping: { label: "運輸中", color: "#f5cf78" },
  arrived: { label: "已到貨", color: "#fa4166" },
  distributing: { label: "已開賣場", color: "#16a34a" },
};
type Identity = { username: string; profileUrl: string; email: string; emailVerified: boolean; pendingProfileUrl?: string | null } | null;
type PendingAction = null | "order" | "history" | "favorites";

const fmt = (n: number) => new Intl.NumberFormat("zh-TW").format(Math.round(n));

export default function Home() {
  const [view, setView] = useState<"identity" | "plans" | "order" | "history" | "account" | "favorites" | "cart" | "checkout">("plans");
  const [identity, setIdentity] = useState<Identity>(null);
  const identityRef = useRef<Identity>(null);
  useEffect(() => { identityRef.current = identity; }, [identity]);
  const [toast, setToast] = useState("");
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [accountCurrentPw, setAccountCurrentPw] = useState("");
  const [accountPasswordSectionPw, setAccountPasswordSectionPw] = useState("");
  const [accountNewPw, setAccountNewPw] = useState("");
  const [accountConfirmPw, setAccountConfirmPw] = useState("");
  const [accountMsg, setAccountMsg] = useState("");
  const [accountSaving, setAccountSaving] = useState(false);
  const [accountNewEmail, setAccountNewEmail] = useState("");
  const [accountNewProfileUrl, setAccountNewProfileUrl] = useState("");
  const [accountProfileMsg, setAccountProfileMsg] = useState("");
  const [accountProfileSaving, setAccountProfileSaving] = useState(false);
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [favoritedPlanIds, setFavoritedPlanIds] = useState<Set<string>>(new Set());
  const [favoritePlans, setFavoritePlans] = useState<Plan[]>([]);
  const [favoritesLoading, setFavoritesLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  // identity form state
  const [authTab, setAuthTab] = useState<"login" | "register" | "legacy">("login");
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
  const [verifyBannerMsg, setVerifyBannerMsg] = useState("");
  const restoringFromHistoryRef = useRef(false);

  // 舊會員整合 state
  const [legacyStep, setLegacyStep] = useState<"input" | "confirm" | "form" | "notfound" | "requestSent" | "alreadyRegistered">("input");
  const [legacyNickname, setLegacyNickname] = useState("");
  const [legacyCandidates, setLegacyCandidates] = useState<{ id: string; profileUrl: string; nicknames: string[] }[]>([]);
  const [legacySelectedId, setLegacySelectedId] = useState<string | null>(null);
  const [legacyUsername, setLegacyUsername] = useState("");
  const [legacyPassword, setLegacyPassword] = useState("");
  const [legacyConfirmPassword, setLegacyConfirmPassword] = useState("");
  const [legacyEmail, setLegacyEmail] = useState("");
  const [legacyContactNote, setLegacyContactNote] = useState("");
  const [legacyMsg, setLegacyMsg] = useState("");
  const [legacySubmitting, setLegacySubmitting] = useState(false);
  const [legacyClaimedOrders, setLegacyClaimedOrders] = useState(0);

  // 帳號設定：已登入會員連結舊訂單
  const [linkStep, setLinkStep] = useState<"input" | "confirm" | "notfound" | "requestSent">("input");
  const [linkNickname, setLinkNickname] = useState("");
  const [linkCandidates, setLinkCandidates] = useState<{ id: string; profileUrl: string; nicknames: string[] }[]>([]);
  const [linkSelectedId, setLinkSelectedId] = useState<string | null>(null);
  const [linkContactNote, setLinkContactNote] = useState("");
  const [linkMsg, setLinkMsg] = useState("");
  const [linkSubmitting, setLinkSubmitting] = useState(false);
  const [linkClaimedOrders, setLinkClaimedOrders] = useState(0);

  function syncUrl(params: Record<string, string>) {
    if (restoringFromHistoryRef.current) return;
    const qs = new URLSearchParams(params).toString();
    const newUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.pushState(params, "", newUrl);
  }

  function restoreFromUrlParams(params: URLSearchParams) {
    const v = params.get("view");
    if (v === "plan") {
      const id = params.get("id");
      if (id) openPlan({ id } as Plan);
    } else if (v === "cart") {
      setView("cart");
      refreshCartPlanStatuses();
    } else if (v === "history" && identityRef.current) {
      openHistoryNow();
    } else if (v === "favorites" && identityRef.current) {
      openFavoritesNow();
    } else if (v === "account" && identityRef.current) {
      setView("account");
    } else {
      const category = params.get("category");
      setSelectedCategoryId(category || null);
      loadPlans(category || null, "");
      if (category) {
        setExpandedIds((prev) => new Set(prev).add(category));
      }
    }
  }

  // categories / navigation
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [categoryQuickOpen, setCategoryQuickOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // plans / order state
  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [productsLoading, setProductsLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [activePlan, setActivePlan] = useState<Plan | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({}); // key: name||style（目前正在瀏覽的企劃、還沒加入購物車前的暫存）

  const [globalCart, setGlobalCart] = useState<GlobalCartEntry[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem("mibu_cart");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem("mibu_cart", JSON.stringify(globalCart));
    } catch {}
  }, [globalCart]);

  const [cartPlanStatus, setCartPlanStatus] = useState<Record<string, { name: string; deadline: string | null; closed: boolean; codLimit: number; priorCodTotal: number; allowCodOnRemitLink: boolean; found: boolean }>>({});
  const [cartPaymentByPlan, setCartPaymentByPlan] = useState<Record<string, string>>({});
  const [checkoutingPlanId, setCheckoutingPlanId] = useState<string | null>(null);
  const [selectedCartKeys, setSelectedCartKeys] = useState<Set<string>>(new Set());
  const [checkoutPaymentByPlan, setCheckoutPaymentByPlan] = useState<Record<string, string>>({});
  const [submittingCheckout, setSubmittingCheckout] = useState(false);
  const [selectedProductName, setSelectedProductName] = useState<string | null>(null);
  const [selectedStyleByProduct, setSelectedStyleByProduct] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<any[]>([]);
  const [historySearch, setHistorySearch] = useState("");
  const [historyStatusFilter, setHistoryStatusFilter] = useState<string>("all"); // all | purchased | shipping | arrived | distributing
  const [historyCancelFilter, setHistoryCancelFilter] = useState<string>("all"); // all | normal | pending
  const [remitOnlyMode, setRemitOnlyMode] = useState(false); // true＝目前網址路徑是 /remit，固定只能匯款；個別企劃如果有勾選「限定連結取付」，取付選項仍會保留
  const [announcements, setAnnouncements] = useState<{ id: string; content: string; createdAt: string }[]>([]);
  const [announcementPanelOpen, setAnnouncementPanelOpen] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [announcementModal, setAnnouncementModal] = useState<{ content: string; createdAt: string } | null>(null);
  const [truncatedMap, setTruncatedMap] = useState<Record<string, boolean>>({});
  const [checkoutNotice, setCheckoutNotice] = useState("");
  const announcementWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/categories", { cache: "no-store" }).then((r) => r.json()).then((d) => setCategories(d.categories || []));
    fetch("/api/announcements", { cache: "no-store" }).then((r) => r.json()).then((d) => setAnnouncements(d.announcements || [])).catch(() => {});
    fetch("/api/site-settings", { cache: "no-store" }).then((r) => r.json()).then((d) => setCheckoutNotice(d.checkoutNotice || "")).catch(() => {});

    const params = new URLSearchParams(window.location.search);

    // 用網址路徑判斷是不是「限定匯款」模式：/remit 這個路徑進來的訪客固定只能匯款，
    // 個別企劃如果有勾選「限定連結取付」，取付選項仍會保留；純粹依當下網址判斷，不會被瀏覽器記住、
    // 也沒辦法被使用者自己解除，因為狀態只跟「現在在哪個路徑」有關
    setRemitOnlyMode(window.location.pathname === "/remit" || window.location.pathname.startsWith("/remit/"));

    const verify = params.get("verify");
    if (verify === "success") setVerifyBannerMsg("信箱驗證成功！");
    else if (verify === "invalid") setVerifyBannerMsg("驗證連結無效或已過期。");
    const openLogin = params.get("openLogin");
    if (openLogin) {
      setAuthTab("login");
      setView("identity");
    }
    if (verify || openLogin) window.history.replaceState({}, "", window.location.pathname);

    // 先確認有沒有保持登入的 session（重新整理網頁不會登出），確認完才還原網址對應的畫面
    fetch("/api/auth/session", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.loggedIn) {
          const id: Identity = {
            username: d.username,
            profileUrl: d.profileUrl,
            email: d.email,
            emailVerified: d.emailVerified,
            pendingProfileUrl: d.pendingProfileUrl,
          };
          identityRef.current = id;
          setIdentity(id);
        }
        if (!openLogin) {
          restoringFromHistoryRef.current = true;
          restoreFromUrlParams(params);
          restoringFromHistoryRef.current = false;
        }
      });

    // 支援瀏覽器上一頁／下一頁
    function onPopState() {
      restoringFromHistoryRef.current = true;
      restoreFromUrlParams(new URLSearchParams(window.location.search));
      restoringFromHistoryRef.current = false;
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (announcementWrapRef.current && !announcementWrapRef.current.contains(e.target as Node)) {
        setAnnouncementPanelOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 2200);
  }

  async function loadPlans(categoryId?: string | null, q?: string) {
    setView("plans");
    setPlansLoading(true);
    const params = new URLSearchParams();
    if (categoryId) params.set("categoryId", categoryId);
    if (q) params.set("q", q);
    const r = await fetch(`/api/plans?${params.toString()}`, { cache: "no-store" });
    const d = await r.json();
    setPlans(d.plans || []);
    setPlansLoading(false);
  }

  function selectCategory(id: string | null) {
    setSelectedCategoryId(id);
    loadPlans(id, searchQuery);
    setMobileDrawerOpen(false);
    syncUrl(id ? { view: "plans", category: id } : {});
    // 選到有子分類的分類時，自動展開，不用另外去點小箭頭
    if (id && categories.some((c) => c.parentId === id)) {
      setExpandedIds((prev) => new Set(prev).add(id));
    }
  }

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function runSearch() {
    loadPlans(selectedCategoryId, searchQuery);
    setSearchOpen(false);
  }

  function getCategoryChain(id: string | null): Category[] {
    if (!id) return [];
    const chain: Category[] = [];
    let cur = categories.find((c) => c.id === id) || null;
    while (cur) {
      chain.unshift(cur);
      cur = cur.parentId ? categories.find((c) => c.id === cur!.parentId) || null : null;
    }
    return chain;
  }

  // 逛企劃、看商品完全不需要登入；只有「送出訂單」「查歷史訂單」才會要求先選身分
  async function openPlan(p: Plan) {
    syncUrl({ view: "plan", id: p.id });
    setView("order");
    setActivePlan(null);
    setProducts([]);
    setProductsLoading(true);
    const r = await fetch(`/api/plans/${p.id}`, { cache: "no-store" });
    const d = await r.json();
    setActivePlan(d.plan);
    setProducts(d.products || []);
    setCart({});
    setSelectedProductName(null);
    setSelectedStyleByProduct({});
    setProductsLoading(false);
  }

  function clearAuthForms() {
    setLoginUsername("");
    setLoginPassword("");
    setRegUsername("");
    setRegPassword("");
    setRegConfirmPassword("");
    setRegProfileUrl("");
    setRegEmail("");
  }

  function requireIdentity(action: PendingAction) {
    setPendingAction(action);
    setAuthMsg("");
    setRegisterDone(false);
    clearAuthForms();
    setView("identity");
  }

  async function onLogin() {
    setAuthMsg("");
    if (!loginUsername.trim() || !loginPassword) return setAuthMsg("請輸入帳號密碼");
    setAuthSubmitting(true);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: loginUsername.trim(), password: loginPassword }),
      });
      const d = await r.json();
      if (!r.ok) return setAuthMsg(d.error || "登入失敗");
      const id = { username: d.username, profileUrl: d.profileUrl, email: d.email, emailVerified: d.emailVerified, pendingProfileUrl: d.pendingProfileUrl };
      setIdentity(id);
      setLoginPassword("");
      afterAuthSuccess(id);
    } catch {
      setAuthMsg("網路連線失敗，請再試一次");
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function onRegister() {
    setAuthMsg("");
    if (regUsername.trim().length < 1) return setAuthMsg("請輸入帳號");
    if (regPassword.length < 6) return setAuthMsg("密碼至少要 6 個字");
    if (regPassword !== regConfirmPassword) return setAuthMsg("兩次輸入的密碼不一樣");
    if (!regProfileUrl.trim()) return setAuthMsg("請填寫個人頁網址");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(regEmail)) return setAuthMsg("請輸入有效的 Email");

    setAuthSubmitting(true);
    try {
      const r = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: regUsername.trim(),
          password: regPassword,
          confirmPassword: regConfirmPassword,
          profileUrl: regProfileUrl.trim(),
          email: regEmail.trim(),
        }),
      });
      const d = await r.json();
      if (!r.ok) return setAuthMsg(d.error || "註冊失敗");
      const id = { username: d.username, profileUrl: d.profileUrl, email: d.email, emailVerified: d.emailVerified, pendingProfileUrl: d.pendingProfileUrl };
      setIdentity(id);
      clearAuthForms();
      setRegisterVerifyEmailSent(d.verifyEmailSent !== false);
      setRegisterDone(true);
    } catch {
      setAuthMsg("網路連線失敗，請再試一次");
    } finally {
      setAuthSubmitting(false);
    }
  }

  // 登入成功後，回到原本想做的事（送出訂單 / 查歷史），沒有的話就回企劃列表
  function continueAfterRegister() {
    setRegisterDone(false);
    if (identity) afterAuthSuccess(identity);
  }

  function measureTruncation(id: string) {
    return (el: HTMLSpanElement | null) => {
      if (!el) return;
      const isTrunc = el.scrollWidth > el.clientWidth + 1;
      setTruncatedMap((prev) => (prev[id] === isTrunc ? prev : { ...prev, [id]: isTrunc }));
    };
  }

  function resetLegacyFlow() {
    setLegacyStep("input");
    setLegacyNickname("");
    setLegacyCandidates([]);
    setLegacySelectedId(null);
    setLegacyUsername("");
    setLegacyPassword("");
    setLegacyConfirmPassword("");
    setLegacyEmail("");
    setLegacyContactNote("");
    setLegacyMsg("");
  }

  async function onLegacyLookup() {
    setLegacyMsg("");
    if (!legacyNickname.trim()) return setLegacyMsg("請輸入暱稱");
    setLegacySubmitting(true);
    try {
      const r = await fetch(`/api/auth/legacy-lookup?nickname=${encodeURIComponent(legacyNickname.trim())}`);
      const d = await r.json();
      if (!r.ok) return setLegacyMsg(d.error || "查詢失敗");
      if (d.alreadyRegistered) { setLegacyStep("alreadyRegistered"); return; }
      if (!d.found) { setLegacyStep("notfound"); return; }
      setLegacyCandidates(d.candidates);
      setLegacySelectedId(d.candidates.length === 1 ? d.candidates[0].id : null);
      setLegacyStep("confirm");
    } catch {
      setLegacyMsg("網路連線失敗，請再試一次");
    } finally {
      setLegacySubmitting(false);
    }
  }

  function onLegacyConfirmYes() {
    if (!legacySelectedId) return setLegacyMsg("請先選擇是你的哪一筆資料");
    setLegacyMsg("");
    setLegacyUsername(legacyNickname.trim());
    setLegacyStep("form");
  }

  async function onLegacyClaim() {
    setLegacyMsg("");
    if (!legacySelectedId) return setLegacyMsg("請先選擇你的身份");
    if (legacyUsername.trim().length < 1) return setLegacyMsg("請輸入帳號");
    if (legacyPassword.length < 6) return setLegacyMsg("密碼至少要 6 個字");
    if (legacyPassword !== legacyConfirmPassword) return setLegacyMsg("兩次輸入的密碼不一樣");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(legacyEmail)) return setLegacyMsg("請輸入有效的 Email");
    setLegacySubmitting(true);
    try {
      const r = await fetch("/api/auth/legacy-claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identityId: legacySelectedId,
          username: legacyUsername.trim(),
          password: legacyPassword,
          confirmPassword: legacyConfirmPassword,
          email: legacyEmail.trim(),
        }),
      });
      const d = await r.json();
      if (!r.ok) return setLegacyMsg(d.error || "建立失敗");
      const id = { username: d.username, profileUrl: d.profileUrl, email: d.email, emailVerified: d.emailVerified, pendingProfileUrl: null };
      setIdentity(id);
      setLegacyClaimedOrders(d.claimedOrders || 0);
      setRegisterVerifyEmailSent(d.verifyEmailSent !== false);
      if (d.syncWarning) setVerifyBannerMsg(d.syncWarning);
      setRegisterDone(true);
      resetLegacyFlow();
    } catch {
      setLegacyMsg("網路連線失敗，請再試一次");
    } finally {
      setLegacySubmitting(false);
    }
  }

  async function onLegacyClaimRequest() {
    setLegacyMsg("");
    setLegacySubmitting(true);
    try {
      const r = await fetch("/api/auth/legacy-claim-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: legacyNickname.trim(), contactNote: legacyContactNote.trim() }),
      });
      const d = await r.json();
      if (!r.ok) return setLegacyMsg(d.error || "送出失敗");
      setLegacyStep("requestSent");
    } catch {
      setLegacyMsg("網路連線失敗，請再試一次");
    } finally {
      setLegacySubmitting(false);
    }
  }

  function resetLinkFlow() {
    setLinkStep("input");
    setLinkNickname("");
    setLinkCandidates([]);
    setLinkSelectedId(null);
    setLinkContactNote("");
    setLinkMsg("");
  }

  async function onLinkLookup() {
    setLinkMsg("");
    if (!linkNickname.trim()) return setLinkMsg("請輸入暱稱");
    setLinkSubmitting(true);
    try {
      const r = await fetch(`/api/auth/legacy-lookup?nickname=${encodeURIComponent(linkNickname.trim())}`);
      const d = await r.json();
      if (!r.ok) return setLinkMsg(d.error || "查詢失敗");
      if (d.alreadyRegistered) { setLinkMsg("這個暱稱已經對應到另一個帳號了，如果那是你本人的另一組帳號，這邊沒辦法自動合併，麻煩聯絡管理者協助處理。"); return; }
      if (!d.found) { setLinkStep("notfound"); return; }
      setLinkCandidates(d.candidates);
      setLinkSelectedId(d.candidates.length === 1 ? d.candidates[0].id : null);
      setLinkStep("confirm");
    } catch {
      setLinkMsg("網路連線失敗，請再試一次");
    } finally {
      setLinkSubmitting(false);
    }
  }

  async function onLinkConfirm() {
    setLinkMsg("");
    if (!linkSelectedId) return setLinkMsg("請先選擇是你的哪一筆資料");
    setLinkSubmitting(true);
    try {
      const r = await fetch("/api/auth/legacy-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identityId: linkSelectedId }),
      });
      const d = await r.json();
      if (!r.ok) return setLinkMsg(d.error || "連結失敗");
      setLinkClaimedOrders(d.claimedOrders || 0);
      setLinkMsg(d.syncWarning || `連結成功！已經把 ${d.claimedOrders || 0} 筆舊訂單轉移到這個帳號，去「歷史訂單」就能看到了。`);
      setLinkStep("input");
      setLinkNickname("");
      setLinkCandidates([]);
      setLinkSelectedId(null);
    } catch {
      setLinkMsg("網路連線失敗，請再試一次");
    } finally {
      setLinkSubmitting(false);
    }
  }

  async function onLinkClaimRequest() {
    setLinkMsg("");
    setLinkSubmitting(true);
    try {
      const r = await fetch("/api/auth/legacy-claim-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: linkNickname.trim(), contactNote: linkContactNote.trim() || `（已有帳號：${identity?.username}）` }),
      });
      const d = await r.json();
      if (!r.ok) return setLinkMsg(d.error || "送出失敗");
      setLinkStep("requestSent");
    } catch {
      setLinkMsg("網路連線失敗，請再試一次");
    } finally {
      setLinkSubmitting(false);
    }
  }

  function afterAuthSuccess(id: Identity) {
    const action = pendingAction;
    setPendingAction(null);
    loadFavorites(id);
    if (action === "order") {
      setView("order");
      showToast("身分驗證成功，請按「新增訂單」送出");
    } else if (action === "history") {
      openHistoryNow(id);
    } else if (action === "favorites") {
      openFavoritesNow(id);
    } else {
      loadPlans(selectedCategoryId, searchQuery);
    }
  }

  async function loadFavorites(useIdentity?: Identity) {
    const id = useIdentity || identityRef.current;
    if (!id) return;
    const r = await fetch(`/api/favorites?username=${encodeURIComponent(id.username)}`, { cache: "no-store" });
    const d = await r.json();
    setFavoritedPlanIds(new Set<string>(d.planIds || []));
    setFavoritePlans(
      (d.favorites || []).map((f: any) => ({
        id: f.id, name: f.name, imageUrl: f.imageUrl, codLimit: 0, deadline: f.deadline,
        closed: f.closed, categoryId: null, categoryName: f.categoryName, categoryParentId: null,
      }))
    );
  }

  async function toggleFavorite(planId: string) {
    if (!identity) {
      requireIdentity("favorites");
      showToast("請先登入才能收藏");
      return;
    }
    const isFav = favoritedPlanIds.has(planId);
    // 先更新畫面，讓使用者立刻看到反應，失敗再復原
    setFavoritedPlanIds((prev) => {
      const next = new Set(prev);
      if (isFav) next.delete(planId);
      else next.add(planId);
      return next;
    });
    try {
      const r = await fetch("/api/favorites", {
        method: isFav ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: identity.username, planId }),
      });
      if (!r.ok) throw new Error();
      loadFavorites();
    } catch {
      // 失敗就復原剛剛的畫面更新
      setFavoritedPlanIds((prev) => {
        const next = new Set(prev);
        if (isFav) next.add(planId);
        else next.delete(planId);
        return next;
      });
      showToast("收藏失敗，請再試一次");
    }
  }

  async function openFavorites() {
    if (!identity) {
      requireIdentity("favorites");
      return;
    }
    openFavoritesNow();
  }

  async function openFavoritesNow(useIdentity?: Identity) {
    const id = useIdentity || identityRef.current;
    if (!id) return;
    syncUrl({ view: "favorites" });
    setView("favorites");
    setCategoryQuickOpen(false);
    setFavoritesLoading(true);
    await loadFavorites(id);
    setFavoritesLoading(false);
  }

  function changeQty(name: string, style: string, delta: number) {
    const key = `${name}||${style}`;
    setCart((prev) => {
      const next = { ...prev };
      const cur = next[key] || 0;
      const val = Math.max(0, cur + delta);
      if (val === 0) delete next[key];
      else next[key] = val;
      return next;
    });
  }

  function setQtyExact(name: string, style: string, raw: string) {
    const key = `${name}||${style}`;
    const val = Math.max(0, Math.floor(Number(raw)) || 0);
    setCart((prev) => {
      const next = { ...prev };
      if (val === 0) delete next[key];
      else next[key] = val;
      return next;
    });
  }

  const cartTotal = Object.entries(cart).reduce((sum, [key, qty]) => {
    const [name, style] = key.split("||");
    const p = products.find((pp) => pp.name === name && pp.style === style);
    return sum + (p ? p.price * qty : 0);
  }, 0);
  const cartCount = Object.values(cart).reduce((s, n) => s + n, 0);
  const globalCartCount = globalCart.reduce((s, e) => s + e.qty, 0);
  const globalCartTotal = globalCart.reduce((s, e) => s + e.qty * e.price, 0);

  function addToCart() {
    if (submittingOrder) return;
    if (!activePlan) return;
    const items: CartItem[] = Object.entries(cart).map(([key, qty]) => {
      const [name, style] = key.split("||");
      return { name, style, qty };
    });
    if (items.length === 0) return showToast("請至少選擇一項商品");

    setGlobalCart((prev) => {
      const next = [...prev];
      for (const it of items) {
        const p = products.find((pp) => pp.name === it.name && pp.style === it.style);
        const idx = next.findIndex((e) => e.planId === activePlan.id && e.productName === it.name && e.style === it.style);
        if (idx >= 0) {
          next[idx] = { ...next[idx], qty: next[idx].qty + it.qty, price: p?.price ?? next[idx].price, imageUrl: p?.imageUrl ?? next[idx].imageUrl };
        } else {
          next.push({
            planId: activePlan.id,
            planName: activePlan.name,
            planDeadline: activePlan.deadline || null,
            productName: it.name,
            style: it.style,
            qty: it.qty,
            price: p?.price ?? 0,
            imageUrl: p?.imageUrl,
          });
        }
      }
      return next;
    });
    setCart({});
    showToast("已加入購物車");
  }

  async function refreshCartPlanStatuses() {
    const planIds = Array.from(new Set(globalCart.map((e) => e.planId)));
    const uname = identityRef.current?.username || "";
    const results = await Promise.all(
      planIds.map(async (id) => {
        try {
          const qs = uname ? `?username=${encodeURIComponent(uname)}` : "";
          const r = await fetch(`/api/plans/${id}${qs}`, { cache: "no-store" });
          if (!r.ok) return [id, null] as const;
          const d = await r.json();
          return [id, d.plan] as const;
        } catch {
          return [id, null] as const;
        }
      })
    );
    setCartPlanStatus((prev) => {
      const next = { ...prev };
      for (const [id, plan] of results) {
        if (plan) {
          next[id] = { name: plan.name, deadline: plan.deadline, closed: plan.closed, codLimit: plan.codLimit || 0, priorCodTotal: plan.priorCodTotal || 0, allowCodOnRemitLink: !!plan.allowCodOnRemitLink, found: true };
        } else {
          next[id] = { name: "", deadline: null, closed: true, codLimit: 0, priorCodTotal: 0, allowCodOnRemitLink: false, found: false };
        }
      }
      return next;
    });
  }

  function removeCartItem(planId: string, productName: string, style: string) {
    setGlobalCart((prev) => prev.filter((e) => !(e.planId === planId && e.productName === productName && e.style === style)));
  }

  function removeCartGroup(planId: string) {
    setGlobalCart((prev) => prev.filter((e) => e.planId !== planId));
  }

  function changeCartQty(planId: string, productName: string, style: string, delta: number) {
    setGlobalCart((prev) =>
      prev
        .map((e) => (e.planId === planId && e.productName === productName && e.style === style ? { ...e, qty: Math.max(1, e.qty + delta) } : e))
    );
  }

  function setCartQtyExact(planId: string, productName: string, style: string, raw: string) {
    const val = Math.max(1, Math.floor(Number(raw)) || 1);
    setGlobalCart((prev) =>
      prev.map((e) => (e.planId === planId && e.productName === productName && e.style === style ? { ...e, qty: val } : e))
    );
  }

  function cartItemKey(planId: string, productName: string, style: string) {
    return `${planId}||${productName}||${style}`;
  }

  function isGroupActive(planId: string) {
    const live = cartPlanStatus[planId];
    return live ? live.found && !live.closed : true; // 還沒問過的話先當作可選，畫面上也不會顯示成失效
  }

  function toggleCartItemSelect(key: string) {
    setSelectedCartKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleSelectAllCart() {
    const selectableKeys = globalCart.filter((e) => isGroupActive(e.planId)).map((e) => cartItemKey(e.planId, e.productName, e.style));
    const allSelected = selectableKeys.length > 0 && selectableKeys.every((k) => selectedCartKeys.has(k));
    setSelectedCartKeys(allSelected ? new Set() : new Set(selectableKeys));
  }

  function deleteSelectedCartItems() {
    if (selectedCartKeys.size === 0) return showToast("請先勾選要刪除的商品");
    setGlobalCart((prev) => prev.filter((e) => !selectedCartKeys.has(cartItemKey(e.planId, e.productName, e.style))));
    setSelectedCartKeys(new Set());
  }

  function goToCheckout() {
    const selectedActive = globalCart.filter((e) => selectedCartKeys.has(cartItemKey(e.planId, e.productName, e.style)) && isGroupActive(e.planId));
    if (selectedActive.length === 0) return showToast("請先勾選要結帳的商品（已失效的企劃無法結帳）");
    syncUrl({ view: "checkout" });
    setView("checkout");
  }

  async function submitCheckout() {
    if (submittingCheckout) return;
    if (!identity) {
      requireIdentity("order");
      return;
    }
    if (!identity.emailVerified) {
      showToast("請先驗證信箱後才能下單");
      return;
    }
    const selectedEntries = globalCart.filter((e) => selectedCartKeys.has(cartItemKey(e.planId, e.productName, e.style)) && isGroupActive(e.planId));
    const planIds = Array.from(new Set(selectedEntries.map((e) => e.planId)));
    if (planIds.length === 0) return;

    setSubmittingCheckout(true);
    const succeededPlanIds: string[] = [];
    const errors: string[] = [];
    for (const planId of planIds) {
      const groupItems = selectedEntries.filter((e) => e.planId === planId);
      const planAllowsCod = !remitOnlyMode || !!cartPlanStatus[planId]?.allowCodOnRemitLink;
      const payment = planAllowsCod ? (checkoutPaymentByPlan[planId] || "匯款") : "匯款";
      try {
        const r = await fetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            planId,
            items: groupItems.map((e) => ({ name: e.productName, style: e.style, qty: e.qty })),
            username: identity.username,
            payment,
          }),
        });
        const d = await r.json();
        if (!r.ok) {
          errors.push(`${groupItems[0].planName}：${d.error || "送出失敗"}`);
        } else {
          succeededPlanIds.push(planId);
        }
      } catch {
        errors.push(`${groupItems[0].planName}：網路連線失敗`);
      }
    }

    if (succeededPlanIds.length > 0) {
      const succeededKeys = new Set(
        selectedEntries
          .filter((e) => succeededPlanIds.includes(e.planId))
          .map((e) => cartItemKey(e.planId, e.productName, e.style))
      );
      setGlobalCart((prev) => prev.filter((e) => !succeededKeys.has(cartItemKey(e.planId, e.productName, e.style))));
      setSelectedCartKeys((prev) => {
        const next = new Set(prev);
        for (const e of selectedEntries) {
          if (succeededPlanIds.includes(e.planId)) next.delete(cartItemKey(e.planId, e.productName, e.style));
        }
        return next;
      });
    }

    if (errors.length === 0) {
      showToast(`已成功送出 ${succeededPlanIds.length} 筆訂單`);
      openCart();
    } else if (succeededPlanIds.length > 0) {
      showToast(`部分成功：${succeededPlanIds.length} 筆送出、${errors.length} 筆失敗`);
    } else {
      showToast(errors.join("；"));
    }
    setSubmittingCheckout(false);
  }

  function openCart() {
    syncUrl({ view: "cart" });
    setView("cart");
    refreshCartPlanStatuses();
  }

  async function openHistory() {
    if (!identity) {
      requireIdentity("history");
      return;
    }
    openHistoryNow(identity);
  }

  async function openHistoryNow(useIdentity?: Identity) {
    const id = useIdentity || identityRef.current;
    if (!id) return;
    syncUrl({ view: "history" });
    setView("history");
    setCategoryQuickOpen(false);
    setHistoryLoading(true);
    const params = new URLSearchParams();
    params.set("username", id.username);
    const r = await fetch(`/api/orders?${params.toString()}`, { cache: "no-store" });
    const d = await r.json();
    setHistory(d.orders || []);
    setExpandedOrders(new Set((d.orders || []).map((o: any) => o.orderNo))); // 預設全部展開
    setHistoryLoading(false);
  }

  const filteredHistory = useMemo(() => {
    const kw = historySearch.trim().toLowerCase();
    return history.filter((o: any) => {
      if (kw) {
        const orderNoMatch = String(o.orderNo || "").toLowerCase().includes(kw);
        const planNameMatch = String(o.planName || "").toLowerCase().includes(kw);
        const itemMatch = (o.items || []).some((it: any) =>
          String(it.name || "").toLowerCase().includes(kw) ||
          String(it.style || "").toLowerCase().includes(kw)
        );
        if (!orderNoMatch && !planNameMatch && !itemMatch) return false;
      }
      if (historyStatusFilter !== "all" && o.fulfillmentStatus !== historyStatusFilter) return false;
      if (historyCancelFilter === "pending" && !o.cancelRequested) return false;
      if (historyCancelFilter === "normal" && o.cancelRequested) return false;
      return true;
    });
  }, [history, historySearch, historyStatusFilter, historyCancelFilter]);

  function toggleOrderExpanded(orderNo: string) {
    setExpandedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(orderNo)) next.delete(orderNo);
      else next.add(orderNo);
      return next;
    });
  }

  async function requestCancelOrder(orderNo: string) {
    if (!identity) return;
    if (!confirm("確定要申請取消這張訂單嗎？申請後需要等最高管理者審核通過才會真的取消。")) return;
    const r = await fetch(`/api/orders/${orderNo}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: identity.username }),
    });
    const d = await r.json();
    if (!r.ok) return showToast(d.error || "申請失敗");
    showToast("已送出取消申請，請等待審核");
    openHistoryNow();
  }

  async function changeAccountPassword() {
    setAccountMsg("");
    if (!identity) return;
    if (!accountPasswordSectionPw) return setAccountMsg("請輸入目前的密碼");
    if (accountNewPw.length < 6) return setAccountMsg("新密碼至少要 6 個字");
    if (accountNewPw !== accountConfirmPw) return setAccountMsg("兩次輸入的新密碼不一樣");

    setAccountSaving(true);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: identity.username, password: accountPasswordSectionPw, newPassword: accountNewPw }),
      });
      const d = await r.json();
      if (!r.ok) return setAccountMsg(d.error || "修改失敗");
      setAccountMsg("密碼已更新");
      setAccountPasswordSectionPw("");
      setAccountNewPw("");
      setAccountConfirmPw("");
    } catch {
      setAccountMsg("網路連線失敗，請再試一次");
    } finally {
      setAccountSaving(false);
    }
  }

  async function updateAccountProfile() {
    setAccountProfileMsg("");
    if (!identity) return;
    if (!accountCurrentPw && !accountNewEmail && !accountNewProfileUrl) return;
    if (!accountCurrentPw) return setAccountProfileMsg("請輸入目前的密碼");
    if (!accountNewEmail.trim() && !accountNewProfileUrl.trim()) return setAccountProfileMsg("請填寫要更新的信箱或個人頁網址");

    setAccountProfileSaving(true);
    try {
      const r = await fetch("/api/auth/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: identity.username,
          password: accountCurrentPw,
          newEmail: accountNewEmail.trim() || undefined,
          newProfileUrl: accountNewProfileUrl.trim() || undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok) return setAccountProfileMsg(d.error || "更新失敗");
      setIdentity({ username: d.username, profileUrl: d.profileUrl, email: d.email, emailVerified: d.emailVerified, pendingProfileUrl: d.pendingProfileUrl });
      setAccountNewEmail("");
      setAccountNewProfileUrl("");
      const parts: string[] = [];
      if (d.verifyEmailSent) parts.push("信箱已更新，驗證信已寄出，請去收信點連結驗證（記得也檢查一下垃圾郵件匣）");
      if (d.profileUrlSubmittedForReview) parts.push("個人頁網址修改申請已送出，需等最高管理者審核通過才會生效");
      if (d.profileUrlCosmeticUpdate) parts.push("個人頁網址格式已更新（網址本體沒有變，不需要審核）");
      setAccountProfileMsg(parts.length > 0 ? parts.join("；") + "。" : "沒有偵測到任何變動，請確認有填寫要更新的內容。");
    } catch {
      setAccountProfileMsg("網路連線失敗，請再試一次");
    } finally {
      setAccountProfileSaving(false);
    }
  }

  async function resendMemberVerification() {
    setAccountProfileMsg("");
    if (!identity) return;
    if (!accountCurrentPw) return setAccountProfileMsg("請先在下面輸入目前的密碼，再點這個按鈕");
    setAccountProfileSaving(true);
    try {
      const r = await fetch("/api/auth/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: identity.username, password: accountCurrentPw, newEmail: identity.email }),
      });
      const d = await r.json();
      if (!r.ok) return setAccountProfileMsg(d.error || "失敗");
      setIdentity({ username: d.username, profileUrl: d.profileUrl, email: d.email, emailVerified: d.emailVerified, pendingProfileUrl: d.pendingProfileUrl });
      setAccountProfileMsg(d.verifyEmailSent ? "驗證信已重新寄出，請去收信點連結驗證（記得也檢查一下垃圾郵件匣）。" : "這個信箱已經驗證過了。");
    } catch {
      setAccountProfileMsg("網路連線失敗，請再試一次");
    } finally {
      setAccountProfileSaving(false);
    }
  }

  function goHome() {
    setSelectedCategoryId(null);
    loadPlans(null, "");
    setSearchQuery("");
    syncUrl({});
  }

  async function logout() {
    setIdentity(null);
    identityRef.current = null;
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {}
    goHome();
  }

  // ---- 麵包屑 ----
  // 在企劃詳細頁時，路徑要用「這個企劃實際歸屬的分類」，而不是使用者是從哪個篩選點進來的
  const chain =
    view === "order" && activePlan ? getCategoryChain(activePlan.categoryId ?? null) : getCategoryChain(selectedCategoryId);
  const breadcrumbParts: { label: string; onClick?: () => void }[] = [
    { label: "全部", onClick: () => goHome() },
  ];
  chain.forEach((c) => {
    breadcrumbParts.push({ label: c.name, onClick: () => selectCategory(c.id) });
  });
  if (view === "order" && activePlan) {
    breadcrumbParts.push({ label: activePlan.name });
  }

  const isAccountArea = view === "history" || view === "account" || view === "favorites";

  function renderAccountNav(closeAfterSelect: boolean) {
    return (
      <>
        <p className="category-tree-title">會員專區</p>
        <div
          className={`account-nav-item ${view === "history" ? "active" : ""}`}
          onClick={() => { openHistoryNow(); if (closeAfterSelect) setMobileDrawerOpen(false); }}
        >
          顯示歷史資料
        </div>
        <div
          className={`account-nav-item ${view === "favorites" ? "active" : ""}`}
          onClick={() => { openFavoritesNow(); if (closeAfterSelect) setMobileDrawerOpen(false); }}
        >
          我的收藏
        </div>
        <div
          className={`account-nav-item ${view === "account" ? "active" : ""}`}
          onClick={() => { syncUrl({ view: "account" }); setView("account"); setAccountMsg(""); setCategoryQuickOpen(false); if (closeAfterSelect) setMobileDrawerOpen(false); }}
        >
          編輯會員資料
        </div>
      </>
    );
  }

  function renderCategoryTree(onAfterSelect?: () => void) {
    const roots = categories.filter((c) => !c.parentId);
    return (
      <>

        <div
          className={`category-item root ${!selectedCategoryId ? "active" : ""}`}
          onClick={() => { selectCategory(null); onAfterSelect?.(); }}
        >
          全部
        </div>
        {roots.map((root) => {
          const children = categories.filter((c) => c.parentId === root.id);
          const hasChildren = children.length > 0;
          const expanded = expandedIds.has(root.id);
          return (
            <div key={root.id}>
              <div
                className={`category-item ${selectedCategoryId === root.id ? "active" : ""}`}
                onClick={() => { selectCategory(root.id); onAfterSelect?.(); }}
              >
                <span>{root.name}</span>
                {hasChildren && (
                  <span onClick={(e) => { e.stopPropagation(); toggleExpand(root.id); }} style={{ display: "flex", padding: 6, margin: -6 }}>
                    {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </span>
                )}
              </div>
              {hasChildren && expanded && (
                <div>
                  {children.map((child) => (
                    <div
                      key={child.id}
                      className={`subcategory-item ${selectedCategoryId === child.id ? "active" : ""}`}
                      onClick={() => { selectCategory(child.id); onAfterSelect?.(); }}
                    >
                      {child.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </>
    );
  }

  function renderBreadcrumb() {
    return (
      <div className="breadcrumb-row">
        {breadcrumbParts.map((part, idx) => {
          const isLast = idx === breadcrumbParts.length - 1;
          return (
            <span key={idx}>
              <span
                className={`breadcrumb-item ${isLast ? "current" : ""}`}
                onClick={isLast ? undefined : part.onClick}
              >
                {part.label}
              </span>
              {!isLast && <span className="breadcrumb-sep">&rsaquo;</span>}
            </span>
          );
        })}
      </div>
    );
  }

  return (
    <>
      {!bannerDismissed && announcements[0] && (
        <div className="mibu-announcement-banner">
          <span className="mibu-announcement-banner-spacer" aria-hidden="true" />
          <span className="mibu-announcement-banner-text-wrap">
            <span className="mibu-announcement-banner-text" ref={measureTruncation(`banner-${announcements[0].id}`)}>
              {announcements[0].content}
            </span>
            {truncatedMap[`banner-${announcements[0].id}`] && (
              <span className="mibu-announcement-more" onClick={() => setAnnouncementModal(announcements[0])}>more</span>
            )}
          </span>
          <button className="mibu-announcement-banner-close" aria-label="關閉公告" onClick={() => setBannerDismissed(true)}>
            <X size={16} />
          </button>
        </div>
      )}
      <header className="mibu-header">
        <div className="mibu-header-inner">
          {!searchOpen && (
            <div className="mibu-header-row">
              <div className="mibu-logo-group">
                <button
                  className="mibu-icon-btn"
                  aria-label="展開分類目錄"
                  onClick={() => {
                    if (isAccountArea) {
                      setCategoryQuickOpen((v) => !v);
                    } else {
                      setSidebarOpen((v) => !v);
                      setMobileDrawerOpen((v) => !v);
                    }
                  }}
                >
                  <Menu size={20} />
                </button>
                <span className="mibu-logo" onClick={goHome} style={{ cursor: "pointer" }}>米舖</span>
              </div>
              <div className="mibu-right-group">
                <div className="mibu-search-desktop">
                  <Search size={15} color="var(--muted)" />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }}
                    placeholder="搜尋企劃、商品"
                  />
                </div>
                <button className="mibu-icon-btn mibu-search-icon-mobile" aria-label="搜尋" onClick={() => setSearchOpen(true)}>
                  <Search size={19} />
                </button>
                <div className="mibu-hover-wrap" ref={announcementWrapRef}>
                  <button className="mibu-icon-btn" aria-label="公告" onClick={() => setAnnouncementPanelOpen((v) => !v)}>
                    <Bell size={19} />
                  </button>
                  {announcementPanelOpen && (
                    <div className="mibu-announcement-panel">
                      <div className="mibu-hover-panel-title">最新公告</div>
                      {announcements.length === 0 ? (
                        <div className="mibu-hover-panel-empty">目前沒有公告</div>
                      ) : (
                        announcements.map((a) => (
                          <div key={a.id} className="mibu-announcement-panel-item">
                            <div className="mibu-announcement-panel-date">{new Date(a.createdAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}</div>
                            <div className="mibu-announcement-panel-content-row">
                              <span className="mibu-announcement-panel-content" ref={measureTruncation(`bell-${a.id}`)}>
                                {a.content}
                              </span>
                              {truncatedMap[`bell-${a.id}`] && (
                                <span className="mibu-announcement-more" onClick={() => setAnnouncementModal(a)}>more</span>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
                <div className="mibu-hover-wrap">
                  <button className="mibu-icon-btn" aria-label="會員／我的訂單" onClick={openHistory}>
                    <UserCircle size={19} />
                  </button>
                  <div className="mibu-hover-panel">
                    {identity ? (
                      <>
                        <div className="mibu-hover-panel-title">{identity.username}</div>
                        <div className="mibu-hover-panel-row"><span>個人頁</span><span style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{identity.profileUrl}</span></div>
                      </>
                    ) : (
                      <div className="mibu-hover-panel-empty">尚未登入，點擊查看歷史訂單時會先要求登入</div>
                    )}
                  </div>
                </div>
                <div className="mibu-hover-wrap">
                  <button className="mibu-cart-wrap" onClick={openCart} style={{ background: "none", border: "none", cursor: "pointer" }} aria-label="購物車">
                    <ShoppingCart size={19} color="var(--muted)" />
                    {globalCartCount > 0 && <span className="mibu-cart-badge">{globalCartCount}</span>}
                  </button>
                  <div className="mibu-hover-panel">
                    <div className="mibu-hover-panel-title">購物車</div>
                    {globalCart.length === 0 ? (
                      <div className="mibu-hover-panel-empty">購物車是空的</div>
                    ) : (
                      <>
                        {Object.entries(
                          globalCart.reduce<Record<string, number>>((acc, e) => {
                            acc[e.planName] = (acc[e.planName] || 0) + e.qty * e.price;
                            return acc;
                          }, {})
                        ).map(([planName, subtotal]) => (
                          <div className="mibu-hover-panel-row" key={planName}>
                            <span>{planName}</span>
                            <span>NT$ {fmt(subtotal)}</span>
                          </div>
                        ))}
                        <div className="mibu-hover-panel-row" style={{ borderTop: "1px dashed var(--line)", marginTop: 6, paddingTop: 6, fontWeight: 600, color: "var(--text)" }}>
                          <span>合計</span><span>NT$ {fmt(globalCartTotal)}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
                {identity ? (
                  <button className="mibu-auth-link" onClick={logout}>登出</button>
                ) : (
                  <button className="mibu-auth-link" onClick={() => requireIdentity(null)}>登入 / 註冊</button>
                )}
              </div>
            </div>
          )}
          {searchOpen && (
            <div className="mibu-header-row mibu-search-mobile-bar">
              <Search size={16} color="var(--muted)" />
              <input
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }}
                placeholder="搜尋企劃、商品"
              />
              <button className="mibu-icon-btn" aria-label="關閉搜尋" onClick={() => setSearchOpen(false)}>
                <X size={18} />
              </button>
            </div>
          )}
        </div>
      </header>

      {view === "identity" ? (
        <div style={{ maxWidth: 460, margin: "48px auto", padding: "0 16px" }}>
          <div className="auth-card" style={{ margin: 0, boxShadow: "0 4px 24px rgba(0,0,0,.04)" }}>
            {registerDone ? (
              <div style={{ textAlign: "center" }}>
                <h2 className="section-title">{legacyClaimedOrders > 0 ? "帳號整合成功" : "註冊成功"}</h2>
                {legacyClaimedOrders > 0 && (
                  <p style={{ color: "#166534", fontSize: 14, marginBottom: 4 }}>
                    已經幫你把 {legacyClaimedOrders} 筆舊訂單轉移到這個新帳號，之後在「歷史訂單」就能看到。
                  </p>
                )}
                <p style={{ color: "#6B6858", fontSize: 14 }}>
                  {registerVerifyEmailSent
                    ? "我們已經寄了一封驗證信到你的信箱，記得去點連結驗證（如果收件匣沒看到，記得也檢查一下垃圾郵件匣）。"
                    : "但驗證信寄送失敗了，可以之後到「編輯會員資料」重新觸發寄送。"}
                </p>
                <button className="btn" onClick={continueAfterRegister}>開始逛逛</button>
              </div>
            ) : (
              <>
                <a className="auth-back-link" onClick={() => { setPendingAction(null); setView("plans"); }}>← 返回</a>
                {verifyBannerMsg && <div className="rules-box">{verifyBannerMsg}</div>}
                {authTab !== "legacy" && pendingAction === "order" && <div className="rules-box">送出訂單前，請先登入</div>}
                {authTab !== "legacy" && pendingAction === "favorites" && <div className="rules-box">收藏企劃前，請先登入</div>}

                <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                  <button className={`src-btn ${authTab === "login" ? "active" : ""}`} onClick={() => { setAuthTab("login"); setAuthMsg(""); }}>登入</button>
                  <button className={`src-btn ${authTab === "register" ? "active" : ""}`} onClick={() => { setAuthTab("register"); setAuthMsg(""); }}>註冊新帳號</button>
                  <button className={`src-btn ${authTab === "legacy" ? "active" : ""}`} onClick={() => { setAuthTab("legacy"); setAuthMsg(""); resetLegacyFlow(); }}>舊會員整合</button>
                </div>

                {authTab === "login" ? (
                  <>
                    <h2 className="section-title">登入</h2>
                    <div className="id-row">
                      <span className="id-label">帳號</span>
                      <input type="text" value={loginUsername} onChange={(e) => setLoginUsername(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onLogin()} />
                    </div>
                    <div className="id-row">
                      <span className="id-label">密碼</span>
                      <input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onLogin()} />
                    </div>
                    <div className="auth-msg">{authMsg}</div>
                    <button className="btn" onClick={onLogin} disabled={authSubmitting}>{authSubmitting ? "登入中…" : "登入"}</button>
                    <p style={{ fontSize: 13, marginTop: 10 }}>
                      <a href="/forgot-password" style={{ color: "var(--muted)" }}>忘記密碼？</a>
                    </p>
                  </>
                ) : authTab === "register" ? (
                  <>
                    <h2 className="section-title">建立新帳號</h2>
                    <div className="id-row">
                      <span className="id-label">帳號</span>
                      <input type="text" value={regUsername} onChange={(e) => setRegUsername(e.target.value)} placeholder="帳號" />
                    </div>
                    <div className="id-row">
                      <span className="id-label">密碼</span>
                      <input type="password" value={regPassword} onChange={(e) => setRegPassword(e.target.value)} placeholder="至少 6 個字" />
                    </div>
                    <div className="id-row">
                      <span className="id-label">確認密碼</span>
                      <input type="password" value={regConfirmPassword} onChange={(e) => setRegConfirmPassword(e.target.value)} placeholder="再輸入一次" />
                    </div>
                    <div className="id-row">
                      <span className="id-label">個人頁網址</span>
                      <input type="text" value={regProfileUrl} onChange={(e) => setRegProfileUrl(e.target.value)} placeholder="例如你的 FB 個人首頁網址" />
                    </div>
                    <div className="id-row">
                      <span className="id-label">Email</span>
                      <input type="text" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} placeholder="請留下可收信的信箱，會寄驗證信" />
                    </div>
                    <div className="auth-msg">{authMsg}</div>
                    <button className="btn" onClick={onRegister} disabled={authSubmitting}>{authSubmitting ? "建立中…" : "註冊"}</button>
                  </>
                ) : (
                  <>
                    <h2 className="section-title">舊會員整合</h2>
                    <p style={{ color: "#6B6858", fontSize: 13, marginBottom: 14 }}>
                      這裡是用來整合你以前訂單紀錄用的。如果你以前沒有下單過，直接去「註冊新帳號」就可以了。
                    </p>

                    {legacyStep === "input" && (
                      <>
                        <div className="id-row">
                          <span className="id-label">暱稱</span>
                          <input
                            type="text"
                            value={legacyNickname}
                            onChange={(e) => setLegacyNickname(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && onLegacyLookup()}
                            placeholder="以前用的 FB／LINE／Discord 暱稱，任一個都可以試"
                          />
                        </div>
                        <div className="auth-msg">{legacyMsg}</div>
                        <button className="btn" onClick={onLegacyLookup} disabled={legacySubmitting}>{legacySubmitting ? "查詢中…" : "查詢"}</button>
                      </>
                    )}

                    {legacyStep === "alreadyRegistered" && (
                      <div>
                        <p style={{ color: "#6B6858", fontSize: 14 }}>這個帳號已經註冊過了，請直接登入，或使用忘記密碼功能。</p>
                        <button className="btn" onClick={() => { setAuthTab("login"); resetLegacyFlow(); }}>去登入</button>
                      </div>
                    )}

                    {legacyStep === "notfound" && (
                      <div>
                        <p style={{ color: "#6B6858", fontSize: 14, marginBottom: 12 }}>
                          在舊資料裡找不到符合「{legacyNickname}」的紀錄。可能是暱稱打錯字、或是資料還沒有整理進來。
                          可以按下面的按鈕請管理者協助確認。
                        </p>
                        <div className="id-row">
                          <span className="id-label">補充說明</span>
                          <input
                            type="text"
                            value={legacyContactNote}
                            onChange={(e) => setLegacyContactNote(e.target.value)}
                            placeholder="選填，例如留個聯絡方式或以前買過什麼"
                          />
                        </div>
                        <div className="auth-msg">{legacyMsg}</div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button className="btn" onClick={onLegacyClaimRequest} disabled={legacySubmitting}>
                            {legacySubmitting ? "送出中…" : "請管理者協助確認"}
                          </button>
                          <button className="src-btn" onClick={resetLegacyFlow}>重新輸入暱稱</button>
                        </div>
                      </div>
                    )}

                    {legacyStep === "requestSent" && (
                      <div>
                        <p style={{ color: "#6B6858", fontSize: 14 }}>已經送出，請等待管理者協助確認，確認後可以請他跟你回報怎麼操作。</p>
                        <button className="btn" onClick={resetLegacyFlow}>回上一步</button>
                      </div>
                    )}

                    {legacyStep === "confirm" && (
                      <div>
                        <p style={{ color: "#6B6858", fontSize: 14, marginBottom: 10 }}>
                          {legacyCandidates.length > 1 ? "找到好幾筆符合的資料，請選出是你的那一筆：" : "找到符合的資料，這是你嗎？"}
                        </p>
                        {legacyCandidates.map((c) => (
                          <label
                            key={c.id}
                            style={{
                              display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", marginBottom: 8,
                              border: `1px solid ${legacySelectedId === c.id ? "var(--primary)" : "var(--line)"}`,
                              borderRadius: 8, cursor: "pointer", background: legacySelectedId === c.id ? "#FDF6EC" : "transparent",
                            }}
                          >
                            <input type="radio" name="legacyCandidate" checked={legacySelectedId === c.id} onChange={() => setLegacySelectedId(c.id)} />
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 13, color: "var(--muted)" }}>{c.nicknames.join(" / ") || "(無暱稱)"}</div>
                              <a href={c.profileUrl} target="_blank" rel="noreferrer" style={{ fontSize: 13, wordBreak: "break-all" }}>{c.profileUrl}</a>
                            </div>
                          </label>
                        ))}
                        <div className="auth-msg">{legacyMsg}</div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button className="btn" onClick={onLegacyConfirmYes} disabled={!legacySelectedId}>是我，繼續設定帳號</button>
                          <button className="src-btn" onClick={resetLegacyFlow}>不是我／重新輸入</button>
                        </div>
                      </div>
                    )}

                    {legacyStep === "form" && (
                      <>
                        <p style={{ color: "#6B6858", fontSize: 13, marginBottom: 10 }}>設定新帳號密碼，之後就用這組帳密登入。</p>
                        <div className="id-row">
                          <span className="id-label">帳號</span>
                          <input type="text" value={legacyUsername} onChange={(e) => setLegacyUsername(e.target.value)} placeholder="帳號，預設沿用你的暱稱" />
                        </div>
                        <div className="id-row">
                          <span className="id-label">密碼</span>
                          <input type="password" value={legacyPassword} onChange={(e) => setLegacyPassword(e.target.value)} placeholder="至少 6 個字" />
                        </div>
                        <div className="id-row">
                          <span className="id-label">確認密碼</span>
                          <input type="password" value={legacyConfirmPassword} onChange={(e) => setLegacyConfirmPassword(e.target.value)} placeholder="再輸入一次" />
                        </div>
                        <div className="id-row">
                          <span className="id-label">Email</span>
                          <input type="text" value={legacyEmail} onChange={(e) => setLegacyEmail(e.target.value)} placeholder="請留下可收信的信箱，會寄驗證信" />
                        </div>
                        <div className="auth-msg">{legacyMsg}</div>
                        <button className="btn" onClick={onLegacyClaim} disabled={legacySubmitting}>{legacySubmitting ? "建立中…" : "完成，建立帳號"}</button>
                      </>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="mibu-content-row" style={{ maxWidth: 1200, margin: "0 auto" }}>
          <aside
            className={`category-sidebar-desktop ${isAccountArea ? "account-sidebar-active" : ""}`}
            style={!isAccountArea ? { display: sidebarOpen ? undefined : "none" } : undefined}
          >
            {isAccountArea
              ? categoryQuickOpen
                ? renderCategoryTree(() => setCategoryQuickOpen(false))
                : renderAccountNav(false)
              : renderCategoryTree()}
          </aside>

          <div className={`category-drawer-mobile ${mobileDrawerOpen && !isAccountArea ? "open" : ""}`}>
            <div className="category-drawer-panel">{renderCategoryTree(() => setMobileDrawerOpen(false))}</div>
          </div>

          <main className="main" style={{ flex: 1, minWidth: 0, padding: "20px 24px" }}>
            {!isAccountArea && view !== "cart" && view !== "checkout" && renderBreadcrumb()}

            {view === "plans" && (
              <div>
                {plansLoading ? (
                  <div className="spinner">載入中…</div>
                ) : (
                  <div className="plan-grid">
                    {plans.map((p) => (
                      <div key={p.id} className={`plan-card-v2 ${p.closed ? "closed" : ""}`} onClick={() => openPlan(p)}>
                        <div className="plan-card-v2-img">
                          {p.imageUrl && <img src={p.imageUrl} alt={p.name} />}
                          {p.categoryName && <span className="plan-card-v2-tag">{p.categoryName}</span>}
                          <span className={`plan-card-v2-status ${p.closed ? "closed-tag" : "open"}`}>
                            {p.closed ? "已截止" : "開放中"}
                          </span>
                        </div>
                        <div className="plan-card-v2-body">
                          <p className="plan-card-v2-name">{p.name}</p>
                          {p.deadline && (
                            <p className="plan-card-v2-meta">
                              {p.closed ? "已於 " : "截止 "}
                              {new Date(p.deadline).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                    {plans.length === 0 && <div className="spinner">沒有符合條件的企劃</div>}
                  </div>
                )}
              </div>
            )}

            {view === "order" && productsLoading && (
              <div className="spinner">載入中…</div>
            )}

            {view === "order" && !productsLoading && activePlan && (
              <div>
                {activePlan.closed && <div className="banner warn">此企劃已截止，無法新增訂單</div>}

                {activePlan.promoImages && activePlan.promoImages.length > 0 && (
                  <div className="promo-gallery">
                    {activePlan.promoImages.map((url, i) => (
                      <img key={i} src={url} alt={`宣傳圖 ${i + 1}`} onClick={() => setLightboxUrl(url)} />
                    ))}
                  </div>
                )}

                {(() => {
                  const grouped = products.reduce<Record<string, Product[]>>((acc, p) => {
                    acc[p.name] = acc[p.name] || [];
                    acc[p.name].push(p);
                    return acc;
                  }, {});
                  const productNames = Object.keys(grouped);
                  if (productNames.length === 0) return null;

                  const activeProductName = selectedProductName && grouped[selectedProductName] ? selectedProductName : productNames[0];
                  const activeStyles = grouped[activeProductName];
                  const currentStyle = selectedStyleByProduct[activeProductName] ?? activeStyles[0].style;
                  const current = activeStyles.find((s) => s.style === currentStyle) || activeStyles[0];
                  const key = `${current.name}||${current.style}`;
                  const qty = cart[key] || 0;

                  const productQtyTotal = (pname: string) =>
                    grouped[pname].reduce((sum, s) => sum + (cart[`${s.name}||${s.style}`] || 0), 0);

                  return (
                    <div className="product-card-v3">
                      <div className="product-title-block">
                        <h2 className="product-plan-title">{activePlan.name}</h2>
                        {activePlan.deadline && (
                          <div className="product-plan-deadline">
                            {activePlan.closed ? "已於 " : "截止 "}
                            {new Date(activePlan.deadline).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}
                          </div>
                        )}
                      </div>

                      <div className="product-gallery-v3">
                        {current.imageUrl ? (
                          <img
                            src={current.imageUrl}
                            alt={current.style || activeProductName}
                            onClick={() => setLightboxUrl(current.imageUrl!)}
                          />
                        ) : (
                          <div className="product-gallery-v3-empty">尚無圖片</div>
                        )}
                      </div>

                      <div className="product-info-v3">

                        <div className="product-price-row">
                          <span className="product-price-v3">NT$ {fmt(current.price)}</span>
                          <button
                            className={`favorite-icon-btn ${favoritedPlanIds.has(activePlan.id) ? "active" : ""}`}
                            onClick={() => toggleFavorite(activePlan.id)}
                            aria-label="收藏"
                          >
                            <Heart size={20} fill={favoritedPlanIds.has(activePlan.id) ? "#D85A30" : "none"} />
                          </button>
                        </div>

                        {productNames.length > 1 && (
                          <>
                            <div className="product-info-v3-label">商品</div>
                            <div className="style-pills">
                              {productNames.map((pname) => (
                                <button
                                  key={pname}
                                  className={`style-pill ${activeProductName === pname ? "active" : ""}`}
                                  onClick={() => setSelectedProductName(pname)}
                                >
                                  {pname}
                                  {productQtyTotal(pname) > 0 && <span className="style-pill-badge">{productQtyTotal(pname)}</span>}
                                </button>
                              ))}
                            </div>
                          </>
                        )}

                        {productNames.length === 1 && <h4>{activeProductName}</h4>}

                        <div className="product-info-v3-label">款式</div>
                        <div className="style-pills">
                          {activeStyles.map((s) => (
                            <button
                              key={s.style}
                              className={`style-pill ${currentStyle === s.style ? "active" : ""}`}
                              onClick={() => setSelectedStyleByProduct((prev) => ({ ...prev, [activeProductName]: s.style }))}
                            >
                              {s.style || "單一款式"}
                              {(cart[`${s.name}||${s.style}`] || 0) > 0 && (
                                <span className="style-pill-badge">{cart[`${s.name}||${s.style}`]}</span>
                              )}
                            </button>
                          ))}
                        </div>

                        <div className="product-info-v3-label">數量</div>
                        <div className="stepper stepper-lg">
                          <button className="step-btn" disabled={qty <= 0 || activePlan.closed} onClick={() => changeQty(current.name, current.style, -1)}>－</button>
                          <input
                            className="qty"
                            type="number"
                            min={0}
                            value={qty}
                            disabled={activePlan.closed}
                            onChange={(e) => setQtyExact(current.name, current.style, e.target.value)}
                          />
                          <button className="step-btn" disabled={activePlan.closed} onClick={() => changeQty(current.name, current.style, 1)}>＋</button>
                        </div>

                        <div className="product-checkout-row">
                          <span className="product-checkout-total">合計 NT$ {fmt(cartTotal)}</span>
                          <button
                            className="btn"
                            disabled={activePlan.closed || cartCount === 0}
                            onClick={addToCart}
                          >
                            加入購物車
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {view === "history" && (
              <div>
                <h2 className="section-title">我的歷史訂單</h2>

                {!historyLoading && history.length > 0 && (
                  <div className="hist-filter-bar">
                    <div className="hist-search-box">
                      <Search size={16} className="hist-search-icon" />
                      <input
                        type="text"
                        placeholder="搜尋訂單編號／企劃名稱／商品"
                        value={historySearch}
                        onChange={(e) => setHistorySearch(e.target.value)}
                        className="hist-search-input"
                      />
                      {historySearch && (
                        <button className="hist-search-clear" onClick={() => setHistorySearch("")} aria-label="清除搜尋">
                          <X size={14} />
                        </button>
                      )}
                    </div>
                    <select
                      className="hist-filter-select"
                      value={historyStatusFilter}
                      onChange={(e) => setHistoryStatusFilter(e.target.value)}
                    >
                      <option value="all">全部企劃狀態</option>
                      {Object.entries(FULFILLMENT_STATUS_MAP).map(([key, v]) => (
                        <option key={key} value={key}>{v.label}</option>
                      ))}
                    </select>
                    <select
                      className="hist-filter-select"
                      value={historyCancelFilter}
                      onChange={(e) => setHistoryCancelFilter(e.target.value)}
                    >
                      <option value="all">全部訂單</option>
                      <option value="normal">一般訂單</option>
                      <option value="pending">取消審核中</option>
                    </select>
                  </div>
                )}

                {historyLoading && <div className="spinner">載入中…</div>}
                {!historyLoading && history.length === 0 && <div className="spinner">目前沒有訂單紀錄</div>}
                {!historyLoading && history.length > 0 && filteredHistory.length === 0 && (
                  <div className="spinner">沒有符合搜尋/篩選條件的訂單</div>
                )}
                {!historyLoading && filteredHistory.map((o) => {
                  const expanded = expandedOrders.has(o.orderNo);
                  return (
                    <div className="hist-card" key={o.orderNo}>
                      <div className="hist-head" onClick={() => toggleOrderExpanded(o.orderNo)} style={{ cursor: "pointer" }}>
                        <span className="hist-src">
                          <span className="hist-meta-row">
                            <span className="hist-order-no">訂單編號 {o.orderNo}</span>
                            {o.fulfillmentStatus && FULFILLMENT_STATUS_MAP[o.fulfillmentStatus] && (
                              <span
                                className="hist-status-badge"
                                style={{ background: FULFILLMENT_STATUS_MAP[o.fulfillmentStatus].color }}
                              >
                                {FULFILLMENT_STATUS_MAP[o.fulfillmentStatus].label}
                              </span>
                            )}
                          </span>
                          <span
                            className={`hist-plan-name ${o.planId ? "hist-plan-name-link" : ""}`}
                            onClick={(e) => {
                              if (!o.planId) return;
                              e.stopPropagation();
                              openPlan({ id: o.planId } as Plan);
                            }}
                            title={o.planId ? "點擊查看這個企劃" : "這個企劃無法查看（已刪除或資料不完整）"}
                          >
                            {o.planName}
                          </span>
                        </span>
                        <span className="hist-time">{new Date(o.createdAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}</span>
                        <ChevronDown size={22} className="hist-toggle-icon" style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
                      </div>
                      {expanded && (
                        <>
                          {o.items.map((it: any, idx: number) => (
                            <div className="hist-item" key={idx}>
                              <div className="hist-item-left">
                                {it.imageUrl ? (
                                  <img src={it.imageUrl} alt={it.name} className="hist-item-img" />
                                ) : (
                                  <div className="hist-item-img hist-item-img-empty" />
                                )}
                                <span>{it.name}{it.style ? `（${it.style}）` : ""} x{it.qty}</span>
                              </div>
                              <span>NT$ {fmt(it.subtotal)}</span>
                            </div>
                          ))}
                          <div className="hist-total">交易方式：{o.payment}　合計 NT$ {fmt(o.total)}</div>
                          {o.paidAmount > 0 && (
                            <div className="hist-paid-confirm">
                              ✓ 已確認收到您的款項 NT$ {fmt(o.paidAmount)}
                            </div>
                          )}
                          <div className="hist-actions">
                            {o.cancelRequested ? (
                              <span className="hist-cancel-badge">取消審核中，請等待管理者確認</span>
                            ) : o.planClosed ? (
                              <span style={{ fontSize: 12, color: "var(--muted)" }}>企劃已截止，無法申請取消</span>
                            ) : (
                              <button className="btn danger small" onClick={() => requestCancelOrder(o.orderNo)}>申請取消訂單</button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {view === "favorites" && (
              <div>
                <h2 className="section-title">我的收藏</h2>
                {favoritesLoading && <div className="spinner">載入中…</div>}
                {!favoritesLoading && favoritePlans.length === 0 && <div className="spinner">還沒有收藏任何企劃</div>}
                {!favoritesLoading && favoritePlans.length > 0 && (
                  <div className="plan-grid">
                    {favoritePlans.map((p) => (
                      <div key={p.id} className={`plan-card-v2 ${p.closed ? "closed" : ""}`} onClick={() => openPlan(p)}>
                        <div className="plan-card-v2-img">
                          {p.imageUrl && <img src={p.imageUrl} alt={p.name} />}
                          {p.categoryName && <span className="plan-card-v2-tag">{p.categoryName}</span>}
                          <span className={`plan-card-v2-status ${p.closed ? "closed-tag" : "open"}`}>
                            {p.closed ? "已截止" : "開放中"}
                          </span>
                        </div>
                        <div className="plan-card-v2-body">
                          <p className="plan-card-v2-name">{p.name}</p>
                          {p.deadline && (
                            <p className="plan-card-v2-meta">
                              {p.closed ? "已於 " : "截止 "}
                              {new Date(p.deadline).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {view === "cart" && (
              <div>
                <h2 className="section-title">購物車</h2>

                {globalCart.length === 0 && (
                  <div className="cart-empty">
                    <div className="cart-empty-icon"><ShoppingCart size={32} /></div>
                    <p>購物車是空的</p>
                    <button className="btn" onClick={goHome}>去逛逛企劃</button>
                  </div>
                )}

                {globalCart.length > 0 && (
                  <div className="cart-toolbar">
                    <label className="cart-checkbox-label">
                      <input type="checkbox" className="cart-checkbox" onChange={toggleSelectAllCart} checked={
                        globalCart.filter((e) => isGroupActive(e.planId)).length > 0 &&
                        globalCart.filter((e) => isGroupActive(e.planId)).every((e) => selectedCartKeys.has(cartItemKey(e.planId, e.productName, e.style)))
                      } />
                      <span>全選（{selectedCartKeys.size} 項已選）</span>
                    </label>
                    <button className="btn small secondary" onClick={deleteSelectedCartItems} disabled={selectedCartKeys.size === 0}>刪除已選</button>
                  </div>
                )}

                {Object.entries(
                  globalCart.reduce<Record<string, GlobalCartEntry[]>>((acc, e) => {
                    acc[e.planId] = acc[e.planId] || [];
                    acc[e.planId].push(e);
                    return acc;
                  }, {})
                )
                  .sort(([planIdA], [planIdB]) => {
                    const inactiveA = cartPlanStatus[planIdA] ? (!cartPlanStatus[planIdA].found || cartPlanStatus[planIdA].closed) : false;
                    const inactiveB = cartPlanStatus[planIdB] ? (!cartPlanStatus[planIdB].found || cartPlanStatus[planIdB].closed) : false;
                    return Number(inactiveA) - Number(inactiveB);
                  })
                  .map(([planId, entries]) => {
                  const live = cartPlanStatus[planId];
                  const planName = live?.name || entries[0].planName;
                  const deadline = live ? live.deadline : entries[0].planDeadline;
                  const isInactive = live ? (!live.found || live.closed) : false;
                  const groupTotal = entries.reduce((s, e) => s + e.qty * e.price, 0);

                  return (
                    <div key={planId} className={`cart-group ${isInactive ? "cart-group-inactive" : ""}`}>
                      <div className="cart-group-header">
                        <div>
                          <span
                            className="cart-group-plan-name"
                            onClick={() => { if (live?.found !== false) openPlan({ id: planId } as Plan); }}
                          >
                            {planName || "（找不到這個企劃）"}
                          </span>
                          {deadline && (
                            <span className="cart-group-deadline">
                              {isInactive ? "已於 " : "截止 "}
                              {new Date(deadline).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}
                            </span>
                          )}
                        </div>
                        {isInactive && <span className="cart-inactive-badge">已失效</span>}
                      </div>

                      {entries.map((e) => {
                        const key = cartItemKey(planId, e.productName, e.style);
                        return (
                          <div className="cart-item-row" key={key}>
                            <div className="cart-item-left">
                              <input
                                type="checkbox"
                                className="cart-checkbox"
                                disabled={isInactive}
                                checked={selectedCartKeys.has(key)}
                                onChange={() => toggleCartItemSelect(key)}
                              />
                              {e.imageUrl ? (
                                <img src={e.imageUrl} alt={e.productName} className="cart-item-img" />
                              ) : (
                                <div className="cart-item-img cart-item-img-empty" />
                              )}
                              <div className="cart-item-info">
                                <span className="cart-item-name">{e.productName}{e.style ? `（${e.style}）` : ""}</span>
                                <span className="cart-item-unit-price">NT$ {fmt(e.price)} / 件</span>
                              </div>
                            </div>
                            <div className="cart-item-right">
                              {!isInactive ? (
                                <div className="stepper">
                                  <button className="step-btn" disabled={e.qty <= 1} onClick={() => changeCartQty(planId, e.productName, e.style, -1)}>－</button>
                                  <input
                                    className="qty"
                                    type="number"
                                    min={1}
                                    value={e.qty}
                                    onChange={(ev) => setCartQtyExact(planId, e.productName, e.style, ev.target.value)}
                                  />
                                  <button className="step-btn" onClick={() => changeCartQty(planId, e.productName, e.style, 1)}>＋</button>
                                </div>
                              ) : (
                                <span style={{ fontSize: 13, color: "var(--muted)" }}>x{e.qty}</span>
                              )}
                              <span className="cart-item-price">NT$ {fmt(e.qty * e.price)}</span>
                              <span className="cart-item-remove" onClick={() => removeCartItem(planId, e.productName, e.style)} title="移除">×</span>
                            </div>
                          </div>
                        );
                      })}

                      <div className="cart-group-footer">
                        <span style={{ fontWeight: 600 }}>小計 NT$ {fmt(groupTotal)}</span>
                        <button className="btn small secondary" onClick={() => removeCartGroup(planId)}>清除這組</button>
                      </div>
                    </div>
                  );
                })}

                {globalCart.length > 0 && (
                  <div className="cart-checkout-bar">
                    <span>
                      已選 <strong>{selectedCartKeys.size}</strong> 項商品　
                      合計 <strong>NT$ {fmt(
                        globalCart
                          .filter((e) => selectedCartKeys.has(cartItemKey(e.planId, e.productName, e.style)))
                          .reduce((s, e) => s + e.qty * e.price, 0)
                      )}</strong>
                    </span>
                    <button className="btn" disabled={selectedCartKeys.size === 0} onClick={goToCheckout}>前往結帳</button>
                  </div>
                )}
              </div>
            )}

            {view === "checkout" && (
              <div>
                {checkoutNotice && (
                  <div className="checkout-notice-box">
                    <span className="checkout-notice-icon" aria-hidden="true">ℹ</span>
                    <span className="checkout-notice-text">{checkoutNotice}</span>
                  </div>
                )}
                <h2 className="section-title">結帳</h2>
                <a className="checkout-back-link" onClick={openCart}><span aria-hidden="true">←</span>返回購物車</a>

                {(() => {
                  const selectedEntries = globalCart.filter((e) => selectedCartKeys.has(cartItemKey(e.planId, e.productName, e.style)) && isGroupActive(e.planId));
                  const grouped = selectedEntries.reduce<Record<string, GlobalCartEntry[]>>((acc, e) => {
                    acc[e.planId] = acc[e.planId] || [];
                    acc[e.planId].push(e);
                    return acc;
                  }, {});
                  const grandTotal = selectedEntries.reduce((s, e) => s + e.qty * e.price, 0);

                  return (
                    <>
                      {Object.entries(grouped).map(([planId, entries]) => {
                        const live = cartPlanStatus[planId];
                        const planName = live?.name || entries[0].planName;
                        const groupTotal = entries.reduce((s, e) => s + e.qty * e.price, 0);
                        const codLimit = live?.codLimit || 0;
                        const priorCodTotal = live?.priorCodTotal || 0;
                        const codOffered = codLimit > 0 && (!remitOnlyMode || live?.allowCodOnRemitLink);
                        const codOverLimit = codOffered && priorCodTotal + groupTotal > codLimit;
                        const codDisabled = !codOffered || codOverLimit;
                        const rawPayment = checkoutPaymentByPlan[planId] || "匯款";
                        const payment = (rawPayment === "取付" && codDisabled) ? "匯款" : rawPayment;
                        return (
                          <div key={planId} className="cart-group">
                            <div className="cart-group-header">
                              <span className="cart-group-plan-name" style={{ cursor: "default" }}>{planName}</span>
                            </div>
                            {entries.map((e) => (
                              <div className="cart-item-row" key={`${e.productName}||${e.style}`}>
                                <div className="cart-item-left">
                                  {e.imageUrl ? <img src={e.imageUrl} alt={e.productName} className="cart-item-img" /> : <div className="cart-item-img cart-item-img-empty" />}
                                  <span>{e.productName}{e.style ? `（${e.style}）` : ""} x{e.qty}</span>
                                </div>
                                <span className="cart-item-price">NT$ {fmt(e.qty * e.price)}</span>
                              </div>
                            ))}
                            <div className="cart-checkout-footer">
                              <span style={{ fontWeight: 600 }}>小計 NT$ {fmt(groupTotal)}</span>
                              <div className="cart-checkout-payment">
                                <div className="id-label" style={{ marginBottom: 6 }}>這個企劃的交易方式</div>
                                <div className="source-btns">
                                  {(!codOffered ? ["匯款"] : ["匯款", "取付"]).map((p) => (
                                    <button
                                      key={p}
                                      className={`src-btn ${payment === p ? "active" : ""}`}
                                      disabled={p === "取付" && codDisabled}
                                      onClick={() => setCheckoutPaymentByPlan((prev) => ({ ...prev, [planId]: p }))}
                                    >
                                      {p}
                                    </button>
                                  ))}
                                </div>
                                {codOverLimit && (
                                  <div style={{ color: "#B3261E", fontSize: 12, marginTop: 6 }}>
                                    取付金額超過上限（NT$ {fmt(codLimit)}）{priorCodTotal > 0 ? `，含你之前已取付的 NT$ ${fmt(priorCodTotal)}` : ""}，請改用匯款或減少數量
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      <div className="cart-checkout-bar">
                        <span style={{ fontWeight: 600 }}>總計 NT$ {fmt(grandTotal)}</span>
                        <button className="btn" disabled={submittingCheckout} onClick={submitCheckout}>
                          {submittingCheckout ? "送出中…" : "確認送出訂單"}
                        </button>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            {view === "account" && identity && (
              <div>
                <h2 className="section-title">編輯會員資料</h2>
                <div className="auth-card" style={{ marginTop: 0 }}>
                  <div className="id-row"><span className="id-label">帳號</span><span>{identity.username}</span></div>
                  <div className="id-row"><span className="id-label">個人頁</span><span style={{ wordBreak: "break-all" }}>{identity.profileUrl}</span></div>
                  {identity.pendingProfileUrl && (
                    <div className="id-row">
                      <span className="id-label">審核中</span>
                      <span style={{ wordBreak: "break-all", color: "#B08E5A", fontSize: 13 }}>
                        {identity.pendingProfileUrl}（等待最高管理者審核）
                      </span>
                    </div>
                  )}
                  <div className="id-row">
                    <span className="id-label">Email</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {identity.email}
                      <span style={{ fontSize: 12, color: identity.emailVerified ? "#27500A" : "#B08E5A" }}>
                        {identity.emailVerified ? "（已驗證）" : "（尚未驗證）"}
                      </span>
                      {!identity.emailVerified && (
                        <button className="btn small secondary" onClick={resendMemberVerification} disabled={accountProfileSaving}>
                          {accountProfileSaving ? "寄送中…" : "驗證信箱"}
                        </button>
                      )}
                    </span>
                  </div>
                </div>

                <div className="auth-card">
                  <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>修改信箱／個人頁網址</h3>
                  <div className="id-row">
                    <span className="id-label">新 Email</span>
                    <input type="text" value={accountNewEmail} onChange={(e) => setAccountNewEmail(e.target.value)} placeholder="留空表示不更改" />
                  </div>
                  <div className="id-row">
                    <span className="id-label">新個人頁</span>
                    <input type="text" value={accountNewProfileUrl} onChange={(e) => setAccountNewProfileUrl(e.target.value)} placeholder="留空表示不更改，送出後需等管理者審核才會生效" />
                  </div>
                  <div className="id-row">
                    <span className="id-label">目前密碼</span>
                    <input type="password" value={accountCurrentPw} onChange={(e) => setAccountCurrentPw(e.target.value)} placeholder="驗證身分用" />
                  </div>
                  <div className="auth-msg">{accountProfileMsg}</div>
                  <button className="btn" onClick={updateAccountProfile} disabled={accountProfileSaving}>{accountProfileSaving ? "儲存中…" : "更新"}</button>
                </div>

                <div className="auth-card">
                  <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>修改密碼</h3>
                  <div className="id-row">
                    <span className="id-label">目前密碼</span>
                    <input type="password" value={accountPasswordSectionPw} onChange={(e) => setAccountPasswordSectionPw(e.target.value)} />
                  </div>
                  <div className="id-row">
                    <span className="id-label">新密碼</span>
                    <input type="password" value={accountNewPw} onChange={(e) => setAccountNewPw(e.target.value)} />
                  </div>
                  <div className="id-row">
                    <span className="id-label">確認新密碼</span>
                    <input type="password" value={accountConfirmPw} onChange={(e) => setAccountConfirmPw(e.target.value)} />
                  </div>
                  <div className="auth-msg">{accountMsg}</div>
                  <button className="btn" onClick={changeAccountPassword} disabled={accountSaving}>{accountSaving ? "儲存中…" : "更新密碼"}</button>
                </div>

                <div className="auth-card">
                  <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>連結舊訂單資料</h3>
                  <p style={{ fontSize: 12, color: "#8A8779", margin: "0 0 8px" }}>
                    如果你以前用別的暱稱下過單、但一開始不小心直接註冊了新帳號，可以在這裡把舊訂單連結到現在這個帳號。
                  </p>

                  {linkStep === "input" && (
                    <>
                      <div className="id-row">
                        <span className="id-label">舊暱稱</span>
                        <input
                          type="text"
                          value={linkNickname}
                          onChange={(e) => setLinkNickname(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && onLinkLookup()}
                          placeholder="以前用的 FB／LINE／Discord 暱稱"
                        />
                        <button className="btn small" onClick={onLinkLookup} disabled={linkSubmitting}>{linkSubmitting ? "查詢中…" : "查詢"}</button>
                      </div>
                      <div className="auth-msg">{linkMsg}</div>
                    </>
                  )}

                  {linkStep === "notfound" && (
                    <div>
                      <p style={{ color: "#6B6858", fontSize: 13, marginBottom: 10 }}>
                        在舊資料裡找不到符合「{linkNickname}」的紀錄。可以按下面的按鈕請管理者協助確認。
                      </p>
                      <div className="id-row">
                        <span className="id-label">補充說明</span>
                        <input type="text" value={linkContactNote} onChange={(e) => setLinkContactNote(e.target.value)} placeholder="選填，例如以前買過什麼" />
                      </div>
                      <div className="auth-msg">{linkMsg}</div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button className="btn small" onClick={onLinkClaimRequest} disabled={linkSubmitting}>{linkSubmitting ? "送出中…" : "請管理者協助確認"}</button>
                        <button className="src-btn" onClick={resetLinkFlow}>重新輸入</button>
                      </div>
                    </div>
                  )}

                  {linkStep === "requestSent" && (
                    <div>
                      <p style={{ color: "#6B6858", fontSize: 13 }}>已經送出，請等待管理者協助確認。</p>
                      <button className="btn small" onClick={resetLinkFlow}>回上一步</button>
                    </div>
                  )}

                  {linkStep === "confirm" && (
                    <div>
                      <p style={{ color: "#6B6858", fontSize: 13, marginBottom: 10 }}>
                        {linkCandidates.length > 1 ? "找到好幾筆符合的資料，請選出是你的那一筆：" : "找到符合的資料，這是你嗎？"}
                      </p>
                      {linkCandidates.map((c) => (
                        <label
                          key={c.id}
                          style={{
                            display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", marginBottom: 8,
                            border: `1px solid ${linkSelectedId === c.id ? "var(--primary)" : "var(--line)"}`,
                            borderRadius: 8, cursor: "pointer", background: linkSelectedId === c.id ? "#FDF6EC" : "transparent",
                          }}
                        >
                          <input type="radio" name="linkCandidate" checked={linkSelectedId === c.id} onChange={() => setLinkSelectedId(c.id)} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, color: "var(--muted)" }}>{c.nicknames.join(" / ") || "(無暱稱)"}</div>
                            <a href={c.profileUrl} target="_blank" rel="noreferrer" style={{ fontSize: 13, wordBreak: "break-all" }}>{c.profileUrl}</a>
                          </div>
                        </label>
                      ))}
                      <div className="auth-msg">{linkMsg}</div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button className="btn small" onClick={onLinkConfirm} disabled={!linkSelectedId || linkSubmitting}>{linkSubmitting ? "連結中…" : "是我，連結到這個帳號"}</button>
                        <button className="src-btn" onClick={resetLinkFlow}>不是我／重新輸入</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </main>
        </div>
      )}

      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>

      {lightboxUrl && (
        <div className="lightbox show" onClick={() => setLightboxUrl(null)}>
          <span className="lightbox-close" onClick={() => setLightboxUrl(null)}>&times;</span>
          <img src={lightboxUrl} className="lightbox-img" alt="放大檢視" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {announcementModal && (
        <div className="announcement-modal-overlay" onClick={() => setAnnouncementModal(null)}>
          <div className="announcement-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="announcement-modal-head">
              <span className="announcement-modal-title">公告內容</span>
              <button className="announcement-modal-close" aria-label="關閉" onClick={() => setAnnouncementModal(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="announcement-modal-date">{new Date(announcementModal.createdAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}</div>
            <div className="announcement-modal-content">{announcementModal.content}</div>
          </div>
        </div>
      )}
    </>
  );
}

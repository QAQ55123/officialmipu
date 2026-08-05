"use client";
import { useEffect, useState, useRef } from "react";
import { toDirectImageUrl } from "@/lib/imageUrl";

type Category = { id: string; name: string; parent_id: string | null; created_at?: string; sort_order?: number; isGiftCategory?: boolean };
type SeriesAdmin = {
  id: string; name: string; imageUrl: string | null;
  visibleTo: string[]; categoryId: string | null; categoryName: string | null;
  promoImages?: string[]; sortOrder?: number; isVisible?: boolean;
};
type ProductAdmin = { id: string; seriesId: string; name: string; style: string; price: number; imageUrl: string | null; hasDiscountFlag?: boolean; codAllowed?: boolean; shippingFee?: number; linkedGiftStyleId?: string | null; coverImageUrl?: string | null };

const emptyCategoryForm = { id: "", name: "", parentId: "", isGiftCategory: false };
const emptyPlanForm = { id: "", name: "", imageUrl: "", visibleTo: [] as string[], categoryId: "", promoImages: [] as string[], isVisible: true };
const emptyProductForm = { id: "", name: "", style: "", price: "0", imageUrl: "", hasDiscountFlag: true, codAllowed: true, shippingFee: "0", linkedGiftStyleId: null as string | null, coverImageUrl: "" };

export default function AdminPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginMsg, setLoginMsg] = useState("");
  const [verifyMsg, setVerifyMsg] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [currentUsername, setCurrentUsername] = useState("");
  const [currentRole, setCurrentRole] = useState<"owner" | "staff" | "">("");
  const [currentEmail, setCurrentEmail] = useState("");
  const [currentEmailVerified, setCurrentEmailVerified] = useState(false);
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [adminEmailPw, setAdminEmailPw] = useState("");
  const [adminEmailMsg, setAdminEmailMsg] = useState("");
  const [adminCurrentPw, setAdminCurrentPw] = useState("");
  const [adminNewPw, setAdminNewPw] = useState("");
  const [adminConfirmPw, setAdminConfirmPw] = useState("");
  const [adminPwMsg, setAdminPwMsg] = useState("");
  const [savingAdminPw, setSavingAdminPw] = useState(false);
  const [savingAdminEmail, setSavingAdminEmail] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [activeSection, setActiveSection] = useState<"account" | "categories" | "series" | "productImport" | "campaigns" | "products" | "orders" | "members" | "codes" | "legacy" | "announcements">("account");
  const categoryFormRef = useRef<HTMLDivElement>(null);
  const planFormRef = useRef<HTMLDivElement>(null);
  const [categoryFilterText, setCategoryFilterText] = useState("");
  const [planFilterText, setPlanFilterText] = useState("");
  const [unlocked, setUnlocked] = useState(false);

  // ---- 分類 ----
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryForm, setCategoryForm] = useState(emptyCategoryForm);
  const [categoryMsg, setCategoryMsg] = useState("");

  // ---- 系列 ----
  const [plans, setPlans] = useState<SeriesAdmin[]>([]);
  const [planForm, setPlanForm] = useState(emptyPlanForm);
  const [planMsg, setPlanMsg] = useState("");

  // ---- 檔期（2.4~2.7節：純粹時間窗口，跟系列/商品無關）----
  const emptyCampaignRates = () => ({
    txn_bank_discount_gift_enabled: true, txn_bank_discount_gift_rate: "",
    txn_bank_discount_nogift_enabled: true, txn_bank_discount_nogift_rate: "",
    txn_bank_nodiscount_gift_enabled: true, txn_bank_nodiscount_gift_rate: "",
    txn_bank_nodiscount_nogift_enabled: true, txn_bank_nodiscount_nogift_rate: "",
    txn_cod_discount_gift_enabled: true, txn_cod_discount_gift_rate: "",
    txn_cod_discount_nogift_enabled: true, txn_cod_discount_nogift_rate: "",
    txn_cod_nodiscount_gift_enabled: true, txn_cod_nodiscount_gift_rate: "",
    txn_cod_nodiscount_nogift_enabled: true, txn_cod_nodiscount_nogift_rate: "",
  });
  const emptyCampaignForm = {
    id: "", name: "", opensAt: "", closesAt: "",
    codCampaignCap: "", giftCodCampaignCap: "", giftBaseUnit: "100", vendorOrderGiftCap: "",
    rates: emptyCampaignRates(),
  };
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [campaignForm, setCampaignForm] = useState(emptyCampaignForm);
  const [campaignMsg, setCampaignMsg] = useState("");
  const [activeCampaignForGifts, setActiveCampaignForGifts] = useState<any | null>(null);

  // ---- 3.2節：廠商規則設定 ----
  const [activeCampaignForVendorRules, setActiveCampaignForVendorRules] = useState<any | null>(null);
  const [giftSeriesCampaignId, setGiftSeriesCampaignId] = useState("");
  const [autoCreatingGiftSeries, setAutoCreatingGiftSeries] = useState(false);
  const [autoCreateGiftMsg, setAutoCreateGiftMsg] = useState("");

  // ---- 3.1/3.3節：拆單主頁面 ----
  const [activeCampaignForBatches, setActiveCampaignForBatches] = useState<any | null>(null);
  const [batchesTab, setBatchesTab] = useState<"batches" | "gap" | "extra">("batches");
  const [unassignedPool, setUnassignedPool] = useState<any[]>([]);
  const [purchaseBatches, setPurchaseBatches] = useState<any[]>([]);
  const [batchGiftGap, setBatchGiftGap] = useState<any[]>([]);
  const [extraPurchases, setExtraPurchases] = useState<any[]>([]);
  const [batchesMsg, setBatchesMsg] = useState("");
  const [floatingToast, setFloatingToast] = useState("");

  // 拆單相關頁面內容常常很長，訊息如果只顯示在頁面最上方，捲動下去操作時會看不到，
  // 這裡額外用一個固定在畫面右下角、不會因為捲動而消失的浮動提示同步顯示
  useEffect(() => {
    if (batchesMsg) {
      setFloatingToast(batchesMsg);
      const t = setTimeout(() => setFloatingToast(""), 4000);
      return () => clearTimeout(t);
    }
  }, [batchesMsg]);
  const [newBatchPlatformId, setNewBatchPlatformId] = useState("");
  const [assignQtyByItem, setAssignQtyByItem] = useState<Record<string, string>>({});
  const [assignTargetBatchByItem, setAssignTargetBatchByItem] = useState<Record<string, string>>({});
  const [giftPickByBatch, setGiftPickByBatch] = useState<Record<string, string>>({});
  const [giftQtyByBatch, setGiftQtyByBatch] = useState<Record<string, string>>({});
  const [extraGiftStyleId, setExtraGiftStyleId] = useState("");
  const [extraQty, setExtraQty] = useState("");
  const [extraNote, setExtraNote] = useState("");

  // ---- 3.5節：到貨追蹤 ----
  const [activeBatchForArrival, setActiveBatchForArrival] = useState<any | null>(null);
  const [arrivalTree, setArrivalTree] = useState<any[]>([]);
  const [arrivalUnshippedPool, setArrivalUnshippedPool] = useState<any[]>([]);
  const [newOrderNumber, setNewOrderNumber] = useState("");
  const [newTrackingByOrderNumber, setNewTrackingByOrderNumber] = useState<Record<string, string>>({});
  const [assignShipQtyByPoolItem, setAssignShipQtyByPoolItem] = useState<Record<string, string>>({});
  const [assignShipTargetByPoolItem, setAssignShipTargetByPoolItem] = useState<Record<string, string>>({});
  const [arrivalMsg, setArrivalMsg] = useState("");
  useEffect(() => {
    if (arrivalMsg) {
      setFloatingToast(arrivalMsg);
      const t = setTimeout(() => setFloatingToast(""), 4000);
      return () => clearTimeout(t);
    }
  }, [arrivalMsg]);

  async function openArrivalTracking(batch: any) {
    setActiveBatchForArrival(batch);
    setArrivalMsg("");
    await loadArrivalTree(batch.id);
  }

  async function loadArrivalTree(batchId: string) {
    const r = await fetch(`/api/admin/campaigns/${activeCampaignForBatches.id}/purchase-batches/${batchId}/arrival`);
    const d = await r.json();
    setArrivalTree(d.tree || []);
    setArrivalUnshippedPool(d.unshippedPool || []);
  }

  async function addOrderNumber() {
    if (!activeBatchForArrival || !activeCampaignForBatches) return;
    if (!newOrderNumber.trim()) return setArrivalMsg("請輸入廠商訂單編號");
    try {
      await callJson(`/api/admin/campaigns/${activeCampaignForBatches.id}/purchase-batches/${activeBatchForArrival.id}/arrival`, "POST", { orderNumber: newOrderNumber });
      setNewOrderNumber("");
      loadArrivalTree(activeBatchForArrival.id);
    } catch (e: any) {
      setArrivalMsg(e.message || "新增失敗");
    }
  }

  async function deleteOrderNumber(orderNumberId: string) {
    if (!activeBatchForArrival) return;
    if (!confirm("確定要刪除這個廠商訂單編號嗎？底下的物流單號也會一起刪除。")) return;
    await callJson(`/api/admin/order-numbers/${orderNumberId}`, "DELETE", {});
    loadArrivalTree(activeBatchForArrival.id);
  }

  async function addShipment(orderNumberId: string) {
    if (!activeBatchForArrival) return;
    try {
      await callJson(`/api/admin/order-numbers/${orderNumberId}`, "POST", { trackingNumber: newTrackingByOrderNumber[orderNumberId] || "" });
      setNewTrackingByOrderNumber((prev) => ({ ...prev, [orderNumberId]: "" }));
      loadArrivalTree(activeBatchForArrival.id);
    } catch (e: any) {
      setArrivalMsg(e.message || "新增失敗");
    }
  }

  async function deleteShipment(shipmentId: string) {
    if (!activeBatchForArrival) return;
    if (!confirm("確定要刪除這個物流單號嗎？")) return;
    await callJson(`/api/admin/shipments/${shipmentId}`, "DELETE", {});
    loadArrivalTree(activeBatchForArrival.id);
  }

  async function assignPoolItemToShipment(poolItem: any) {
    if (!activeBatchForArrival) return;
    const key = `${poolItem.type}-${poolItem.id}`;
    const shipmentId = assignShipTargetByPoolItem[key];
    const qty = Number(assignShipQtyByPoolItem[key]);
    if (!shipmentId) return setArrivalMsg("請選擇要分配進哪個物流單號");
    if (!isFinite(qty) || qty <= 0) return setArrivalMsg("請輸入數量");
    try {
      await callJson(`/api/admin/shipments/${shipmentId}/items`, "POST", { type: poolItem.type, id: poolItem.id, qty });
      setAssignShipQtyByPoolItem((prev) => ({ ...prev, [key]: "" }));
      loadArrivalTree(activeBatchForArrival.id);
    } catch (e: any) {
      setArrivalMsg(e.message || "分配失敗");
    }
  }

  async function toggleArrived(itemId: string, arrived: boolean) {
    if (!activeBatchForArrival) return;
    await callJson(`/api/admin/shipment-items/${itemId}`, "PATCH", { arrived });
    loadArrivalTree(activeBatchForArrival.id);
  }

  async function removeShipmentItem(itemId: string) {
    if (!activeBatchForArrival) return;
    await callJson(`/api/admin/shipment-items/${itemId}`, "DELETE", {});
    loadArrivalTree(activeBatchForArrival.id);
  }

  async function openPurchaseBatches(c: any) {
    setActiveCampaignForBatches(c);
    setBatchesTab("batches");
    setBatchesMsg("");
    await loadPurchaseBatchesData(c.id);
    // 這頁也需要平台清單（換平台、新增採購單用）跟滿贈款式清單（配置滿贈用）
    await loadVendorRules(c.id);
  }

  async function loadPurchaseBatchesData(campaignId: string) {
    const [r1, r2, r3, r4] = await Promise.all([
      fetch(`/api/admin/campaigns/${campaignId}/unassigned-items`),
      fetch(`/api/admin/campaigns/${campaignId}/purchase-batches`),
      fetch(`/api/admin/campaigns/${campaignId}/gift-gap-overview`),
      fetch(`/api/admin/campaigns/${campaignId}/extra-purchases`),
    ]);
    const [d1, d2, d3, d4] = await Promise.all([r1.json(), r2.json(), r3.json(), r4.json()]);
    setUnassignedPool(d1.pool || []);
    setPurchaseBatches(d2.batches || []);
    setBatchGiftGap(d3.overview || []);
    setExtraPurchases(d4.extraPurchases || []);
  }

  async function createPurchaseBatch() {
    if (!activeCampaignForBatches) return;
    setBatchesMsg("");
    try {
      await callJson(`/api/admin/campaigns/${activeCampaignForBatches.id}/purchase-batches`, "POST", { platformId: newBatchPlatformId || null });
      setNewBatchPlatformId("");
      loadPurchaseBatchesData(activeCampaignForBatches.id);
    } catch (e: any) {
      setBatchesMsg(e.message || "建立失敗");
    }
  }

  async function assignItemToBatch(orderItemId: string) {
    if (!activeCampaignForBatches) return;
    const batchId = assignTargetBatchByItem[orderItemId];
    const qty = Number(assignQtyByItem[orderItemId]);
    if (!batchId) return setBatchesMsg("請先選擇要分配進哪張採購單");
    if (!isFinite(qty) || qty <= 0) return setBatchesMsg("請輸入要分配的數量");
    try {
      await callJson(`/api/admin/campaigns/${activeCampaignForBatches.id}/purchase-batches/${batchId}/items`, "POST", { orderItemId, qty });
      setAssignQtyByItem((prev) => ({ ...prev, [orderItemId]: "" }));
      loadPurchaseBatchesData(activeCampaignForBatches.id);
    } catch (e: any) {
      setBatchesMsg(e.message || "分配失敗");
    }
  }

  async function removeBatchItem(batchId: string, batchItemId: string) {
    if (!activeCampaignForBatches) return;
    await callJson(`/api/admin/campaigns/${activeCampaignForBatches.id}/purchase-batches/${batchId}/items`, "DELETE", { batchItemId });
    loadPurchaseBatchesData(activeCampaignForBatches.id);
  }

  async function changeBatchPlatform(batchId: string, platformId: string) {
    if (!activeCampaignForBatches) return;
    await callJson(`/api/admin/campaigns/${activeCampaignForBatches.id}/purchase-batches/${batchId}`, "PATCH", { platformId: platformId || null });
    loadPurchaseBatchesData(activeCampaignForBatches.id);
  }

  async function deleteBatch(batchId: string) {
    if (!activeCampaignForBatches) return;
    if (!confirm("確定要刪除這張採購單嗎？裡面的品項會回到未分配池。")) return;
    await callJson(`/api/admin/campaigns/${activeCampaignForBatches.id}/purchase-batches/${batchId}`, "DELETE", {});
    loadPurchaseBatchesData(activeCampaignForBatches.id);
  }

  async function setBatchGift(batchId: string) {
    if (!activeCampaignForBatches) return;
    const giftStyleId = giftPickByBatch[batchId];
    const qty = Number(giftQtyByBatch[batchId]);
    if (!giftStyleId) return setBatchesMsg("請選擇滿贈款式");
    if (!isFinite(qty) || qty < 0) return setBatchesMsg("數量格式不正確");
    try {
      await callJson(`/api/admin/campaigns/${activeCampaignForBatches.id}/purchase-batches/${batchId}/gifts`, "PUT", { giftStyleId, qty });
      setBatchesMsg("");
      setGiftPickByBatch((prev) => ({ ...prev, [batchId]: "" }));
      setGiftQtyByBatch((prev) => ({ ...prev, [batchId]: "" }));
      loadPurchaseBatchesData(activeCampaignForBatches.id);
    } catch (e: any) {
      setBatchesMsg(e.message || "設定失敗");
    }
  }

  function editBatchGift(batchId: string, giftStyleId: string, qty: number) {
    setGiftPickByBatch((prev) => ({ ...prev, [batchId]: giftStyleId }));
    setGiftQtyByBatch((prev) => ({ ...prev, [batchId]: String(qty) }));
  }

  async function removeBatchGift(batchId: string, giftStyleId: string) {
    if (!activeCampaignForBatches) return;
    try {
      await callJson(`/api/admin/campaigns/${activeCampaignForBatches.id}/purchase-batches/${batchId}/gifts`, "PUT", { giftStyleId, qty: 0 });
      loadPurchaseBatchesData(activeCampaignForBatches.id);
    } catch (e: any) {
      setBatchesMsg(e.message || "刪除失敗");
    }
  }

  async function addExtraPurchase() {
    if (!activeCampaignForBatches) return;
    setBatchesMsg("");
    if (!extraGiftStyleId) return setBatchesMsg("請選擇滿贈款式");
    const qty = Number(extraQty);
    if (!isFinite(qty) || qty <= 0) return setBatchesMsg("數量格式不正確");
    try {
      await callJson(`/api/admin/campaigns/${activeCampaignForBatches.id}/extra-purchases`, "POST", { giftStyleId: extraGiftStyleId, qty, note: extraNote });
      setExtraGiftStyleId(""); setExtraQty(""); setExtraNote("");
      loadPurchaseBatchesData(activeCampaignForBatches.id);
    } catch (e: any) {
      setBatchesMsg(e.message || "新增失敗");
    }
  }

  async function deleteExtraPurchase(id: string) {
    if (!activeCampaignForBatches) return;
    await callJson(`/api/admin/campaigns/${activeCampaignForBatches.id}/extra-purchases/${id}`, "DELETE", {});
    loadPurchaseBatchesData(activeCampaignForBatches.id);
  }
  const [vendorRulesTab, setVendorRulesTab] = useState<"discount" | "platforms">("discount");
  const [discountTiers, setDiscountTiers] = useState<any[]>([]);
  const [campaignGiftStyles, setCampaignGiftStyles] = useState<any[]>([]); // 這個檔期已登記的滿贈款式（來自2.7節），平台每款上限直接對應這份清單
  const [vendorPlatforms, setVendorPlatforms] = useState<any[]>([]);
  const [tierThreshold, setTierThreshold] = useState("");
  const [tierDiscount, setTierDiscount] = useState("");
  const [vendorRulesMsg, setVendorRulesMsg] = useState("");
  const [newPlatformName, setNewPlatformName] = useState("");
  const [newPlatformCap, setNewPlatformCap] = useState("");
  const [editingPlatformCaps, setEditingPlatformCaps] = useState<Record<string, Record<string, string>>>({});
  const [draggedPlatformId, setDraggedPlatformId] = useState<string | null>(null);

  async function openVendorRules(c: any) {
    setActiveCampaignForVendorRules(c);
    setVendorRulesTab("discount");
    setVendorRulesMsg("");
    setTierThreshold(""); setTierDiscount("");
    await loadVendorRules(c.id);
  }

  async function loadVendorRules(campaignId: string) {
    const r1 = await fetch(`/api/admin/campaigns/${campaignId}/discount-tiers`);
    const d1 = await r1.json();
    setDiscountTiers(d1.discountTiers || []);

    const r3 = await fetch(`/api/admin/campaigns/${campaignId}/gift-styles`);
    const d3 = await r3.json();
    setCampaignGiftStyles(d3.giftStyles || []);

    const r2 = await fetch(`/api/admin/campaigns/${campaignId}/vendor-platforms`);
    const d2 = await r2.json();
    setVendorPlatforms(d2.platforms || []);
    const caps: Record<string, Record<string, string>> = {};
    (d2.platforms || []).forEach((p: any) => {
      caps[p.id] = {};
      Object.entries(p.styleCaps || {}).forEach(([styleId, v]) => { caps[p.id][styleId] = String(v); });
    });
    setEditingPlatformCaps(caps);
  }

  async function addDiscountTier() {
    if (!activeCampaignForVendorRules) return;
    setVendorRulesMsg("");
    const threshold = Number(tierThreshold);
    const discount = Number(tierDiscount);
    if (!isFinite(threshold) || threshold <= 0) return setVendorRulesMsg("門檻金額格式不正確");
    if (!isFinite(discount) || discount < 0) return setVendorRulesMsg("折扣金額格式不正確");
    try {
      await callJson(`/api/admin/campaigns/${activeCampaignForVendorRules.id}/discount-tiers`, "POST", { thresholdAmount: threshold, discountAmount: discount });
      setTierThreshold(""); setTierDiscount("");
      loadVendorRules(activeCampaignForVendorRules.id);
    } catch (e: any) {
      setVendorRulesMsg(e.message || "新增失敗");
    }
  }

  async function deleteDiscountTier(tierId: string) {
    if (!activeCampaignForVendorRules) return;
    if (!confirm("確定要刪除這個門檻嗎？")) return;
    await callJson(`/api/admin/campaigns/${activeCampaignForVendorRules.id}/discount-tiers/${tierId}`, "DELETE", {});
    loadVendorRules(activeCampaignForVendorRules.id);
  }

  async function addVendorPlatform() {
    if (!activeCampaignForVendorRules) return;
    setVendorRulesMsg("");
    if (!newPlatformName.trim()) return setVendorRulesMsg("請輸入平台名稱");
    try {
      await callJson(`/api/admin/campaigns/${activeCampaignForVendorRules.id}/vendor-platforms`, "POST", {
        name: newPlatformName, orderGiftCap: newPlatformCap || 0,
      });
      setNewPlatformName(""); setNewPlatformCap("");
      loadVendorRules(activeCampaignForVendorRules.id);
    } catch (e: any) {
      setVendorRulesMsg(e.message || "新增失敗");
    }
  }

  async function savePlatformCaps(platformId: string) {
    if (!activeCampaignForVendorRules) return;
    try {
      await callJson(`/api/admin/campaigns/${activeCampaignForVendorRules.id}/vendor-platforms/${platformId}`, "PATCH", {
        styleCaps: editingPlatformCaps[platformId] || {},
      });
      setVendorRulesMsg("已儲存");
      loadVendorRules(activeCampaignForVendorRules.id);
    } catch (e: any) {
      setVendorRulesMsg(e.message || "儲存失敗");
    }
  }

  function handlePlatformDrop(targetId: string) {
    if (!draggedPlatformId || draggedPlatformId === targetId || !activeCampaignForVendorRules) return;
    setVendorPlatforms((prev) => {
      const next = [...prev];
      const fromIdx = next.findIndex((p) => p.id === draggedPlatformId);
      const toIdx = next.findIndex((p) => p.id === targetId);
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      const ids = next.map((p) => p.id);
      callJson(`/api/admin/campaigns/${activeCampaignForVendorRules.id}/vendor-platforms/reorder`, "POST", { ids }).catch((e: any) => {
        setVendorRulesMsg("排序儲存失敗：" + e.message);
      });
      return next;
    });
    setDraggedPlatformId(null);
  }

  async function deleteVendorPlatform(platformId: string) {
    if (!activeCampaignForVendorRules) return;
    if (!confirm("確定要刪除這個平台嗎？")) return;
    await callJson(`/api/admin/campaigns/${activeCampaignForVendorRules.id}/vendor-platforms/${platformId}`, "DELETE", {});
    loadVendorRules(activeCampaignForVendorRules.id);
  }
  const [giftStyles, setGiftStyles] = useState<any[]>([]);
  const [giftStyleName, setGiftStyleName] = useState("");
  const [giftStyleThreshold, setGiftStyleThreshold] = useState("");
  const [giftStyleImageUrl, setGiftStyleImageUrl] = useState("");
  const [giftStyleImageUrlInput, setGiftStyleImageUrlInput] = useState("");
  const [uploadingGiftStyleImg, setUploadingGiftStyleImg] = useState(false);
  const [editingGiftStyleId, setEditingGiftStyleId] = useState<string | null>(null);
  const [giftStyleMsg, setGiftStyleMsg] = useState("");

  const TXN_COMBOS: { key: string; label: string }[] = [
    { key: "txn_bank_discount_gift", label: "匯款・有滿減・有滿贈" },
    { key: "txn_bank_discount_nogift", label: "匯款・有滿減・無滿贈" },
    { key: "txn_bank_nodiscount_gift", label: "匯款・無滿減・有滿贈" },
    { key: "txn_bank_nodiscount_nogift", label: "匯款・無滿減・無滿贈" },
    { key: "txn_cod_discount_gift", label: "取付・有滿減・有滿贈" },
    { key: "txn_cod_discount_nogift", label: "取付・有滿減・無滿贈" },
    { key: "txn_cod_nodiscount_gift", label: "取付・無滿減・有滿贈" },
    { key: "txn_cod_nodiscount_nogift", label: "取付・無滿減・無滿贈" },
  ];

  /** 把資料庫存的 UTC 時間，轉成台灣時間格式的 datetime-local 字串（給表單顯示用） */
  function toTaipeiDatetimeLocal(iso: string): string {
    const d = new Date(iso);
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value || "00";
    return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
  }

  /** 把表單填的 datetime-local 字串，當成台灣時間解讀，轉成正確的 UTC ISO 字串存進資料庫
   *  （不管管理者的瀏覽器本身設定在哪個時區，都固定用台灣時間解讀，避免跳時區） */
  function fromTaipeiDatetimeLocal(value: string): string {
    return new Date(`${value}:00+08:00`).toISOString();
  }

  async function loadCampaigns() {
    const r = await fetch("/api/admin/campaigns");
    if (r.status === 401) { setUnlocked(false); setLoginMsg("登入已過期，請重新登入"); return; }
    const d = await r.json();
    setCampaigns(d.campaigns || []);
  }

  function editCampaign(c: any) {
    const rates: any = {};
    for (const combo of TXN_COMBOS) {
      rates[`${combo.key}_enabled`] = c[`${combo.key}_enabled`] ?? true;
      rates[`${combo.key}_rate`] = c[`${combo.key}_rate`] != null ? String(c[`${combo.key}_rate`]) : "";
    }
    setCampaignForm({
      id: c.id, name: c.name,
      opensAt: toTaipeiDatetimeLocal(c.opens_at), closesAt: toTaipeiDatetimeLocal(c.closes_at),
      codCampaignCap: c.cod_campaign_cap != null ? String(c.cod_campaign_cap) : "",
      giftCodCampaignCap: c.gift_cod_campaign_cap != null ? String(c.gift_cod_campaign_cap) : "",
      giftBaseUnit: String(c.gift_base_unit ?? 100),
      vendorOrderGiftCap: c.vendor_order_gift_cap != null ? String(c.vendor_order_gift_cap) : "",
      rates,
    });
    setCampaignMsg("");
  }

  async function saveCampaign() {
    setCampaignMsg("");
    if (!campaignForm.name.trim()) return setCampaignMsg("請填寫檔期名稱");
    if (!campaignForm.opensAt || !campaignForm.closesAt) return setCampaignMsg("請設定開放起訖時間");

    const rateFields: Record<string, any> = {};
    for (const combo of TXN_COMBOS) {
      rateFields[`${combo.key}_enabled`] = (campaignForm.rates as any)[`${combo.key}_enabled`];
      const rateVal = (campaignForm.rates as any)[`${combo.key}_rate`];
      rateFields[`${combo.key}_rate`] = rateVal === "" ? null : Number(rateVal);
    }

    try {
      if (campaignForm.id) {
        await callJson(`/api/admin/campaigns/${campaignForm.id}`, "PATCH", {
          name: campaignForm.name,
          opens_at: fromTaipeiDatetimeLocal(campaignForm.opensAt),
          closes_at: fromTaipeiDatetimeLocal(campaignForm.closesAt),
          cod_campaign_cap: campaignForm.codCampaignCap === "" ? null : Number(campaignForm.codCampaignCap),
          gift_cod_campaign_cap: campaignForm.giftCodCampaignCap === "" ? null : Number(campaignForm.giftCodCampaignCap),
          gift_base_unit: Number(campaignForm.giftBaseUnit) || 100,
          vendor_order_gift_cap: campaignForm.vendorOrderGiftCap === "" ? null : Number(campaignForm.vendorOrderGiftCap),
          ...rateFields,
        });
      } else {
        await callJson("/api/admin/campaigns", "POST", {
          name: campaignForm.name,
          opensAt: fromTaipeiDatetimeLocal(campaignForm.opensAt),
          closesAt: fromTaipeiDatetimeLocal(campaignForm.closesAt),
          codCampaignCap: campaignForm.codCampaignCap === "" ? null : Number(campaignForm.codCampaignCap),
          giftCodCampaignCap: campaignForm.giftCodCampaignCap === "" ? null : Number(campaignForm.giftCodCampaignCap),
          giftBaseUnit: Number(campaignForm.giftBaseUnit) || 100,
          vendorOrderGiftCap: campaignForm.vendorOrderGiftCap === "" ? null : Number(campaignForm.vendorOrderGiftCap),
          rates: rateFields,
        });
      }
      setCampaignForm(emptyCampaignForm);
      loadCampaigns();
    } catch (e: any) {
      setCampaignMsg(e.message || "儲存失敗");
    }
  }

  async function deleteCampaign(id: string) {
    if (!confirm("確定要刪除這個檔期嗎？")) return;
    await callJson(`/api/admin/campaigns/${id}`, "DELETE", {});
    loadCampaigns();
  }

  async function openGiftStyles(c: any) {
    setActiveCampaignForGifts(c);
    resetGiftStyleForm();
    const r = await fetch(`/api/admin/campaigns/${c.id}/gift-styles`);
    if (r.status === 401) { setUnlocked(false); setLoginMsg("登入已過期，請重新登入"); return; }
    const d = await r.json();
    setGiftStyles(d.giftStyles || []);
  }

  function resetGiftStyleForm() {
    setGiftStyleName(""); setGiftStyleThreshold(""); setGiftStyleImageUrl(""); setGiftStyleImageUrlInput(""); setEditingGiftStyleId(null);
  }

  function editGiftStyle(s: any) {
    setEditingGiftStyleId(s.id);
    setGiftStyleName(s.style_name);
    setGiftStyleThreshold(String(s.threshold_amount));
    setGiftStyleImageUrl(s.image_url || "");
    setGiftStyleImageUrlInput("");
    setGiftStyleMsg("");
  }

  async function handleGiftStyleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingGiftStyleImg(true);
    try {
      const url = await uploadImage(file);
      setGiftStyleImageUrl(url);
    } catch (err: any) {
      setGiftStyleMsg("圖片上傳失敗：" + err.message);
    } finally {
      setUploadingGiftStyleImg(false);
    }
  }

  function applyGiftStyleImageUrl() {
    const v = giftStyleImageUrlInput.trim();
    if (!v) return;
    setGiftStyleImageUrl(toDirectImageUrl(v));
    setGiftStyleImageUrlInput("");
  }

  async function autoCreateGiftSeries() {
    if (!planForm.categoryId) return setAutoCreateGiftMsg("請先選擇分類");
    if (!giftSeriesCampaignId) return setAutoCreateGiftMsg("請選擇檔期");
    setAutoCreateGiftMsg("");
    setAutoCreatingGiftSeries(true);
    try {
      const d = await callJson("/api/admin/series/auto-create-gift", "POST", {
        categoryId: planForm.categoryId,
        campaignId: giftSeriesCampaignId,
      });
      setAutoCreateGiftMsg(`已建立系列「${d.series.name}」，共 ${d.productCount} 個商品，記得回商品管理填上金額`);
      setGiftSeriesCampaignId("");
      loadPlans();
    } catch (e: any) {
      setAutoCreateGiftMsg(e.message || "建立失敗");
    } finally {
      setAutoCreatingGiftSeries(false);
    }
  }

  async function saveGiftStyle() {
    if (!activeCampaignForGifts) return;
    setGiftStyleMsg("");
    if (!giftStyleName.trim()) return setGiftStyleMsg("請輸入款式名稱");
    const threshold = Number(giftStyleThreshold);
    if (!isFinite(threshold) || threshold <= 0) return setGiftStyleMsg("門檻金額格式不正確");
    try {
      if (editingGiftStyleId) {
        await callJson(`/api/admin/campaigns/${activeCampaignForGifts.id}/gift-styles/${editingGiftStyleId}`, "PATCH", {
          styleName: giftStyleName, thresholdAmount: threshold, imageUrl: giftStyleImageUrl || null,
        });
      } else {
        await callJson(`/api/admin/campaigns/${activeCampaignForGifts.id}/gift-styles`, "POST", {
          styleName: giftStyleName, thresholdAmount: threshold, imageUrl: giftStyleImageUrl || null,
        });
      }
      resetGiftStyleForm();
      openGiftStyles(activeCampaignForGifts);
    } catch (e: any) {
      setGiftStyleMsg(e.message || "儲存失敗");
    }
  }

  async function deleteGiftStyle(styleId: string) {
    if (!activeCampaignForGifts) return;
    if (!confirm("確定要刪除這個款式嗎？")) return;
    await callJson(`/api/admin/campaigns/${activeCampaignForGifts.id}/gift-styles/${styleId}`, "DELETE", {});
    openGiftStyles(activeCampaignForGifts);
  }

  const [uploadingPlanImg, setUploadingPlanImg] = useState(false);
  const [uploadingPromoImg, setUploadingPromoImg] = useState(false);

  // ---- 商品 ----
  const [activePlanForProducts, setActivePlanForProducts] = useState<SeriesAdmin | null>(null);
  const [products, setProducts] = useState<ProductAdmin[]>([]);
  const [allProductsForCopy, setAllProductsForCopy] = useState<ProductAdmin[]>([]); // item 8：複製款式改成跨系列，這裡放全部系列的商品

  // ---- 商品批次匯入 ----
  const [importSeriesId, setImportSeriesId] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ total: number; success: number; failed: string[] } | null>(null);
  const [importMsg, setImportMsg] = useState("");

  async function runProductImport() {
    setImportMsg("");
    setImportResult(null);
    if (!importSeriesId) return setImportMsg("請選擇要匯入到哪個系列");
    if (!importFile) return setImportMsg("請選擇要上傳的檔案");
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", importFile);
      fd.append("seriesId", importSeriesId);
      const r = await fetch("/api/admin/products/import", { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) {
        setImportMsg(d.error || "匯入失敗");
      } else {
        setImportResult(d);
      }
    } catch (e: any) {
      setImportMsg(e.message || "匯入失敗");
    } finally {
      setImporting(false);
    }
  }
  const [productForm, setProductForm] = useState(emptyProductForm);
  const [productRows, setProductRows] = useState<{ style: string; price: string; imageUrl: string; hasDiscountFlag: boolean; codAllowed: boolean; shippingFee: string }[]>([{ style: "", price: "0", imageUrl: "", hasDiscountFlag: true, codAllowed: true, shippingFee: "0" }]);
  const [uploadingRowImg, setUploadingRowImg] = useState<number | null>(null);
  const [productRowImageUrlInputs, setProductRowImageUrlInputs] = useState<Record<number, string>>({});
  const [draggedProductId, setDraggedProductId] = useState<string | null>(null);
  const [draggedCategoryId, setDraggedCategoryId] = useState<string | null>(null);
  const [draggedPlanId, setDraggedPlanId] = useState<string | null>(null);
  const [productMsg, setProductMsg] = useState("");
  const [uploadingProductImg, setUploadingProductImg] = useState(false);

  // ---- 其他既有工具 ----
  const [resetUsername, setResetUsername] = useState("");
  const [resetMsg, setResetMsg] = useState("");
  const [profileRequests, setProfileRequests] = useState<any[]>([]);
  const [profileRequestsMsg, setProfileRequestsMsg] = useState("");
  const [memberLookupUsername, setMemberLookupUsername] = useState("");
  const [memberLookupResult, setMemberLookupResult] = useState<any>(null);
  const [memberLookupMsg, setMemberLookupMsg] = useState("");
  const [memberNewProfileUrl, setMemberNewProfileUrl] = useState("");
  const [orderLookupNo, setOrderLookupNo] = useState("");
  const [orderLookupResult, setOrderLookupResult] = useState<any>(null);
  const [orderPaidAmountInput, setOrderPaidAmountInput] = useState("");
  const [savingPaidAmount, setSavingPaidAmount] = useState(false);
  const [orderLookupMsg, setOrderLookupMsg] = useState("");
  const [orderPlanProducts, setOrderPlanProducts] = useState<ProductAdmin[]>([]);
  const [editingOrderItems, setEditingOrderItems] = useState(false);
  const [editItemRows, setEditItemRows] = useState<{ name: string; style: string; qty: string }[]>([]);
  const [savingOrderItems, setSavingOrderItems] = useState(false);
  const [cancelRequests, setCancelRequests] = useState<any[]>([]);

  // 舊會員確認
  const [legacyIdentities, setLegacyIdentities] = useState<any[]>([]);
  const [legacyIdentitySearch, setLegacyIdentitySearch] = useState("");
  const [legacyIdentitiesMsg, setLegacyIdentitiesMsg] = useState("");
  const [legacyRequests, setLegacyRequests] = useState<any[]>([]);
  const [legacyRequestsMsg, setLegacyRequestsMsg] = useState("");
  const [legacyUnmatchedOrders, setLegacyUnmatchedOrders] = useState<any[]>([]);
  const [legacyUnmatchedMsg, setLegacyUnmatchedMsg] = useState("");
  const [duplicateGroups, setDuplicateGroups] = useState<any[]>([]);
  const [duplicateScanMsg, setDuplicateScanMsg] = useState("");
  const [duplicateScanning, setDuplicateScanning] = useState(false);
  const [duplicateSelected, setDuplicateSelected] = useState<Record<string, boolean>>({});
  const [duplicateDeleting, setDuplicateDeleting] = useState(false);
  const [legacyReassignTarget, setLegacyReassignTarget] = useState<Record<string, string>>({});

  // 公告管理
  const [announcementsList, setAnnouncementsList] = useState<any[]>([]);
  const [newAnnouncementContent, setNewAnnouncementContent] = useState("");
  const [announcementMsg, setAnnouncementMsg] = useState("");
  const [announcementPosting, setAnnouncementPosting] = useState(false);
  const [checkoutNoticeInput, setCheckoutNoticeInput] = useState("");
  const [checkoutNoticeMsg, setCheckoutNoticeMsg] = useState("");
  const [checkoutNoticeSaving, setCheckoutNoticeSaving] = useState(false);

  // 舊會員確認分頁：卡片收合狀態（預設全部收合，資料太長很難找其他分頁）
  const [collapsedCards, setCollapsedCards] = useState<Record<string, boolean>>({
    importIdentities: true,
    importManual: true,
    importSheet: true,
    pendingRequests: true,
    identitySearch: true,
    unmatchedOrders: true,
    duplicateOrders: true,
  });
  function toggleCard(key: string) {
    setCollapsedCards((prev) => ({ ...prev, [key]: !prev[key] }));
  }
  function renderCardHeader(cardKey: string, title: string) {
    return (
      <h3
        onClick={() => toggleCard(cardKey)}
        style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", userSelect: "none" }}
      >
        {title}
        <span style={{ fontSize: 13, color: "#8A8779" }}>{collapsedCards[cardKey] ? "▸ 展開" : "▾ 收合"}</span>
      </h3>
    );
  }

  // 危險區域：清空所有資料
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [resetConfirmChecked, setResetConfirmChecked] = useState(false);
  const [resetRunning, setResetRunning] = useState(false);
  const [resetResult, setResetResult] = useState<any>(null);

  // 舊會員確認：資料匯入
  const [identitiesFile, setIdentitiesFile] = useState<File | null>(null);
  const [identitiesImporting, setIdentitiesImporting] = useState(false);
  const [identitiesResult, setIdentitiesResult] = useState<any>(null);

  const [manualOrdersFile, setManualOrdersFile] = useState<File | null>(null);
  const [manualOrdersImporting, setManualOrdersImporting] = useState(false);
  const [manualOrdersResult, setManualOrdersResult] = useState<any>(null);

  const [legacySheetId, setLegacySheetId] = useState("");
  const [legacySheetTabs, setLegacySheetTabs] = useState<string[]>([]);
  const [legacySheetTabsMsg, setLegacySheetTabsMsg] = useState("");
  const [legacySheetTabsLoading, setLegacySheetTabsLoading] = useState(false);
  const [legacyTabResults, setLegacyTabResults] = useState<Record<string, any>>({});
  const [legacyTabImporting, setLegacyTabImporting] = useState<Record<string, boolean>>({});
  const [staffAdmins, setStaffAdmins] = useState<any[]>([]);
  const [staffAdminsMsg, setStaffAdminsMsg] = useState("");
  const [syncingSheets, setSyncingSheets] = useState(false);
  const [syncSheetsMsg, setSyncSheetsMsg] = useState("");
  const [cancelRequestsMsg, setCancelRequestsMsg] = useState("");
  const [inviteCodes, setInviteCodes] = useState<any[]>([]);
  const [inviteCodesMsg, setInviteCodesMsg] = useState("");
  const [generatingCode, setGeneratingCode] = useState(false);

  useEffect(() => {
    fetch("/api/admin/session")
      .then((r) => r.json())
      .then((d) => {
        if (d.loggedIn) {
          setUnlocked(true);
          setCurrentUsername(d.username);
          setCurrentRole(d.role);
          setCurrentEmail(d.email || "");
          setCurrentEmailVerified(d.emailVerified || false);
        }
        setCheckingSession(false);
      })
      .catch(() => setCheckingSession(false));

    const params = new URLSearchParams(window.location.search);
    const verify = params.get("verify");
    if (verify === "success") setVerifyMsg("信箱驗證成功！");
    else if (verify === "invalid") setVerifyMsg("驗證連結無效或已過期。");
    if (verify) window.history.replaceState({}, "", window.location.pathname);
  }, []);

  useEffect(() => {
    if (unlocked) {
      loadCategories();
      loadPlans();
      if (currentRole === "owner") {
        loadProfileRequests();
        loadInviteCodes();
        loadCancelRequests();
        loadStaffAdmins();
        loadLegacyIdentities();
        loadLegacyRequests();
        loadLegacyUnmatchedOrders();
        loadAnnouncements();
        loadCheckoutNotice();
      }
    }
  }, [unlocked, currentRole]);

  // 切到「系列管理」分頁時重新抓一次最新清單（避免同一個登入階段裡，用其他功能新增的系列不會自動出現）
  useEffect(() => {
    if (unlocked && activeSection === "series") {
      loadPlans();
      loadCampaigns(); // 滿贈分類的「選擇檔期」下拉選單需要用到
    }
  }, [unlocked, activeSection]);

  useEffect(() => {
    if (unlocked && activeSection === "campaigns") {
      loadCampaigns();
    }
  }, [unlocked, activeSection]);

  useEffect(() => {
    if (unlocked && activeSection === "productImport") {
      loadPlans();
    }
  }, [unlocked, activeSection]);

  async function doLogin() {
    setLoginMsg("");
    if (!username.trim() || !password) return setLoginMsg("請輸入帳號密碼");
    setLoggingIn(true);
    try {
      const r = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const d = await r.json();
      if (!r.ok) return setLoginMsg(d.error || "登入失敗");
      setCurrentUsername(d.username);
      setCurrentRole(d.role);
      setCurrentEmail(d.email || "");
      setCurrentEmailVerified(d.emailVerified || false);
      setUnlocked(true);
      setPassword("");
    } catch {
      setLoginMsg("網路連線失敗，請再試一次");
    } finally {
      setLoggingIn(false);
    }
  }

  async function doLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    setUnlocked(false);
    setCurrentRole("");
    setCurrentUsername("");
    setUsername("");
  }

  async function saveAdminEmail() {
    setAdminEmailMsg("");
    if (!adminEmailPw) return setAdminEmailMsg("請輸入目前的密碼");
    if (!newAdminEmail.trim()) return setAdminEmailMsg("請輸入 Email");
    setSavingAdminEmail(true);
    try {
      const d = await callJson("/api/admin/account", "POST", { password: adminEmailPw, newEmail: newAdminEmail.trim() });
      setCurrentEmail(d.email);
      setCurrentEmailVerified(d.emailVerified);
      setAdminEmailPw("");
      setAdminEmailMsg(d.verifyEmailSent ? "已更新，驗證信已寄出，請去收信點連結驗證（記得也檢查一下垃圾郵件匣）。" : "已更新。");
    } catch (e: any) {
      setAdminEmailMsg("失敗：" + e.message);
    } finally {
      setSavingAdminEmail(false);
    }
  }

  async function resendAdminVerification() {
    setAdminEmailMsg("");
    if (!adminEmailPw) return setAdminEmailMsg("請先在下面輸入目前的密碼，再點這個按鈕");
    setSavingAdminEmail(true);
    try {
      const d = await callJson("/api/admin/account", "POST", { password: adminEmailPw, newEmail: currentEmail });
      setCurrentEmailVerified(d.emailVerified);
      setAdminEmailPw("");
      setAdminEmailMsg(d.verifyEmailSent ? "驗證信已重新寄出，請去收信點連結驗證（記得也檢查一下垃圾郵件匣）。" : "這個信箱已經驗證過了。");
    } catch (e: any) {
      setAdminEmailMsg("失敗：" + e.message);
    } finally {
      setSavingAdminEmail(false);
    }
  }

  async function changeAdminPassword() {
    setAdminPwMsg("");
    if (!adminCurrentPw) return setAdminPwMsg("請輸入目前的密碼");
    if (adminNewPw.length < 8) return setAdminPwMsg("新密碼至少要 8 個字");
    if (adminNewPw !== adminConfirmPw) return setAdminPwMsg("兩次輸入的新密碼不一樣");
    setSavingAdminPw(true);
    try {
      await callJson("/api/admin/change-password", "POST", { password: adminCurrentPw, newPassword: adminNewPw });
      setAdminPwMsg("密碼已更新。");
      setAdminCurrentPw("");
      setAdminNewPw("");
      setAdminConfirmPw("");
    } catch (e: any) {
      setAdminPwMsg("失敗：" + e.message);
    } finally {
      setSavingAdminPw(false);
    }
  }

  async function callJson(url: string, method: string, body: any) {
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json();
    if (r.status === 401) {
      setUnlocked(false);
      setLoginMsg("登入已過期，請重新登入");
    }
    if (!r.ok) throw new Error(d.error || "失敗");
    return d;
  }

  async function uploadImage(file: File): Promise<string> {
    if (file.size > 4 * 1024 * 1024) {
      throw new Error("圖片大小請控制在 4MB 以內，太大的圖片建議先壓縮再上傳");
    }
    const form = new FormData();
    form.append("file", file);
    const r = await fetch("/api/admin/upload", { method: "POST", body: form });

    let d: any;
    try {
      d = await r.json();
    } catch {
      // 伺服器回傳的不是 JSON（例如平台層級擋掉過大請求），視情況給友善訊息
      throw new Error(r.status === 413 ? "圖片檔案太大，請壓縮後再上傳" : "上傳失敗，請再試一次");
    }

    if (r.status === 401) {
      setUnlocked(false);
      setLoginMsg("登入已過期，請重新登入");
    }
    if (!r.ok) throw new Error(d.error || "上傳失敗");
    return d.url;
  }

  // ================= 分類 =================
  async function loadCategories() {
    const r = await fetch("/api/categories", { cache: "no-store" });
    const d = await r.json();
    setCategories((d.categories || []).map((c: any) => ({ id: c.id, name: c.name, parent_id: c.parentId, created_at: c.createdAt, sort_order: c.sortOrder, isGiftCategory: !!c.isGiftCategory })));
  }

  function editCategory(c: Category) {
    setCategoryForm({ id: c.id, name: c.name, parentId: c.parent_id || "", isGiftCategory: !!c.isGiftCategory });
    categoryFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function saveCategory() {
    if (!categoryForm.name.trim()) return setCategoryMsg("請填寫分類名稱");
    setCategoryMsg("處理中…");
    try {
      if (categoryForm.id) {
        await callJson("/api/admin/categories", "PUT", { id: categoryForm.id, name: categoryForm.name, parentId: categoryForm.parentId || null, isGiftCategory: categoryForm.isGiftCategory });
      } else {
        await callJson("/api/admin/categories", "POST", { name: categoryForm.name, parentId: categoryForm.parentId || null, isGiftCategory: categoryForm.isGiftCategory });
      }
      setCategoryForm(emptyCategoryForm);
      setCategoryMsg("已儲存");
      loadCategories();
    } catch (e: any) {
      setCategoryMsg("失敗：" + e.message);
    }
  }

  async function deleteCategory(id: string) {
    if (!confirm("確定要刪除這個分類嗎？（子分類會一起被刪除，底下系列不會被刪除，只是會變成未分類）")) return;
    try {
      await callJson("/api/admin/categories", "DELETE", { id });
      loadCategories();
    } catch (e: any) {
      setCategoryMsg("失敗：" + e.message);
    }
  }

  function byOrder(a: Category, b: Category) {
    const so = (a.sort_order ?? 0) - (b.sort_order ?? 0);
    if (so !== 0) return so;
    return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
  }
  const topCategories = categories.filter((c) => !c.parent_id).sort(byOrder);
  function childrenOf(id: string) {
    return categories.filter((c) => c.parent_id === id).sort(byOrder);
  }

  function handleCategoryDrop(targetId: string) {
    if (!draggedCategoryId || draggedCategoryId === targetId) return;
    setCategories((prev) => {
      const dragged = prev.find((c) => c.id === draggedCategoryId);
      const target = prev.find((c) => c.id === targetId);
      if (!dragged || !target) return prev;
      if ((dragged.parent_id || null) !== (target.parent_id || null)) return prev; // 不同層不能互換順序
      const next = [...prev];
      const fromIdx = next.findIndex((c) => c.id === draggedCategoryId);
      const toIdx = next.findIndex((c) => c.id === targetId);
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      const siblingIds = next.filter((c) => (c.parent_id || null) === (dragged.parent_id || null)).map((c) => c.id);
      // 畫面排序是照 sort_order 欄位排的，這裡要同步更新本地的 sort_order，畫面才會立刻反映新順序
      const orderMap = new Map(siblingIds.map((id, idx) => [id, idx]));
      const updated = next.map((c) => (orderMap.has(c.id) ? { ...c, sort_order: orderMap.get(c.id)! } : c));
      callJson("/api/admin/categories/reorder", "POST", { ids: siblingIds }).catch((e: any) => {
        setCategoryMsg("排序儲存失敗：" + e.message);
      });
      return updated;
    });
    setDraggedCategoryId(null);
  }

  // ================= 系列 =================
  async function loadPlans() {
    const r = await fetch(`/api/admin/series`);
    if (r.status === 401) { setUnlocked(false); setLoginMsg("登入已過期，請重新登入"); return; }
    const d = await r.json();
    setPlans(d.plans || []);
  }

  function handlePlanDrop(targetId: string) {
    if (!draggedPlanId || draggedPlanId === targetId) return;
    setPlans((prev) => {
      const next = [...prev];
      const fromIdx = next.findIndex((p) => p.id === draggedPlanId);
      const toIdx = next.findIndex((p) => p.id === targetId);
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      const ids = next.map((p) => p.id);
      callJson("/api/admin/series/reorder", "POST", { ids }).catch((e: any) => {
        setPlanMsg("排序儲存失敗：" + e.message);
      });
      return next;
    });
    setDraggedPlanId(null);
  }

  function editPlan(p: SeriesAdmin) {
    setPlanForm({
      id: p.id,
      name: p.name,
      imageUrl: p.imageUrl || "",
      visibleTo: p.visibleTo || [],
      categoryId: p.categoryId || "",
      promoImages: p.promoImages || [],
      isVisible: p.isVisible !== false,
    });
    planFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function savePlan() {
    if (!planForm.name.trim()) return setPlanMsg("請填寫系列名稱");
    setPlanMsg("處理中…");
    const payload = {
      name: planForm.name,
      imageUrl: planForm.imageUrl || null,
      visibleTo: planForm.visibleTo,
      categoryId: planForm.categoryId || null,
      promoImages: planForm.promoImages,
      isVisible: planForm.isVisible,
    };
    try {
      let d: any;
      if (planForm.id) {
        d = await callJson("/api/admin/series", "PUT", { id: planForm.id, ...payload });
      } else {
        d = await callJson("/api/admin/series", "POST", payload);
      }
      setPlanForm(emptyPlanForm);
      setPlanMsg(d?.syncWarning || "已儲存");
      loadPlans();
    } catch (e: any) {
      setPlanMsg("失敗：" + e.message);
    }
  }

  async function deletePlan(id: string) {
    if (!confirm("確定要刪除這個系列嗎？底下的商品會一起被刪除，無法復原！（訂單記錄會保留，不會被刪除）")) return;
    try {
      await callJson("/api/admin/series", "DELETE", { id });
      if (activePlanForProducts?.id === id) setActivePlanForProducts(null);
      loadPlans();
    } catch (e: any) {
      setPlanMsg("失敗：" + e.message);
    }
  }

  async function purgePlan(id: string, name: string) {
    if (!confirm(`確定要「徹底刪除」系列「${name}」嗎？\n\n這會連同底下所有訂單、商品明細一起永久刪除，也會把 Google Sheet 上這個系列的訂單分頁刪掉，無法復原！\n\n（成本試算表的分頁不會被動到，財務紀錄會保留）`)) return;
    try {
      const d = await callJson("/api/admin/series", "DELETE", { id, purgeOrders: true });
      if (activePlanForProducts?.id === id) setActivePlanForProducts(null);
      setPlanMsg(d.syncWarning || `已徹底刪除，一併清除了 ${d.purgedOrderCount} 筆訂單。`);
      loadPlans();
    } catch (e: any) {
      setPlanMsg("失敗：" + e.message);
    }
  }

  async function handlePlanImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPlanImg(true);
    try {
      const url = await uploadImage(file);
      setPlanForm((f) => ({ ...f, imageUrl: url }));
    } catch (err: any) {
      setPlanMsg("圖片上傳失敗：" + err.message);
    } finally {
      setUploadingPlanImg(false);
    }
  }

  async function handlePromoImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPromoImg(true);
    try {
      const url = await uploadImage(file);
      setPlanForm((f) => ({ ...f, promoImages: [...f.promoImages, url] }));
    } catch (err: any) {
      setPlanMsg("圖片上傳失敗：" + err.message);
    } finally {
      setUploadingPromoImg(false);
      e.target.value = "";
    }
  }

  function removePromoImage(index: number) {
    setPlanForm((f) => ({ ...f, promoImages: f.promoImages.filter((_, i) => i !== index) }));
  }

  const [planImageUrlInput, setPlanImageUrlInput] = useState("");
  const [promoImageUrlInput, setPromoImageUrlInput] = useState("");
  const [productImageUrlInput, setProductImageUrlInput] = useState("");

  function applyPlanImageUrl() {
    const v = planImageUrlInput.trim();
    if (!v) return;
    setPlanForm((f) => ({ ...f, imageUrl: toDirectImageUrl(v) }));
    setPlanImageUrlInput("");
  }

  function applyPromoImageUrl() {
    const v = promoImageUrlInput.trim();
    if (!v) return;
    setPlanForm((f) => ({ ...f, promoImages: [...f.promoImages, toDirectImageUrl(v)] }));
    setPromoImageUrlInput("");
  }

  function applyProductImageUrl() {
    const v = productImageUrlInput.trim();
    if (!v) return;
    setProductForm((f) => ({ ...f, imageUrl: toDirectImageUrl(v) }));
    setProductImageUrlInput("");
  }

  // ================= 商品 =================
  async function loadProducts(planId: string) {
    const r = await fetch(`/api/admin/products?seriesId=${planId}`);
    if (r.status === 401) { setUnlocked(false); setLoginMsg("登入已過期，請重新登入"); return; }
    const d = await r.json();
    setProducts(d.products || []);
  }

  async function loadAllProductsForCopy() {
    const r = await fetch(`/api/admin/products`);
    if (r.status === 401) { setUnlocked(false); setLoginMsg("登入已過期，請重新登入"); return; }
    const d = await r.json();
    setAllProductsForCopy(d.products || []);
  }

  async function openProductManager(p: SeriesAdmin) {
    setActivePlanForProducts(p);
    setProductForm(emptyProductForm);
    setProductRows([{ style: "", price: "0", imageUrl: "", hasDiscountFlag: true, codAllowed: true, shippingFee: "0" }]);
    setActiveSection("products");
    await Promise.all([loadProducts(p.id), loadAllProductsForCopy()]);
  }

  function editProduct(p: ProductAdmin) {
    setProductForm({ id: p.id, name: p.name, style: p.style || "", price: String(p.price), imageUrl: p.imageUrl || "", hasDiscountFlag: !!p.hasDiscountFlag, codAllowed: p.codAllowed !== false, shippingFee: String(p.shippingFee ?? 0), linkedGiftStyleId: p.linkedGiftStyleId ?? null, coverImageUrl: p.coverImageUrl || "" });
  }

  function addProductRow() {
    setProductRows((rows) => [...rows, { style: "", price: rows[rows.length - 1]?.price || "0", imageUrl: "", hasDiscountFlag: true, codAllowed: true, shippingFee: rows[rows.length - 1]?.shippingFee || "0" }]);
  }
  function removeProductRow(idx: number) {
    setProductRows((rows) => (rows.length <= 1 ? rows : rows.filter((_, i) => i !== idx)));
    setProductRowImageUrlInputs((prev) => {
      const next = { ...prev };
      delete next[idx];
      return next;
    });
  }
  function updateProductRow(idx: number, field: "style" | "price" | "imageUrl" | "shippingFee", value: string) {
    setProductRows((rows) => rows.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  }
  function toggleProductRowFlag(idx: number, field: "hasDiscountFlag" | "codAllowed") {
    setProductRows((rows) => rows.map((r, i) => (i === idx ? { ...r, [field]: !r[field] } : r)));
  }

  async function handleProductRowImageUpload(idx: number, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingRowImg(idx);
    try {
      const url = await uploadImage(file);
      updateProductRow(idx, "imageUrl", url);
    } catch (err: any) {
      setProductMsg("圖片上傳失敗：" + err.message);
    } finally {
      setUploadingRowImg(null);
    }
  }

  function applyProductRowImageUrl(idx: number) {
    const v = (productRowImageUrlInputs[idx] || "").trim();
    if (!v) return;
    updateProductRow(idx, "imageUrl", toDirectImageUrl(v));
    setProductRowImageUrlInputs((prev) => ({ ...prev, [idx]: "" }));
  }

  async function saveProduct() {
    if (!activePlanForProducts) return;
    if (!productForm.name.trim()) return setProductMsg("請填寫商品名稱");
    setProductMsg("處理中…");
    try {
      if (productForm.id) {
        // 編輯既有商品：單筆更新
        await callJson("/api/admin/products", "PUT", {
          id: productForm.id,
          seriesId: activePlanForProducts.id,
          name: productForm.name,
          style: productForm.style,
          price: productForm.price,
          imageUrl: productForm.imageUrl || null,
          hasDiscountFlag: productForm.hasDiscountFlag,
          codAllowed: productForm.codAllowed,
          shippingFee: productForm.shippingFee,
          coverImageUrl: productForm.coverImageUrl || null,
        });
        setProductForm(emptyProductForm);
        setProductMsg("已儲存");
      } else {
        // 新增商品：把每一列款式/金額各自建立一筆，同名不同款式
        const rows = productRows.filter((r) => r.style.trim() || productRows.length === 1);
        for (const row of rows) {
          await callJson("/api/admin/products", "POST", {
            seriesId: activePlanForProducts.id,
            name: productForm.name,
            style: row.style,
            price: row.price || "0",
            imageUrl: row.imageUrl || null,
            hasDiscountFlag: row.hasDiscountFlag,
            codAllowed: row.codAllowed,
            shippingFee: row.shippingFee || "0",
            coverImageUrl: productForm.coverImageUrl || null,
          });
        }
        // 商品名稱保留，方便接著建下一批款式；款式列表清空回一列
        setProductForm((f) => ({ ...f, style: "", price: "0" }));
        setProductRows([{ style: "", price: "0", imageUrl: "", hasDiscountFlag: true, codAllowed: true, shippingFee: "0" }]);
        setProductMsg(`已新增 ${rows.length} 筆`);
      }
      await loadProducts(activePlanForProducts.id);
    } catch (e: any) {
      setProductMsg("失敗：" + e.message);
    }
  }

  async function deleteProduct(id: string) {
    if (!confirm("確定要刪除這個商品款式嗎？")) return;
    try {
      await callJson("/api/admin/products", "DELETE", { id });
      if (activePlanForProducts) openProductManager(activePlanForProducts);
    } catch (e: any) {
      setProductMsg("失敗：" + e.message);
    }
  }

  function handleProductDrop(targetId: string) {
    if (!draggedProductId || draggedProductId === targetId) return;
    setProducts((prev) => {
      const next = [...prev];
      const fromIdx = next.findIndex((p) => p.id === draggedProductId);
      const toIdx = next.findIndex((p) => p.id === targetId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      // 存到後端（不用等回應才更新畫面，畫面已經先動了）
      callJson("/api/admin/products/reorder", "POST", { ids: next.map((p) => p.id) }).catch((e) => {
        setProductMsg("排序儲存失敗：" + e.message);
      });
      return next;
    });
    setDraggedProductId(null);
  }

  async function handleProductImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingProductImg(true);
    try {
      const url = await uploadImage(file);
      setProductForm((f) => ({ ...f, imageUrl: url }));
    } catch (err: any) {
      setProductMsg("圖片上傳失敗：" + err.message);
    } finally {
      setUploadingProductImg(false);
    }
  }

  const [uploadingCoverImg, setUploadingCoverImg] = useState(false);
  const [coverImageUrlInput, setCoverImageUrlInput] = useState("");
  async function handleProductCoverImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCoverImg(true);
    try {
      const url = await uploadImage(file);
      setProductForm((f) => ({ ...f, coverImageUrl: url }));
    } catch (err: any) {
      setProductMsg("封面圖上傳失敗：" + err.message);
    } finally {
      setUploadingCoverImg(false);
    }
  }

  // ================= 既有工具 =================
  async function doReset() {
    if (!resetUsername) return setResetMsg("請填帳號");
    setResetMsg("重設中…");
    try {
      await callJson("/api/admin/reset-password", "POST", { username: resetUsername });
      setResetMsg("已重設為 0000。");
    } catch (e: any) { setResetMsg("失敗：" + e.message); }
  }

  async function loadProfileRequests() {
    try {
      const r = await fetch("/api/admin/profile-requests", { cache: "no-store" });
      if (r.status === 401) { setUnlocked(false); setLoginMsg("登入已過期，請重新登入"); return; }
      const d = await r.json();
      setProfileRequests(d.requests || []);
    } catch {
      setProfileRequestsMsg("載入失敗");
    }
  }

  async function approveProfileRequest(memberId: string) {
    setProfileRequestsMsg("處理中…");
    try {
      await callJson("/api/admin/profile-requests", "POST", { memberId });
      setProfileRequestsMsg("已核准。");
      loadProfileRequests();
    } catch (e: any) {
      setProfileRequestsMsg("失敗：" + e.message);
    }
  }

  async function rejectProfileRequest(memberId: string) {
    if (!confirm("確定要拒絕這個個人頁網址修改申請嗎？")) return;
    setProfileRequestsMsg("處理中…");
    try {
      await callJson("/api/admin/profile-requests", "DELETE", { memberId });
      setProfileRequestsMsg("已拒絕。");
      loadProfileRequests();
    } catch (e: any) {
      setProfileRequestsMsg("失敗：" + e.message);
    }
  }

  async function lookupMember() {
    setMemberLookupMsg("");
    setMemberLookupResult(null);
    if (!memberLookupUsername.trim()) return setMemberLookupMsg("請輸入帳號");
    try {
      const r = await fetch(`/api/admin/members?username=${encodeURIComponent(memberLookupUsername.trim())}`, { cache: "no-store" });
      if (r.status === 401) { setUnlocked(false); setLoginMsg("登入已過期，請重新登入"); return; }
      const d = await r.json();
      if (!r.ok) return setMemberLookupMsg(d.error || "查詢失敗");
      setMemberLookupResult(d.member);
      setMemberNewProfileUrl("");
    } catch {
      setMemberLookupMsg("網路連線失敗");
    }
  }

  async function saveMemberProfileUrl() {
    if (!memberLookupResult) return;
    if (!memberNewProfileUrl.trim()) return setMemberLookupMsg("請輸入新的個人頁網址");
    setMemberLookupMsg("儲存中…");
    try {
      const d = await callJson("/api/admin/members", "POST", { username: memberLookupResult.username, profileUrl: memberNewProfileUrl.trim() });
      setMemberLookupResult((prev: any) => ({ ...prev, profileUrl: d.profileUrl, pendingProfileUrl: null }));
      setMemberNewProfileUrl("");
      setMemberLookupMsg("已更新個人頁網址。");
    } catch (e: any) {
      setMemberLookupMsg("失敗：" + e.message);
    }
  }

  async function deleteMember() {
    if (!memberLookupResult) return;
    if (!confirm(`確定要刪除會員「${memberLookupResult.username}」嗎？這個動作無法復原（訂單紀錄會保留，只是不會再連到這個帳號）。`)) return;
    setMemberLookupMsg("刪除中…");
    try {
      await callJson("/api/admin/members", "DELETE", { username: memberLookupResult.username });
      setMemberLookupMsg("已刪除會員。");
      setMemberLookupResult(null);
      setMemberLookupUsername("");
    } catch (e: any) {
      setMemberLookupMsg("失敗：" + e.message);
    }
  }

  async function lookupOrder() {
    setOrderLookupMsg("");
    setOrderLookupResult(null);
    setEditingOrderItems(false);
    setOrderPlanProducts([]);
    if (!orderLookupNo.trim()) return setOrderLookupMsg("請輸入訂單編號");
    try {
      const r = await fetch(`/api/admin/orders?orderNo=${encodeURIComponent(orderLookupNo.trim())}`, { cache: "no-store" });
      if (r.status === 401) { setUnlocked(false); setLoginMsg("登入已過期，請重新登入"); return; }
      const d = await r.json();
      if (!r.ok) return setOrderLookupMsg(d.error || "查詢失敗");
      setOrderLookupResult(d.order);
      setOrderPaidAmountInput(String(d.order.paidAmount || 0));
      setEditItemRows((d.order.items || []).map((it: any) => ({ name: it.name, style: it.style || "", qty: String(it.qty) })));
      if (d.order.seriesId) {
        try {
          const pr = await fetch(`/api/admin/products?seriesId=${d.order.seriesId}`, { cache: "no-store" });
          const pd = await pr.json();
          if (pr.ok) setOrderPlanProducts(pd.products || []);
        } catch {}
      }
    } catch {
      setOrderLookupMsg("網路連線失敗");
    }
  }

  function updateEditItemRow(idx: number, field: "name" | "style" | "qty", value: string) {
    setEditItemRows((rows) => rows.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  }
  function removeEditItemRow(idx: number) {
    setEditItemRows((rows) => (rows.length <= 1 ? rows : rows.filter((_, i) => i !== idx)));
  }
  function addEditItemRow() {
    const first = orderPlanProducts[0];
    setEditItemRows((rows) => [...rows, { name: first?.name || "", style: first?.style || "", qty: "1" }]);
  }

  async function saveOrderItems() {
    if (!orderLookupResult) return;
    const items = editItemRows
      .map((r) => ({ name: r.name.trim(), style: r.style.trim(), qty: Number(r.qty) }))
      .filter((r) => r.name);
    if (items.length === 0) return setOrderLookupMsg("至少要有一項商品");
    setSavingOrderItems(true);
    try {
      const d = await callJson("/api/admin/orders/items", "PATCH", { orderNo: orderLookupResult.orderNo, items });
      setOrderLookupMsg(d.syncWarning || "商品內容已更新，也已同步到 Google Sheet。");
      setEditingOrderItems(false);
      await lookupOrder();
    } catch (e: any) {
      setOrderLookupMsg("失敗：" + e.message);
    } finally {
      setSavingOrderItems(false);
    }
  }

  async function savePaidAmount() {
    if (!orderLookupResult) return;
    const amount = Number(orderPaidAmountInput);
    if (!Number.isFinite(amount) || amount < 0) return setOrderLookupMsg("已收金額請輸入正確的數字");
    setSavingPaidAmount(true);
    try {
      const d = await callJson("/api/admin/orders", "PATCH", { orderNo: orderLookupResult.orderNo, paidAmount: amount });
      setOrderLookupResult((prev: any) => ({ ...prev, paidAmount: amount }));
      setOrderLookupMsg(d.syncWarning || "已收金額已更新，也已同步到 Google Sheet 的付款狀態欄。");
    } catch (e: any) {
      setOrderLookupMsg("失敗：" + e.message);
    } finally {
      setSavingPaidAmount(false);
    }
  }

  async function deleteOrderAdmin() {
    if (!orderLookupResult) return;
    if (!confirm(`確定要刪除訂單「${orderLookupResult.orderNo}」嗎？這個動作無法復原。`)) return;
    setOrderLookupMsg("刪除中…");
    try {
      const d = await callJson("/api/admin/orders", "DELETE", { orderNo: orderLookupResult.orderNo });
      setOrderLookupMsg(d.syncWarning || "已刪除訂單，Sheet 上對應的列也已一併移除。");
      setOrderLookupResult(null);
      setOrderLookupNo("");
    } catch (e: any) {
      setOrderLookupMsg("失敗：" + e.message);
    }
  }

  async function loadCancelRequests() {
    try {
      const r = await fetch("/api/admin/orders/cancel-requests", { cache: "no-store" });
      if (r.status === 401) { setUnlocked(false); setLoginMsg("登入已過期，請重新登入"); return; }
      const d = await r.json();
      setCancelRequests(d.requests || []);
    } catch {
      setCancelRequestsMsg("載入失敗");
    }
  }

  async function approveCancelRequest(orderNo: string) {
    setCancelRequestsMsg("處理中…");
    try {
      const d = await callJson("/api/admin/orders/cancel-requests", "POST", { orderNo });
      setCancelRequestsMsg(d.syncWarning || "已核准，訂單已刪除，Sheet 也已同步更新。");
      loadCancelRequests();
    } catch (e: any) {
      setCancelRequestsMsg("失敗：" + e.message);
    }
  }

  async function rejectCancelRequest(orderNo: string) {
    setCancelRequestsMsg("處理中…");
    try {
      await callJson("/api/admin/orders/cancel-requests", "DELETE", { orderNo });
      setCancelRequestsMsg("已拒絕，訂單維持有效。");
      loadCancelRequests();
    } catch (e: any) {
      setCancelRequestsMsg("失敗：" + e.message);
    }
  }

  async function loadLegacyIdentities() {
    try {
      const qs = legacyIdentitySearch.trim() ? `?q=${encodeURIComponent(legacyIdentitySearch.trim())}` : "";
      const r = await fetch(`/api/admin/legacy-identities${qs}`, { cache: "no-store" });
      if (r.status === 401) { setUnlocked(false); setLoginMsg("登入已過期，請重新登入"); return; }
      const d = await r.json();
      setLegacyIdentities(d.identities || []);
    } catch {
      setLegacyIdentitiesMsg("載入失敗");
    }
  }

  async function loadLegacyRequests() {
    try {
      const r = await fetch("/api/admin/legacy-claim-requests?status=pending", { cache: "no-store" });
      if (r.status === 401) { setUnlocked(false); setLoginMsg("登入已過期，請重新登入"); return; }
      const d = await r.json();
      setLegacyRequests(d.requests || []);
    } catch {
      setLegacyRequestsMsg("載入失敗");
    }
  }

  async function resolveLegacyRequest(id: string, action: "resolve" | "reject") {
    setLegacyRequestsMsg("處理中…");
    try {
      await callJson("/api/admin/legacy-claim-requests", "PATCH", { id, action });
      setLegacyRequestsMsg(action === "resolve" ? "已標記為已處理。" : "已標記為不予處理。");
      loadLegacyRequests();
    } catch (e: any) {
      setLegacyRequestsMsg("失敗：" + e.message);
    }
  }

  async function loadLegacyUnmatchedOrders() {
    try {
      const r = await fetch("/api/admin/legacy-orders", { cache: "no-store" });
      if (r.status === 401) { setUnlocked(false); setLoginMsg("登入已過期，請重新登入"); return; }
      const d = await r.json();
      setLegacyUnmatchedOrders(d.orders || []);
    } catch {
      setLegacyUnmatchedMsg("載入失敗");
    }
  }

  async function reassignLegacyOrder(orderNo: string) {
    const targetUsername = (legacyReassignTarget[orderNo] || "").trim();
    if (!targetUsername) { setLegacyUnmatchedMsg("請先輸入要指定的會員帳號"); return; }
    setLegacyUnmatchedMsg("處理中…");
    try {
      const d = await callJson("/api/admin/legacy-orders", "PATCH", { orderNo, targetUsername });
      setLegacyUnmatchedMsg(d.syncWarning || "已改派完成。");
      loadLegacyUnmatchedOrders();
    } catch (e: any) {
      setLegacyUnmatchedMsg("失敗：" + e.message);
    }
  }

  async function deleteLegacyUnmatchedOrder(orderNo: string) {
    if (!confirm(`確定要刪除訂單 ${orderNo} 嗎？無法復原。`)) return;
    setLegacyUnmatchedMsg("處理中…");
    try {
      const d = await callJson("/api/admin/legacy-orders", "DELETE", { orderNo });
      setLegacyUnmatchedMsg(d.syncWarning || "已刪除。");
      loadLegacyUnmatchedOrders();
    } catch (e: any) {
      setLegacyUnmatchedMsg("失敗：" + e.message);
    }
  }

  async function loadDuplicateGroups() {
    setDuplicateScanning(true);
    setDuplicateScanMsg("");
    try {
      const r = await fetch("/api/admin/legacy-duplicate-orders", { cache: "no-store" });
      if (r.status === 401) { setUnlocked(false); setLoginMsg("登入已過期，請重新登入"); return; }
      const d = await r.json();
      if (!r.ok) { setDuplicateScanMsg(d.error || "掃描失敗"); return; }
      setDuplicateGroups(d.duplicateGroups || []);
      const initSelected: Record<string, boolean> = {};
      for (const g of d.duplicateGroups || []) {
        for (const o of g.orders) initSelected[o.orderNo] = o.suggestDelete;
      }
      setDuplicateSelected(initSelected);
      if ((d.duplicateGroups || []).length === 0) setDuplicateScanMsg("沒有掃到重複的訂單。");
    } catch {
      setDuplicateScanMsg("網路連線失敗，請再試一次");
    } finally {
      setDuplicateScanning(false);
    }
  }

  async function deleteDuplicateOrders() {
    const orderNos = Object.entries(duplicateSelected).filter(([, v]) => v).map(([k]) => k);
    if (orderNos.length === 0) { setDuplicateScanMsg("沒有勾選任何訂單"); return; }
    if (!confirm(`確定要刪除這 ${orderNos.length} 筆訂單嗎？無法復原。`)) return;
    setDuplicateDeleting(true);
    try {
      const d = await callJson("/api/admin/legacy-duplicate-orders", "POST", { orderNos });
      setDuplicateScanMsg(d.syncWarning ? `已刪除 ${d.deleted} 筆重複訂單，但部分 Sheet 同步失敗：${d.syncWarning}` : `已刪除 ${d.deleted} 筆重複訂單。`);
      loadDuplicateGroups();
      loadLegacyUnmatchedOrders();
    } catch (e: any) {
      setDuplicateScanMsg("失敗：" + e.message);
    } finally {
      setDuplicateDeleting(false);
    }
  }

  async function loadAnnouncements() {
    try {
      const r = await fetch("/api/admin/announcements", { cache: "no-store" });
      if (r.status === 401) { setUnlocked(false); setLoginMsg("登入已過期，請重新登入"); return; }
      const d = await r.json();
      setAnnouncementsList(d.announcements || []);
    } catch {
      setAnnouncementMsg("載入失敗");
    }
  }

  async function postAnnouncement() {
    if (!newAnnouncementContent.trim()) { setAnnouncementMsg("請輸入公告內容"); return; }
    setAnnouncementPosting(true);
    setAnnouncementMsg("");
    try {
      await callJson("/api/admin/announcements", "POST", { content: newAnnouncementContent.trim() });
      setNewAnnouncementContent("");
      setAnnouncementMsg("已發佈。");
      loadAnnouncements();
    } catch (e: any) {
      setAnnouncementMsg("失敗：" + e.message);
    } finally {
      setAnnouncementPosting(false);
    }
  }

  async function deleteAnnouncement(id: string) {
    if (!confirm("確定要刪除這則公告嗎？")) return;
    try {
      await callJson("/api/admin/announcements", "DELETE", { id });
      loadAnnouncements();
    } catch (e: any) {
      setAnnouncementMsg("失敗：" + e.message);
    }
  }

  async function loadCheckoutNotice() {
    try {
      const r = await fetch("/api/admin/site-settings", { cache: "no-store" });
      if (r.status === 401) { setUnlocked(false); setLoginMsg("登入已過期，請重新登入"); return; }
      const d = await r.json();
      setCheckoutNoticeInput(d.checkoutNotice || "");
    } catch {
      setCheckoutNoticeMsg("載入失敗");
    }
  }

  async function saveCheckoutNotice() {
    setCheckoutNoticeSaving(true);
    setCheckoutNoticeMsg("");
    try {
      await callJson("/api/admin/site-settings", "PATCH", { key: "checkout_notice", value: checkoutNoticeInput.trim() });
      setCheckoutNoticeMsg("已儲存。");
    } catch (e: any) {
      setCheckoutNoticeMsg("失敗：" + e.message);
    } finally {
      setCheckoutNoticeSaving(false);
    }
  }

  async function runResetAllData() {
    if (resetConfirmText !== "清空所有資料" || !resetConfirmChecked) return;
    if (!confirm("真的要清空所有資料嗎？這個動作無法復原，包含系列、訂單、會員、分類、公告、Google Sheet 分頁，以及所有管理者帳號（含你自己）都會被清掉。")) return;
    if (!confirm("再確認一次：這是最後一次提醒，按下確定之後就會立刻執行，沒有回頭路。")) return;
    setResetRunning(true);
    setResetResult(null);
    try {
      const r = await fetch("/api/admin/reset-all-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: resetConfirmText }),
      });
      const d = await r.json();
      if (!r.ok) { setResetResult({ error: d.error || "清空失敗" }); return; }
      setResetResult(d);
      const warnCount = d.warnings?.length || 0;
      alert(
        `已清空完成。\n\n刪除筆數：${Object.entries(d.deleted || {}).map(([k, v]) => `${k}(${v})`).join("、")}\n\n` +
        (warnCount > 0
          ? `有 ${warnCount} 項 Google Sheet沒有清成功，需要自己手動處理，詳情：\n${d.warnings.join("\n")}`
          : "Google Sheet也都清乾淨了。") +
        `\n\n即將登出，請用最高管理者邀請碼重新註冊 owner 帳號。`
      );
      setUnlocked(false);
    } catch {
      setResetResult({ error: "網路連線失敗，請再試一次" });
    } finally {
      setResetRunning(false);
    }
  }

  async function submitIdentitiesFile(commit: boolean) {
    if (!identitiesFile) return;
    setIdentitiesImporting(true);
    setIdentitiesResult(null);
    try {
      const fd = new FormData();
      fd.append("file", identitiesFile);
      fd.append("commit", commit ? "true" : "false");
      const r = await fetch("/api/admin/legacy-import/identities", { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) { setIdentitiesResult({ error: d.error || "匯入失敗" }); return; }
      setIdentitiesResult(d);
      if (commit) loadLegacyIdentities();
    } catch {
      setIdentitiesResult({ error: "網路連線失敗，請再試一次" });
    } finally {
      setIdentitiesImporting(false);
    }
  }

  async function submitManualOrdersFile(commit: boolean) {
    if (!manualOrdersFile) return;
    setManualOrdersImporting(true);
    setManualOrdersResult(null);
    try {
      const fd = new FormData();
      fd.append("file", manualOrdersFile);
      fd.append("commit", commit ? "true" : "false");
      const r = await fetch("/api/admin/legacy-import/manual-orders", { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) { setManualOrdersResult({ error: d.error || "匯入失敗" }); return; }
      setManualOrdersResult(d);
      if (commit) loadLegacyUnmatchedOrders();
    } catch {
      setManualOrdersResult({ error: "網路連線失敗，請再試一次" });
    } finally {
      setManualOrdersImporting(false);
    }
  }

  async function loadLegacySheetTabs() {
    if (!legacySheetId.trim()) { setLegacySheetTabsMsg("請輸入試算表 ID"); return; }
    setLegacySheetTabsLoading(true);
    setLegacySheetTabsMsg("");
    setLegacyTabResults({});
    try {
      const r = await fetch(`/api/admin/legacy-import/sheet-tabs?sheetId=${encodeURIComponent(legacySheetId.trim())}`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) { setLegacySheetTabsMsg(d.error || "讀取失敗"); return; }
      setLegacySheetTabs(d.tabs || []);
      if (!d.tabs || d.tabs.length === 0) setLegacySheetTabsMsg("這份試算表沒有任何分頁");
    } catch {
      setLegacySheetTabsMsg("網路連線失敗，請再試一次");
    } finally {
      setLegacySheetTabsLoading(false);
    }
  }

  async function importLegacySheetTabAction(tabName: string, commit: boolean) {
    setLegacyTabImporting((prev) => ({ ...prev, [tabName]: true }));
    try {
      const r = await fetch("/api/admin/legacy-import/sheet-tab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetId: legacySheetId.trim(), tabName, commit }),
      });
      const d = await r.json();
      setLegacyTabResults((prev) => ({ ...prev, [tabName]: r.ok ? d : { error: d.error || "匯入失敗" } }));
      if (r.ok && commit) loadLegacyUnmatchedOrders();
    } catch {
      setLegacyTabResults((prev) => ({ ...prev, [tabName]: { error: "網路連線失敗，請再試一次" } }));
    } finally {
      setLegacyTabImporting((prev) => ({ ...prev, [tabName]: false }));
    }
  }

  async function syncAllToSheets() {
    setSyncSheetsMsg("");
    setSyncingSheets(true);
    try {
      await callJson("/api/admin/sync-sheets", "POST", {});
      setSyncSheetsMsg("已同步完成。");
    } catch (e: any) {
      setSyncSheetsMsg("失敗：" + e.message);
    } finally {
      setSyncingSheets(false);
    }
  }

  async function loadStaffAdmins() {
    try {
      const r = await fetch("/api/admin/staff", { cache: "no-store" });
      if (r.status === 401) { setUnlocked(false); setLoginMsg("登入已過期，請重新登入"); return; }
      const d = await r.json();
      setStaffAdmins(d.admins || []);
    } catch {
      setStaffAdminsMsg("載入失敗");
    }
  }

  async function deleteStaffAdmin(id: string, username: string) {
    if (!confirm(`確定要刪除管理者「${username}」的帳號嗎？這個動作無法復原。`)) return;
    setStaffAdminsMsg("刪除中…");
    try {
      await callJson("/api/admin/staff", "DELETE", { id });
      setStaffAdminsMsg("已刪除。");
      loadStaffAdmins();
    } catch (e: any) {
      setStaffAdminsMsg("失敗：" + e.message);
    }
  }

  async function loadInviteCodes() {
    try {
      const r = await fetch("/api/admin/invite-codes", { cache: "no-store" });
      if (r.status === 401) { setUnlocked(false); setLoginMsg("登入已過期，請重新登入"); return; }
      const d = await r.json();
      setInviteCodes(d.codes || []);
    } catch {
      setInviteCodesMsg("載入失敗");
    }
  }

  async function generateInviteCode() {
    setInviteCodesMsg("");
    setGeneratingCode(true);
    try {
      const d = await callJson("/api/admin/invite-codes", "POST", {});
      setInviteCodesMsg(`已產生新邀請碼：${d.code}`);
      loadInviteCodes();
    } catch (e: any) {
      setInviteCodesMsg("失敗：" + e.message);
    } finally {
      setGeneratingCode(false);
    }
  }

  async function revokeInviteCode(id: string, used: boolean) {
    if (!confirm(used ? "確定要刪除這筆已使用的邀請碼紀錄嗎？" : "確定要撤銷這組還沒使用過的邀請碼嗎？")) return;
    setInviteCodesMsg("");
    try {
      await callJson("/api/admin/invite-codes", "DELETE", { id });
      setInviteCodesMsg(used ? "已刪除紀錄。" : "已撤銷。");
      loadInviteCodes();
    } catch (e: any) {
      setInviteCodesMsg("失敗：" + e.message);
    }
  }

  function copyInviteCode(code: string) {
    navigator.clipboard?.writeText(code);
    setInviteCodesMsg(`已複製：${code}`);
  }

  if (checkingSession) {
    return <div style={{ textAlign: "center", padding: 60, color: "#8A8779" }}>載入中…</div>;
  }

  if (!unlocked) {
    return (
      <div style={{ maxWidth: 380, margin: "80px auto", padding: 20 }}>
        <h2>米舖-官方周邊代購 後台</h2>
        {verifyMsg && <div style={{ background: "#EAF3DE", color: "#27500A", fontSize: 13, padding: "8px 12px", borderRadius: 8, marginBottom: 10 }}>{verifyMsg}</div>}
        <div className="id-row">
          <span className="id-label">帳號</span>
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doLogin()} />
        </div>
        <div className="id-row">
          <span className="id-label">密碼</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doLogin()} />
        </div>
        <div style={{ color: "#dc2626", fontSize: 13, minHeight: 18, margin: "6px 0" }}>{loginMsg}</div>
        <button className="btn" onClick={doLogin} disabled={loggingIn}>{loggingIn ? "登入中…" : "登入"}</button>
        <p style={{ marginTop: 16, fontSize: 13 }}>
          還沒有帳號？<a href="/admin/register">用邀請碼建立管理者帳號</a>
        </p>
        <p style={{ marginTop: 6, fontSize: 13 }}>
          <a href="/admin/forgot-password">忘記密碼？</a>
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2>米舖-官方周邊代購 後台</h2>
        <div style={{ fontSize: 13, color: "#6B6858", display: "flex", alignItems: "center", gap: 10 }}>
          <span>已登入：{currentUsername}（{currentRole === "owner" ? "最高權限" : "一般管理者"}）</span>
          <button className="btn secondary small" onClick={doLogout}>登出</button>
        </div>
      </div>
      <p style={{ color: "#8A8779", fontSize: 13, marginBottom: 16 }}>登入超過 8 小時會自動要求重新登入。</p>

      <div className="mibu-content-row" style={{ alignItems: "flex-start" }}>
        <aside className="category-sidebar-desktop account-sidebar-active" style={{ position: "static" }}>
          <p className="category-tree-title">後台功能</p>
          <div className={`account-nav-item ${activeSection === "account" ? "active" : ""}`} onClick={() => setActiveSection("account")}>帳號設定</div>
          <div className={`account-nav-item ${activeSection === "categories" ? "active" : ""}`} onClick={() => setActiveSection("categories")}>分類管理</div>
          <div className={`account-nav-item ${activeSection === "series" ? "active" : ""}`} onClick={() => setActiveSection("series")}>系列管理</div>
          <div className={`account-nav-item ${activeSection === "productImport" ? "active" : ""}`} onClick={() => setActiveSection("productImport")}>批次匯入商品</div>
          <div className={`account-nav-item ${activeSection === "campaigns" ? "active" : ""}`} onClick={() => setActiveSection("campaigns")}>檔期管理</div>
          {currentRole === "owner" && (
            <>
              <div className={`account-nav-item ${activeSection === "orders" ? "active" : ""}`} onClick={() => setActiveSection("orders")}>訂單管理</div>
              <div className={`account-nav-item ${activeSection === "members" ? "active" : ""}`} onClick={() => setActiveSection("members")}>會員管理</div>
              <div className={`account-nav-item ${activeSection === "codes" ? "active" : ""}`} onClick={() => setActiveSection("codes")}>邀請碼管理</div>
              <div className={`account-nav-item ${activeSection === "legacy" ? "active" : ""}`} onClick={() => setActiveSection("legacy")}>舊會員確認</div>
              <div className={`account-nav-item ${activeSection === "announcements" ? "active" : ""}`} onClick={() => setActiveSection("announcements")}>公告管理</div>
            </>
          )}
        </aside>

        <main style={{ flex: 1, minWidth: 0 }}>
          {activeSection === "account" && (
            <>
      <div className="auth-card">
        <h3>我的帳號設定</h3>
        <div className="id-row">
          <span className="id-label">目前信箱</span>
          <span style={{ fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
            {currentEmail || "尚未設定"}
            {currentEmail && (
              <span style={{ fontSize: 12, color: currentEmailVerified ? "#27500A" : "#B08E5A" }}>
                {currentEmailVerified ? "（已驗證）" : "（尚未驗證）"}
              </span>
            )}
            {currentEmail && !currentEmailVerified && (
              <button className="btn small secondary" onClick={resendAdminVerification} disabled={savingAdminEmail}>
                {savingAdminEmail ? "寄送中…" : "驗證信箱"}
              </button>
            )}
          </span>
        </div>
        <div className="id-row">
          <span className="id-label">新信箱</span>
          <input type="text" value={newAdminEmail} onChange={(e) => setNewAdminEmail(e.target.value)} placeholder="輸入要設定/更改成的 Email" />
        </div>
        <div className="id-row">
          <span className="id-label">目前密碼</span>
          <input type="password" value={adminEmailPw} onChange={(e) => setAdminEmailPw(e.target.value)} placeholder="驗證身分用" />
        </div>
        <button className="btn" onClick={saveAdminEmail} disabled={savingAdminEmail}>{savingAdminEmail ? "儲存中…" : "更新信箱"}</button>
        <div style={{ fontSize: 13, marginTop: 6 }}>{adminEmailMsg}</div>
      </div>

      <div className="auth-card">
        <h3>修改密碼</h3>
        <div className="id-row">
          <span className="id-label">目前密碼</span>
          <input type="password" value={adminCurrentPw} onChange={(e) => setAdminCurrentPw(e.target.value)} />
        </div>
        <div className="id-row">
          <span className="id-label">新密碼</span>
          <input type="password" value={adminNewPw} onChange={(e) => setAdminNewPw(e.target.value)} placeholder="至少 8 個字" />
        </div>
        <div className="id-row">
          <span className="id-label">確認新密碼</span>
          <input type="password" value={adminConfirmPw} onChange={(e) => setAdminConfirmPw(e.target.value)} />
        </div>
        <button className="btn" onClick={changeAdminPassword} disabled={savingAdminPw}>{savingAdminPw ? "儲存中…" : "更新密碼"}</button>
        <div style={{ fontSize: 13, marginTop: 6 }}>{adminPwMsg}</div>
      </div>

      {currentRole === "owner" && (
        <div className="auth-card">
          <h3>Google Sheet 同步</h3>
          <p style={{ fontSize: 12, color: "#8A8779", margin: 0 }}>
            訂單會在下單當下自動加一列進去；會員/系列/商品資料有變動時也會自動同步整份；
            訂單同時也會自動同步到獨立的「成本」試算表（成本欄留空給你手動填，利潤欄用公式自動算，不會洗掉你填過的成本）。
            這個按鈕是手動觸發一次完整同步，適合剛設定好、或想確保資料一致的時候用。
          </p>
          <button className="btn" onClick={syncAllToSheets} disabled={syncingSheets}>
            {syncingSheets ? "同步中…" : "立即完整同步一次"}
          </button>
          <div style={{ fontSize: 13, marginTop: 6 }}>{syncSheetsMsg}</div>
        </div>
      )}

      {currentRole === "owner" && (
        <div className="auth-card" style={{ border: "1px solid #F1B4B4", background: "#FFF7F7" }}>
          <h3 style={{ color: "#B3261E" }}>危險區域：清空所有資料</h3>
          <p style={{ fontSize: 12, color: "#8A7373", margin: 0 }}>
            會把系列、商品、訂單、會員、分類、公告、舊會員身份名冊、管理者帳號（含你自己）全部刪除，
            並且盡量一併清除對應的 Google Sheet 分頁（無法保證 100% 清乾淨，個別失敗會列在下面）。
            <strong>這個動作無法復原</strong>，清空後要用最高管理者邀請碼重新註冊 owner 帳號。
          </p>
          <div className="id-row" style={{ marginTop: 10 }}>
            <span className="id-label">輸入「清空所有資料」</span>
            <input type="text" value={resetConfirmText} onChange={(e) => setResetConfirmText(e.target.value)} placeholder="清空所有資料" />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#B3261E", margin: "8px 0" }}>
            <input type="checkbox" checked={resetConfirmChecked} onChange={(e) => setResetConfirmChecked(e.target.checked)} />
            我了解這個操作無法復原，確定要繼續
          </label>
          <button
            className="btn danger"
            onClick={runResetAllData}
            disabled={resetRunning || resetConfirmText !== "清空所有資料" || !resetConfirmChecked}
          >
            {resetRunning ? "清空中，請稍候…" : "清空所有資料"}
          </button>
          {resetResult && (
            <div style={{ fontSize: 13, marginTop: 10, maxHeight: 260, overflowY: "auto", border: "1px solid #F1B4B4", borderRadius: 8, padding: 8 }}>
              {resetResult.error ? (
                <div style={{ color: "#B3261E" }}>錯誤：{resetResult.error}</div>
              ) : (
                <>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>已清空完成，你現在的登入已經失效，請重新整理頁面用邀請碼重新註冊 owner 帳號。</div>
                  <div style={{ color: "#8A7373", marginBottom: 6 }}>
                    刪除筆數：{Object.entries(resetResult.deleted || {}).map(([k, v]) => `${k}(${v})`).join("、")}
                  </div>
                  {resetResult.warnings?.length > 0 && (
                    <>
                      <div style={{ fontWeight: 600, color: "#B08E5A" }}>以下項目沒有清成功，需要自己去 Google Sheet手動處理：</div>
                      {resetResult.warnings.map((w: string, i: number) => <div key={i} style={{ color: "#B08E5A" }}>・{w}</div>)}
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
            </>
          )}

          {activeSection === "categories" && (
      <div className="auth-card" ref={categoryFormRef}>
        <h3>分類管理</h3>

        <div className="id-row">
          <span className="id-label">名稱</span>
          <input type="text" value={categoryForm.name} onChange={(e) => setCategoryForm((f) => ({ ...f, name: e.target.value }))} placeholder="例如：食品、米菓" />
        </div>
        <div className="id-row">
          <span className="id-label">上層分類</span>
          <select value={categoryForm.parentId} onChange={(e) => setCategoryForm((f) => ({ ...f, parentId: e.target.value }))} style={{ flex: 1, padding: 8 }}>
            <option value="">（無，這是頂層分類）</option>
            {topCategories.filter((c) => c.id !== categoryForm.id).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="id-row">
          <span className="id-label">是否為滿贈分類</span>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#33415C" }}>
            <input type="checkbox" checked={categoryForm.isGiftCategory} onChange={(e) => setCategoryForm((f) => ({ ...f, isGiftCategory: e.target.checked }))} />
            這個分類底下的系列，新增時可以選檔期自動建立滿贈系列與商品
          </label>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={saveCategory}>{categoryForm.id ? "儲存修改" : "新增分類"}</button>
          {categoryForm.id && <button className="btn secondary" onClick={() => setCategoryForm(emptyCategoryForm)}>取消編輯</button>}
        </div>
        <div style={{ fontSize: 13, marginTop: 6 }}>{categoryMsg}</div>

        <div style={{ marginTop: 12, maxHeight: 320, overflowY: "auto", paddingRight: 4, borderTop: "1px solid #EDE9DC", paddingTop: 12 }}>
          <input
            type="text"
            value={categoryFilterText}
            onChange={(e) => setCategoryFilterText(e.target.value)}
            placeholder="搜尋分類名稱…"
            style={{ width: "100%", padding: 8, marginBottom: 10, border: "1px solid #EDE9DC", borderRadius: 8 }}
          />
          <p style={{ fontSize: 12, color: "#8A8779", margin: "0 0 8px" }}>可以拖曳調整排列順序（子分類只能在同一個上層分類底下互相拖曳）</p>
          {topCategories
            .filter((c) =>
              !categoryFilterText.trim() ||
              c.name.toLowerCase().includes(categoryFilterText.toLowerCase()) ||
              childrenOf(c.id).some((sub) => sub.name.toLowerCase().includes(categoryFilterText.toLowerCase()))
            )
            .map((c) => (
            <div
              key={c.id}
              style={{ marginBottom: 6, opacity: draggedCategoryId === c.id ? 0.4 : 1 }}
            >
              <div
                draggable
                onDragStart={() => setDraggedCategoryId(c.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleCategoryDrop(c.id)}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14, fontWeight: 600, cursor: "grab" }}
              >
                <span><span style={{ color: "#B0AC9C", marginRight: 6 }} title="拖曳排序">⠿</span>{c.name}</span>
                <span>
                  <button className="btn small secondary" onClick={() => editCategory(c)} style={{ marginRight: 6 }}>編輯</button>
                  <button className="btn small danger" onClick={() => deleteCategory(c.id)}>刪除</button>
                </span>
              </div>
              {childrenOf(c.id).map((sub) => (
                <div
                  key={sub.id}
                  draggable
                  onDragStart={() => setDraggedCategoryId(sub.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleCategoryDrop(sub.id)}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, color: "#6B6858", paddingLeft: 16, marginTop: 4, cursor: "grab", opacity: draggedCategoryId === sub.id ? 0.4 : 1 }}
                >
                  <span><span style={{ color: "#B0AC9C", marginRight: 6 }} title="拖曳排序">⠿</span>└ {sub.name}</span>
                  <span>
                    <button className="btn small secondary" onClick={() => editCategory(sub)} style={{ marginRight: 6 }}>編輯</button>
                    <button className="btn small danger" onClick={() => deleteCategory(sub.id)}>刪除</button>
                  </span>
                </div>
              ))}
            </div>
          ))}
          {topCategories.length === 0 && <div style={{ fontSize: 13, color: "#8A8779" }}>目前沒有分類</div>}
        </div>
      </div>
          )}

          {activeSection === "series" && (
            <>
      <div className="auth-card" ref={planFormRef}>
        <h3>系列管理</h3>

        <div className="id-row">
          <span className="id-label">名稱</span>
          <input type="text" value={planForm.name} onChange={(e) => setPlanForm((f) => ({ ...f, name: e.target.value }))} placeholder="系列名稱" />
        </div>
        <div className="id-row">
          <span className="id-label">分類</span>
          <select value={planForm.categoryId} onChange={(e) => setPlanForm((f) => ({ ...f, categoryId: e.target.value }))} style={{ flex: 1, padding: 8 }}>
            <option value="">（未分類）</option>
            {topCategories.map((c) => (
              <optgroup key={c.id} label={c.name}>
                <option value={c.id}>{c.name}</option>
                {childrenOf(c.id).map((sub) => (
                  <option key={sub.id} value={sub.id}>　└ {sub.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {!planForm.id && categories.find((c) => c.id === planForm.categoryId)?.isGiftCategory && (
          <div style={{ border: "1px solid #6B4E8E", background: "#ECE6F2", borderRadius: 10, padding: 14, marginBottom: 12 }}>
            <p style={{ fontSize: 13, color: "#4A3560", margin: "0 0 10px" }}>
              這是滿贈分類：選擇檔期後，會自動用檔期名稱建立系列，並依「滿贈款式登記」的資料自動建立對應商品（門檻金額當商品名稱、款式名稱當款式、圖片自動帶入），金額需要你自己手動填。
            </p>
            <div className="id-row">
              <span className="id-label">選擇檔期</span>
              <select value={giftSeriesCampaignId} onChange={(e) => setGiftSeriesCampaignId(e.target.value)} style={{ flex: 1, padding: 8 }}>
                <option value="">請選擇檔期</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <button className="btn small" onClick={autoCreateGiftSeries} disabled={autoCreatingGiftSeries}>
              {autoCreatingGiftSeries ? "建立中…" : "自動建立滿贈系列與商品"}
            </button>
            <div style={{ fontSize: 13, marginTop: 6, color: "#4A3560" }}>{autoCreateGiftMsg}</div>
          </div>
        )}
        <div className="id-row">
          <span className="id-label">顯示狀態</span>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#33415C" }}>
            <input
              type="checkbox"
              checked={planForm.isVisible}
              onChange={(e) => setPlanForm((f) => ({ ...f, isVisible: e.target.checked }))}
            />
            要顯示給顧客看（取消勾選＝隱藏，不受任何時間影響，店家自己決定）
          </label>
        </div>
        <div className="id-row">
          <span className="id-label">系列圖片</span>
          <input type="file" accept="image/*" onChange={handlePlanImageUpload} />
        </div>
        <div className="id-row">
          <span className="id-label"></span>
          <input type="text" value={planImageUrlInput} onChange={(e) => setPlanImageUrlInput(e.target.value)} placeholder="或貼上圖片網址（支援 Google Drive 分享連結）" />
          <button className="btn small secondary" onClick={applyPlanImageUrl}>使用這個網址</button>
        </div>
        {uploadingPlanImg && <div style={{ fontSize: 13, color: "#8A8779" }}>圖片上傳中…</div>}
        {planForm.imageUrl && <img src={planForm.imageUrl} alt="預覽" style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8, marginBottom: 8 }} />}

        <div className="id-row" style={{ alignItems: "flex-start" }}>
          <span className="id-label" style={{ paddingTop: 8 }}>宣傳圖</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: "#8A8779", marginBottom: 8 }}>可以放好幾張，顯示在商品頁最上方；沒有放的話那個區塊就不會出現</div>
            {planForm.promoImages.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                {planForm.promoImages.map((url, i) => (
                  <div key={i} style={{ position: "relative" }}>
                    <img src={url} alt={`宣傳圖 ${i + 1}`} style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 6, border: "1px solid #EDE9DC" }} />
                    <span
                      onClick={() => removePromoImage(i)}
                      style={{ position: "absolute", top: -6, right: -6, background: "#dc2626", color: "#fff", borderRadius: "999px", width: 18, height: 18, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                    >
                      ×
                    </span>
                  </div>
                ))}
              </div>
            )}
            <input type="file" accept="image/*" onChange={handlePromoImageUpload} />
            {uploadingPromoImg && <div style={{ fontSize: 13, color: "#8A8779", marginTop: 4 }}>圖片上傳中…</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <input type="text" value={promoImageUrlInput} onChange={(e) => setPromoImageUrlInput(e.target.value)} placeholder="或貼上圖片網址（支援 Google Drive 分享連結）" style={{ flex: 1 }} />
              <button className="btn small secondary" onClick={applyPromoImageUrl}>新增這張</button>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={savePlan}>{planForm.id ? "儲存修改" : "新增系列"}</button>
          {planForm.id && <button className="btn secondary" onClick={() => setPlanForm(emptyPlanForm)}>取消編輯</button>}
        </div>
        <div style={{ fontSize: 13, marginTop: 6 }}>{planMsg}</div>

        <input
          type="text"
          value={planFilterText}
          onChange={(e) => setPlanFilterText(e.target.value)}
          placeholder="搜尋系列名稱…"
          style={{ width: "100%", padding: 8, marginTop: 16, border: "1px solid #EDE9DC", borderRadius: 8 }}
        />

        <div style={{ marginTop: 16, borderTop: "1px solid #EDE9DC", paddingTop: 12 }}>
          <div style={{ maxHeight: 420, overflowY: "auto", paddingRight: 4 }}>
            {plans.filter((p) => !planFilterText.trim() || p.name.toLowerCase().includes(planFilterText.toLowerCase())).map((p) => (
              <div
                key={p.id}
                draggable
                onDragStart={() => setDraggedPlanId(p.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handlePlanDrop(p.id)}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", rowGap: 8, padding: "10px 0", borderBottom: "1px dashed #EDE9DC", cursor: "grab", opacity: draggedPlanId === p.id ? 0.4 : 1 }}
              >
                <div>
                  <div style={{ fontSize: 14 }}>
                    <span style={{ color: "#B0AC9C", marginRight: 6 }} title="拖曳排序">⠿</span>{p.name}
                    {p.isVisible === false && <span style={{ fontSize: 11, color: "#B3261E", marginLeft: 8 }}>已隱藏</span>}
                  </div>
                  <div style={{ fontSize: 12, color: "#8A8779" }}>{p.categoryName || "未分類"}</div>
                </div>
                <span style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <button className="btn small secondary" onClick={() => openProductManager(p)}>管理商品</button>
                  <button className="btn small secondary" onClick={() => editPlan(p)}>編輯</button>
                  <button className="btn small danger" onClick={() => deletePlan(p.id)}>刪除</button>
                  {currentRole === "owner" && (
                    <button className="btn small danger" onClick={() => purgePlan(p.id, p.name)} title="連訂單一起永久刪除，成本試算表資料會保留">徹底刪除（含訂單）</button>
                  )}
                </span>
              </div>
            ))}
            {plans.length === 0 && <div style={{ fontSize: 13, color: "#8A8779" }}>沒有系列</div>}
          </div>
        </div>
      </div>
            </>
          )}

          {activeSection === "productImport" && (
            <div className="auth-card">
              <h3>批次匯入商品</h3>
              <p style={{ fontSize: 13, color: "#8A8779", margin: "0 0 12px" }}>
                欄位：商品名稱｜款式｜金額｜運費金額｜是否滿減(v)｜圖片網址。一列＝一個具體款式，同名商品會自動歸到同一組。
                圖片網址支援 Google 雲端硬碟分享連結。
              </p>

              <div className="id-row">
                <span className="id-label">匯入到系列</span>
                <select value={importSeriesId} onChange={(e) => setImportSeriesId(e.target.value)} style={{ flex: 1, padding: 8 }}>
                  <option value="">請選擇系列</option>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="id-row">
                <span className="id-label">選擇檔案</span>
                <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => setImportFile(e.target.files?.[0] || null)} />
              </div>

              <button className="btn" onClick={runProductImport} disabled={importing}>
                {importing ? "匯入中…" : "開始匯入"}
              </button>
              <div className="auth-msg">{importMsg}</div>

              {importResult && (
                <div style={{ marginTop: 16, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
                  <div style={{ fontSize: 14, color: "#2C2C2A", marginBottom: 8 }}>
                    共 {importResult.total} 筆，成功 {importResult.success} 筆，失敗 {importResult.failed.length} 筆
                  </div>
                  {importResult.failed.map((msg, i) => (
                    <div key={i} style={{ fontSize: 12, color: "#993C1D" }}>{msg}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeSection === "campaigns" && !activeCampaignForGifts && !activeCampaignForVendorRules && (
            <div className="auth-card">
              <h3>檔期管理</h3>
              <p style={{ fontSize: 13, color: "#8A8779", margin: "0 0 12px" }}>
                檔期純粹是時間窗口，開放時間內可下單，時間外僅能瀏覽，跟商品／系列完全無關
              </p>

              <div className="id-row"><span className="id-label">名稱</span><input type="text" value={campaignForm.name} onChange={(e) => setCampaignForm((f) => ({ ...f, name: e.target.value }))} placeholder="例如：XX訂購" /></div>
              <div className="id-row"><span className="id-label">開放起始</span><input type="datetime-local" value={campaignForm.opensAt} onChange={(e) => setCampaignForm((f) => ({ ...f, opensAt: e.target.value }))} /></div>
              <div className="id-row"><span className="id-label">開放結束</span><input type="datetime-local" value={campaignForm.closesAt} onChange={(e) => setCampaignForm((f) => ({ ...f, closesAt: e.target.value }))} /></div>
              <div className="id-row"><span className="id-label">取付檔期總上限</span><input type="number" value={campaignForm.codCampaignCap} onChange={(e) => setCampaignForm((f) => ({ ...f, codCampaignCap: e.target.value }))} placeholder="留空＝不限" /></div>
              <div className="id-row"><span className="id-label">滿贈系列取付額度上限</span><input type="number" value={campaignForm.giftCodCampaignCap} onChange={(e) => setCampaignForm((f) => ({ ...f, giftCodCampaignCap: e.target.value }))} placeholder="留空＝不限，跟上面的一般商品取付上限分開累計" /></div>
              <div className="id-row"><span className="id-label">滿贈基礎單位</span><input type="number" value={campaignForm.giftBaseUnit} onChange={(e) => setCampaignForm((f) => ({ ...f, giftBaseUnit: e.target.value }))} /></div>
              <div className="id-row"><span className="id-label">廠商採購單贈品上限</span><input type="number" value={campaignForm.vendorOrderGiftCap} onChange={(e) => setCampaignForm((f) => ({ ...f, vendorOrderGiftCap: e.target.value }))} /></div>

              <h4 style={{ margin: "16px 0 8px" }}>8種交易組合</h4>
              {TXN_COMBOS.map((combo) => (
                <div key={combo.key} className="id-row">
                  <span className="id-label" style={{ minWidth: 160 }}>{combo.label}</span>
                  <input
                    type="checkbox"
                    checked={(campaignForm.rates as any)[`${combo.key}_enabled`]}
                    onChange={(e) => setCampaignForm((f) => ({ ...f, rates: { ...f.rates, [`${combo.key}_enabled`]: e.target.checked } }))}
                  />
                  <input
                    type="number"
                    step="0.01"
                    style={{ width: 90 }}
                    value={(campaignForm.rates as any)[`${combo.key}_rate`]}
                    onChange={(e) => setCampaignForm((f) => ({ ...f, rates: { ...f.rates, [`${combo.key}_rate`]: e.target.value } }))}
                    placeholder="匯率"
                  />
                </div>
              ))}

              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button className="btn" onClick={saveCampaign}>{campaignForm.id ? "儲存修改" : "新增檔期"}</button>
                {campaignForm.id && <button className="btn secondary" onClick={() => setCampaignForm(emptyCampaignForm)}>取消編輯</button>}
              </div>
              <div className="auth-msg">{campaignMsg}</div>

              <div style={{ marginTop: 16, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
                {campaigns.length === 0 && <div style={{ fontSize: 13, color: "#8A8779" }}>目前沒有檔期</div>}
                {campaigns.map((c) => (
                  <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px dashed var(--line)" }}>
                    <span style={{ fontSize: 14 }}>
                      {c.name}
                      <span style={{ fontSize: 12, color: "#8A8779", marginLeft: 8 }}>
                        {new Date(c.opens_at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })} ~ {new Date(c.closes_at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}
                      </span>
                    </span>
                    <span style={{ display: "flex", gap: 6 }}>
                      <button className="btn small secondary" onClick={() => openGiftStyles(c)}>滿贈款式登記</button>
                      <button className="btn small secondary" onClick={() => openVendorRules(c)}>廠商規則設定</button>
                      <button className="btn small secondary" onClick={() => window.open(`/admin/campaigns/${c.id}/purchase-batches`, "_self")}>拆單</button>
                      <button className="btn small secondary" onClick={() => editCampaign(c)}>編輯</button>
                      <button className="btn small danger" onClick={() => deleteCampaign(c.id)}>刪除</button>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeSection === "campaigns" && activeCampaignForGifts && (
            <div className="auth-card">
              <h3>滿贈款式登記：{activeCampaignForGifts.name}</h3>
              <p style={{ fontSize: 13, color: "#8A8779", margin: "0 0 12px" }}>每個款式只需登記一次：名稱＋門檻金額，圖片選填</p>

              <div className="id-row"><span className="id-label">款式名稱</span><input type="text" value={giftStyleName} onChange={(e) => setGiftStyleName(e.target.value)} /></div>
              <div className="id-row"><span className="id-label">門檻金額</span><input type="number" value={giftStyleThreshold} onChange={(e) => setGiftStyleThreshold(e.target.value)} /></div>
              <div className="id-row">
                <span className="id-label">款式圖片</span>
                <input type="file" accept="image/*" onChange={handleGiftStyleImageUpload} />
              </div>
              <div className="id-row">
                <span className="id-label"></span>
                <input type="text" value={giftStyleImageUrlInput} onChange={(e) => setGiftStyleImageUrlInput(e.target.value)} placeholder="或貼上圖片網址（支援 Google Drive 分享連結）" />
                <button className="btn small secondary" onClick={applyGiftStyleImageUrl}>使用這個網址</button>
              </div>
              {uploadingGiftStyleImg && <div style={{ fontSize: 13, color: "#8A8779" }}>圖片上傳中…</div>}
              {giftStyleImageUrl && <img src={giftStyleImageUrl} alt="預覽" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, marginBottom: 8 }} />}

              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn" onClick={saveGiftStyle}>{editingGiftStyleId ? "儲存修改" : "新增款式"}</button>
                {editingGiftStyleId && <button className="btn secondary" onClick={resetGiftStyleForm}>取消編輯</button>}
              </div>
              <div className="auth-msg">{giftStyleMsg}</div>

              <div style={{ marginTop: 16, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
                {giftStyles.length === 0 && <div style={{ fontSize: 13, color: "#8A8779" }}>還沒有登記任何款式</div>}
                {giftStyles.map((s) => (
                  <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px dashed var(--line)" }}>
                    <span style={{ fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
                      {s.image_url && <img src={s.image_url} alt="" style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 6 }} />}
                      {s.style_name}<span style={{ fontSize: 12, color: "#8A8779" }}>門檻 {s.threshold_amount}</span>
                    </span>
                    <span style={{ display: "flex", gap: 6 }}>
                      <button className="btn small secondary" onClick={() => editGiftStyle(s)}>編輯</button>
                      <button className="btn small danger" onClick={() => deleteGiftStyle(s.id)}>刪除</button>
                    </span>
                  </div>
                ))}
              </div>

              <button className="btn secondary" style={{ marginTop: 16 }} onClick={() => { setActiveCampaignForGifts(null); resetGiftStyleForm(); }}>關閉滿贈款式登記</button>
            </div>
          )}

          {activeSection === "campaigns" && activeCampaignForVendorRules && (
            <div className="auth-card">
              <h3>廠商規則設定：{activeCampaignForVendorRules.name}</h3>
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <button className={`btn small ${vendorRulesTab === "discount" ? "" : "secondary"}`} onClick={() => setVendorRulesTab("discount")}>折扣門檻</button>
                <button className={`btn small ${vendorRulesTab === "platforms" ? "" : "secondary"}`} onClick={() => setVendorRulesTab("platforms")}>平台設定</button>
              </div>

              {vendorRulesTab === "discount" && (
                <div>
                  <p style={{ fontSize: 13, color: "#8A8779", margin: "0 0 12px" }}>
                    純粹「採購單金額(人民幣)達到門檻，廠商退多少折扣金額(人民幣)」，三個平台共用同一份，跟滿贈完全無關。
                  </p>
                  <div className="id-row"><span className="id-label">門檻金額(￥)</span><input type="number" value={tierThreshold} onChange={(e) => setTierThreshold(e.target.value)} placeholder="例如 100" /></div>
                  <div className="id-row"><span className="id-label">折扣金額(￥)</span><input type="number" value={tierDiscount} onChange={(e) => setTierDiscount(e.target.value)} placeholder="例如 15" /></div>
                  <button className="btn" onClick={addDiscountTier}>新增門檻</button>
                  <div className="auth-msg">{vendorRulesMsg}</div>

                  <div style={{ marginTop: 16, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
                    {discountTiers.length === 0 && <div style={{ fontSize: 13, color: "#8A8779" }}>還沒有設定任何門檻</div>}
                    {discountTiers.map((t) => (
                      <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px dashed var(--line)" }}>
                        <span style={{ fontSize: 14 }}>滿 ￥{t.threshold_amount} → 折 ￥{t.discount_amount}</span>
                        <button className="btn small danger" onClick={() => deleteDiscountTier(t.id)}>刪除</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {vendorRulesTab === "platforms" && (
                <div>
                  <p style={{ fontSize: 13, color: "#8A8779", margin: "0 0 12px" }}>
                    每個平台各自設定「單筆採購單贈品總量上限」，以及對「滿贈款式登記」裡每個款式各自的上限（同一平台每個款式都填一樣的數字，就等於固定上限）。平台清單可拖曳調整優先順序，拆單時依此順序嘗試分配。
                  </p>
                  <div className="id-row"><span className="id-label">平台名稱</span><input type="text" value={newPlatformName} onChange={(e) => setNewPlatformName(e.target.value)} placeholder="例如 A平台" /></div>
                  <div className="id-row"><span className="id-label">單筆贈品總量上限</span><input type="number" value={newPlatformCap} onChange={(e) => setNewPlatformCap(e.target.value)} placeholder="例如 5" /></div>
                  <button className="btn" onClick={addVendorPlatform}>新增平台</button>
                  <div className="auth-msg">{vendorRulesMsg}</div>

                  {campaignGiftStyles.length === 0 && (
                    <div style={{ fontSize: 13, color: "#8A8779", marginTop: 12 }}>這個檔期還沒有登記任何滿贈款式（到「滿贈款式登記」新增），新增後才能設定每款式上限。</div>
                  )}

                  <div style={{ marginTop: 16 }}>
                    {vendorPlatforms.map((p) => (
                      <div
                        key={p.id}
                        draggable
                        onDragStart={() => setDraggedPlatformId(p.id)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => handlePlatformDrop(p.id)}
                        style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 14, marginBottom: 12, cursor: "grab", opacity: draggedPlatformId === p.id ? 0.4 : 1 }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                          <span style={{ fontWeight: 600 }}><span style={{ color: "#B0AC9C", marginRight: 6 }} title="拖曳排序">⠿</span>{p.name}（單筆贈品上限 {p.orderGiftCap}）</span>
                          <button className="btn small danger" onClick={() => deleteVendorPlatform(p.id)}>刪除平台</button>
                        </div>
                        {campaignGiftStyles.map((s) => (
                          <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                            <span style={{ fontSize: 13, color: "#5F5E5A", minWidth: 130 }}>{s.style_name}（門檻{s.threshold_amount}）每款上限</span>
                            <input
                              type="number"
                              style={{ width: 80 }}
                              value={editingPlatformCaps[p.id]?.[s.id] ?? ""}
                              onChange={(e) => setEditingPlatformCaps((prev) => ({ ...prev, [p.id]: { ...(prev[p.id] || {}), [s.id]: e.target.value } }))}
                            />
                          </div>
                        ))}
                        {campaignGiftStyles.length > 0 && <button className="btn small secondary" onClick={() => savePlatformCaps(p.id)}>儲存這個平台的每款上限</button>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button className="btn secondary" style={{ marginTop: 16 }} onClick={() => setActiveCampaignForVendorRules(null)}>關閉廠商規則設定</button>
            </div>
          )}

          {activeSection === "campaigns" && activeCampaignForBatches && !activeBatchForArrival && (
            <div className="auth-card">
              <h3>拆單：{activeCampaignForBatches.name}</h3>
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <button className={`btn small ${batchesTab === "batches" ? "" : "secondary"}`} onClick={() => setBatchesTab("batches")}>採購單</button>
                <button className={`btn small ${batchesTab === "gap" ? "" : "secondary"}`} onClick={() => setBatchesTab("gap")}>贈品缺口總覽</button>
                <button className={`btn small ${batchesTab === "extra" ? "" : "secondary"}`} onClick={() => setBatchesTab("extra")}>額外採購</button>
              </div>
              <div className="auth-msg">{batchesMsg}</div>

              {batchesTab === "batches" && (
                <div>
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontWeight: 600, marginBottom: 8 }}>未分配品項池</div>
                    {unassignedPool.length === 0 && <div style={{ fontSize: 13, color: "#8A8779" }}>沒有未分配的品項</div>}
                    {unassignedPool.map((it) => (
                      <div key={it.orderItemId} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px dashed var(--line)" }}>
                        <span style={{ fontSize: 13, minWidth: 200 }}>{it.username}：{it.productName}{it.style ? `（${it.style}）` : ""} 剩 {it.qty} 件（￥{it.unitPriceOriginal ?? it.unitPrice}/件）</span>
                        <input
                          type="number"
                          placeholder="數量"
                          style={{ width: 60, minWidth: 60 }}
                          value={assignQtyByItem[it.orderItemId] || ""}
                          onChange={(e) => setAssignQtyByItem((prev) => ({ ...prev, [it.orderItemId]: e.target.value }))}
                        />
                        <select
                          style={{ padding: 6 }}
                          value={assignTargetBatchByItem[it.orderItemId] || ""}
                          onChange={(e) => setAssignTargetBatchByItem((prev) => ({ ...prev, [it.orderItemId]: e.target.value }))}
                        >
                          <option value="">選採購單</option>
                          {purchaseBatches.map((b, idx) => (
                            <option key={b.id} value={b.id}>採購單{idx + 1}{b.platform ? `（${b.platform.name}）` : ""}</option>
                          ))}
                        </select>
                        <button className="btn small secondary" onClick={() => assignItemToBatch(it.orderItemId)}>分配</button>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                    <select value={newBatchPlatformId} onChange={(e) => setNewBatchPlatformId(e.target.value)} style={{ padding: 8 }}>
                      <option value="">（尚未指定平台）</option>
                      {vendorPlatforms.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <button className="btn small" onClick={createPurchaseBatch}>新增採購單</button>
                  </div>

                  {purchaseBatches.map((b, idx) => (
                    <div key={b.id} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 14, marginBottom: 14 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
                        <span style={{ fontWeight: 600 }}>採購單{idx + 1}</span>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <select value={b.platform?.id || ""} onChange={(e) => changeBatchPlatform(b.id, e.target.value)} style={{ padding: 6 }}>
                            <option value="">（尚未指定平台）</option>
                            {vendorPlatforms.map((p) => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                          <button
                            className="btn small secondary"
                            style={
                              b.arrivalTotalQty > 0
                                ? { background: b.arrivalArrivedQty >= b.arrivalTotalQty ? "#639922" : "#D9A441", color: "#fff", borderColor: "transparent" }
                                : undefined
                            }
                            onClick={() => openArrivalTracking(b)}
                          >
                            {b.arrivalTotalQty > 0 ? `到貨中 ${b.arrivalArrivedQty}/${b.arrivalTotalQty}` : "到貨追蹤"}
                          </button>
                          <button className="btn small danger" onClick={() => deleteBatch(b.id)}>刪除採購單</button>
                        </div>
                      </div>

                      {b.items.length === 0 && <div style={{ fontSize: 13, color: "#8A8779" }}>還沒有分配任何品項</div>}
                      {b.items.map((it: any) => (
                        <div key={it.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, padding: "4px 0" }}>
                          <span>{it.username}：{it.productName}{it.style ? `（${it.style}）` : ""} x{it.qty}（￥{it.unitPriceOriginal}/件）</span>
                          <button className="btn small secondary" onClick={() => removeBatchItem(b.id, it.id)}>移出</button>
                        </div>
                      ))}

                      <div style={{ fontSize: 13, marginTop: 8, color: "#5F5E5A" }}>
                        原幣小計 ￥{Math.round(b.subtotalOriginal).toLocaleString("zh-TW")}
                        {b.matchedThresholdAmount != null && <span>　達門檻￥{b.matchedThresholdAmount}，折扣￥{b.matchedDiscountAmount}</span>}
                      </div>

                      <div style={{ marginTop: 10, borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
                        <div style={{ fontSize: 12, color: "#8A8779", marginBottom: 4 }}>滿贈配置</div>
                        {b.gifts.map((g: any) => (
                          <div key={g.giftStyleId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, padding: "2px 0" }}>
                            <span>{g.styleName}（門檻{g.thresholdAmount}）x{g.qty}</span>
                            <span style={{ display: "flex", gap: 6 }}>
                              <button className="btn small secondary" onClick={() => editBatchGift(b.id, g.giftStyleId, g.qty)}>編輯</button>
                              <button className="btn small danger" onClick={() => removeBatchGift(b.id, g.giftStyleId)}>刪除</button>
                            </span>
                          </div>
                        ))}
                        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                          <select
                            style={{ padding: 6 }}
                            value={giftPickByBatch[b.id] || ""}
                            onChange={(e) => setGiftPickByBatch((prev) => ({ ...prev, [b.id]: e.target.value }))}
                          >
                            <option value="">選滿贈款式</option>
                            {campaignGiftStyles.map((s) => (
                              <option key={s.id} value={s.id}>{s.style_name}（門檻{s.threshold_amount}）</option>
                            ))}
                          </select>
                          <input
                            type="number"
                            placeholder="數量"
                            style={{ width: 60, minWidth: 60 }}
                            value={giftQtyByBatch[b.id] || ""}
                            onChange={(e) => setGiftQtyByBatch((prev) => ({ ...prev, [b.id]: e.target.value }))}
                          />
                          <button className="btn small secondary" onClick={() => setBatchGift(b.id)}>
                            {giftPickByBatch[b.id] && b.gifts.find((g: any) => g.giftStyleId === giftPickByBatch[b.id]) ? "儲存修改" : "設定"}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {batchesTab === "gap" && (
                <div>
                  <p style={{ fontSize: 13, color: "#8A8779", margin: "0 0 12px" }}>
                    保底＝顧客結帳當下已看到、承諾一定會拿到的數量；已配置＝目前所有採購單設定的滿贈加總；額外採購會一併抵掉缺口。
                  </p>
                  {batchGiftGap.map((g) => (
                    <div key={g.giftStyleId} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px dashed var(--line)" }}>
                      <span style={{ fontSize: 14 }}>{g.styleName}（門檻{g.thresholdAmount}）</span>
                      <span style={{ fontSize: 13 }}>
                        保底{g.promised} / 已配置{g.allocated} / 額外採購{g.extra}　
                        <span style={{ color: g.diff < 0 ? "#B3261E" : "#639922", fontWeight: 600 }}>
                          {g.diff < 0 ? `缺${-g.diff}` : `餘${g.diff}`}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {batchesTab === "extra" && (
                <div>
                  <p style={{ fontSize: 13, color: "#8A8779", margin: "0 0 12px" }}>跟其他賣家/管道額外買到的現貨，用來抵掉贈品缺口，不強制走拆單。</p>
                  <div className="id-row">
                    <span className="id-label">滿贈款式</span>
                    <select value={extraGiftStyleId} onChange={(e) => setExtraGiftStyleId(e.target.value)} style={{ flex: 1, padding: 8 }}>
                      <option value="">請選擇</option>
                      {campaignGiftStyles.map((s) => (
                        <option key={s.id} value={s.id}>{s.style_name}（門檻{s.threshold_amount}）</option>
                      ))}
                    </select>
                  </div>
                  <div className="id-row"><span className="id-label">數量</span><input type="number" value={extraQty} onChange={(e) => setExtraQty(e.target.value)} /></div>
                  <div className="id-row"><span className="id-label">備註</span><input type="text" value={extraNote} onChange={(e) => setExtraNote(e.target.value)} placeholder="選填" /></div>
                  <button className="btn" onClick={addExtraPurchase}>新增額外採購紀錄</button>

                  <div style={{ marginTop: 16, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
                    {extraPurchases.length === 0 && <div style={{ fontSize: 13, color: "#8A8779" }}>還沒有任何額外採購紀錄</div>}
                    {extraPurchases.map((p) => (
                      <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px dashed var(--line)" }}>
                        <span style={{ fontSize: 14 }}>{p.styleName} x{p.qty}{p.note ? `（${p.note}）` : ""}</span>
                        <button className="btn small danger" onClick={() => deleteExtraPurchase(p.id)}>刪除</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button className="btn secondary" style={{ marginTop: 16 }} onClick={() => setActiveCampaignForBatches(null)}>關閉拆單</button>
            </div>
          )}

          {activeSection === "campaigns" && activeBatchForArrival && (
            <div className="auth-card">
              <h3>到貨追蹤</h3>
              <p style={{ fontSize: 13, color: "#8A8779", margin: "0 0 12px" }}>
                三層結構：廠商訂單編號 → 物流單號 → 品項。滿贈品項比照一般商品，同樣可以被分配進物流單號、同樣要追蹤到貨狀態，只記到貨/未到貨兩態。
              </p>
              <div className="auth-msg">{arrivalMsg}</div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>還沒分配到物流單號的品項</div>
                {arrivalUnshippedPool.length === 0 && <div style={{ fontSize: 13, color: "#8A8779" }}>沒有未分配的品項</div>}
                {arrivalUnshippedPool.map((it: any) => {
                  const key = `${it.type}-${it.id}`;
                  const allShipmentOptions = arrivalTree.flatMap((on: any) => on.shipments.map((s: any) => ({ id: s.id, label: `${on.orderNumber} / ${s.trackingNumber || "（未填物流單號）"}` })));
                  return (
                    <div key={key} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px dashed var(--line)" }}>
                      <span style={{ fontSize: 13, minWidth: 220 }}>{it.label}　剩 {it.remaining} 件</span>
                      <input
                        type="number"
                        placeholder="數量"
                        style={{ width: 60, minWidth: 60 }}
                        value={assignShipQtyByPoolItem[key] || ""}
                        onChange={(e) => setAssignShipQtyByPoolItem((prev) => ({ ...prev, [key]: e.target.value }))}
                      />
                      <select
                        style={{ padding: 6 }}
                        value={assignShipTargetByPoolItem[key] || ""}
                        onChange={(e) => setAssignShipTargetByPoolItem((prev) => ({ ...prev, [key]: e.target.value }))}
                      >
                        <option value="">選物流單號</option>
                        {allShipmentOptions.map((opt) => (
                          <option key={opt.id} value={opt.id}>{opt.label}</option>
                        ))}
                      </select>
                      <button className="btn small secondary" onClick={() => assignPoolItemToShipment(it)}>分配</button>
                    </div>
                  );
                })}
              </div>

              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <input type="text" value={newOrderNumber} onChange={(e) => setNewOrderNumber(e.target.value)} placeholder="廠商訂單編號" style={{ padding: 8 }} />
                <button className="btn small" onClick={addOrderNumber}>新增廠商訂單編號</button>
              </div>

              {arrivalTree.map((on: any) => (
                <div key={on.id} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 14, marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontWeight: 600 }}>廠商訂單編號：{on.orderNumber}</span>
                    <button className="btn small danger" onClick={() => deleteOrderNumber(on.id)}>刪除</button>
                  </div>

                  {on.shipments.map((s: any) => {
                    const shipmentArrived = s.items.length > 0 && s.items.every((it: any) => it.arrived);
                    const shipmentSomeArrived = s.items.some((it: any) => it.arrived);
                    return (
                      <div key={s.id} style={{ marginLeft: 14, borderLeft: "2px solid var(--line)", paddingLeft: 12, marginBottom: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                          <span style={{ fontSize: 14 }}>
                            物流單號：{s.trackingNumber || "（未填）"}
                            {s.items.length > 0 && (
                              <span style={{ marginLeft: 8, fontSize: 12, color: shipmentArrived ? "#639922" : shipmentSomeArrived ? "#D9A441" : "#8A8779" }}>
                                {shipmentArrived ? "已到貨" : shipmentSomeArrived ? "部分到貨" : "未到貨"}
                              </span>
                            )}
                          </span>
                          <button className="btn small danger" onClick={() => deleteShipment(s.id)}>刪除</button>
                        </div>
                        {s.items.map((it: any) => (
                          <div key={it.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, padding: "3px 0" }}>
                            <span>{it.label} x{it.qty}</span>
                            <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                <input type="checkbox" checked={it.arrived} onChange={(e) => toggleArrived(it.id, e.target.checked)} />
                                到貨
                              </label>
                              <button className="btn small secondary" onClick={() => removeShipmentItem(it.id)}>移除</button>
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  })}

                  <div style={{ display: "flex", gap: 8, marginLeft: 14, marginTop: 8 }}>
                    <input
                      type="text"
                      placeholder="物流單號（選填）"
                      style={{ padding: 6 }}
                      value={newTrackingByOrderNumber[on.id] || ""}
                      onChange={(e) => setNewTrackingByOrderNumber((prev) => ({ ...prev, [on.id]: e.target.value }))}
                    />
                    <button className="btn small secondary" onClick={() => addShipment(on.id)}>新增物流單號</button>
                  </div>
                </div>
              ))}

              <button className="btn secondary" style={{ marginTop: 16 }} onClick={() => setActiveBatchForArrival(null)}>關閉到貨追蹤</button>
            </div>
          )}

          {activeSection === "products" && activePlanForProducts && (
        <div className="auth-card">
          <h3>商品管理：{activePlanForProducts.name}</h3>
          <div style={{ marginBottom: 12 }}>
            {Object.entries(
              products.reduce<Record<string, ProductAdmin[]>>((acc, p) => {
                acc[p.name] = acc[p.name] || [];
                acc[p.name].push(p);
                return acc;
              }, {})
            ).map(([name, styles]) => (
              <div key={name} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#33415C", padding: "6px 0" }}>{name}</div>
                {styles.map((p) => (
                  <div
                    key={p.id}
                    draggable
                    onDragStart={() => setDraggedProductId(p.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleProductDrop(p.id)}
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0 8px 10px", borderBottom: "1px dashed #EDE9DC", cursor: "grab", opacity: draggedProductId === p.id ? 0.4 : 1 }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ color: "#B0AC9C", fontSize: 14, cursor: "grab" }} title="拖曳排序">⠿</span>
                      {p.imageUrl && <img src={p.imageUrl} alt={p.name} style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 6 }} />}
                      <div>
                        <div style={{ fontSize: 14 }}>{p.style || "單一款式"}</div>
                        <div style={{ fontSize: 12, color: "#8A8779" }}>{p.linkedGiftStyleId ? "NT$" : "￥"} {p.price}</div>
                      </div>
                    </div>
                    <span style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button className="btn small secondary" onClick={() => editProduct(p)}>編輯</button>
                      <button className="btn small danger" onClick={() => deleteProduct(p.id)}>刪除</button>
                    </span>
                  </div>
                ))}
              </div>
            ))}
            {products.length === 0 && <div style={{ fontSize: 13, color: "#8A8779" }}>這個系列還沒有商品</div>}
          </div>

          <div className="id-row">
            <span className="id-label">商品名稱</span>
            <input type="text" value={productForm.name} onChange={(e) => setProductForm((f) => ({ ...f, name: e.target.value }))} placeholder="例如：原味米菓" />
          </div>
          <div className="id-row">
            <span className="id-label">商品封面圖</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
              <p style={{ fontSize: 11, color: "#9A9787", margin: 0 }}>跟款式照片是分開的，用在商品格線卡片上（同名商品共用同一張）</p>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <input type="file" accept="image/*" onChange={handleProductCoverImageUpload} />
                <input
                  type="text"
                  value={coverImageUrlInput}
                  onChange={(e) => setCoverImageUrlInput(e.target.value)}
                  placeholder="或貼上圖片網址"
                  style={{ flex: 1, minWidth: 140 }}
                />
                <button className="btn small secondary" onClick={() => { if (coverImageUrlInput.trim()) { setProductForm((f) => ({ ...f, coverImageUrl: toDirectImageUrl(coverImageUrlInput.trim()) })); setCoverImageUrlInput(""); } }}>使用</button>
              </div>
              {uploadingCoverImg && <div style={{ fontSize: 12, color: "#8A8779" }}>封面圖上傳中…</div>}
              {productForm.coverImageUrl && <img src={productForm.coverImageUrl} alt="封面圖預覽" style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 8 }} />}
            </div>
          </div>
          {!productForm.id && (
            <>
              {Array.from(new Set(products.map((p) => p.name))).length > 0 && (
                <div className="id-row">
                  <span className="id-label">快速選擇</span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {Array.from(new Set(products.map((p) => p.name))).map((name) => (
                      <span
                        key={name}
                        onClick={() => setProductForm((f) => ({ ...f, name }))}
                        style={{
                          fontSize: 12, padding: "4px 10px", borderRadius: 999, cursor: "pointer",
                          background: productForm.name === name ? "#33415C" : "#F1EFE8",
                          color: productForm.name === name ? "#fff" : "#5F5E5A",
                        }}
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {allProductsForCopy.length > 0 && (
                <div className="id-row">
                  <span className="id-label">複製款式</span>
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      const sourceKey = e.target.value;
                      if (!sourceKey) return;
                      const [sourceSeriesId, sourceName] = sourceKey.split("||");
                      const rows = allProductsForCopy
                        .filter((p) => p.seriesId === sourceSeriesId && p.name === sourceName)
                        .map((p) => ({ style: p.style || "", price: String(p.price), imageUrl: p.imageUrl || "", hasDiscountFlag: !!p.hasDiscountFlag, codAllowed: p.codAllowed !== false, shippingFee: String(p.shippingFee ?? 0) }));
                      if (rows.length > 0) setProductRows(rows);
                      e.target.value = "";
                    }}
                  >
                    <option value="">選一個商品複製款式（可跨系列選，記得修改金額）</option>
                    {Array.from(new Map(allProductsForCopy.map((p) => [`${p.seriesId}||${p.name}`, p])).entries()).map(([key, p]) => {
                      const seriesName = plans.find((s) => s.id === p.seriesId)?.name || "未知系列";
                      return (
                        <option key={key} value={key}>{p.name}（{seriesName}）</option>
                    );
                  })}
                </select>
              </div>
              )}
            </>
          )}

          {productForm.id ? (
            <>
              <div className="id-row">
                <span className="id-label">款式</span>
                <input type="text" value={productForm.style} onChange={(e) => setProductForm((f) => ({ ...f, style: e.target.value }))} placeholder="例如：6入（沒有分款式可留空）" />
              </div>
              <div className="id-row">
                <span className="id-label">價格（{productForm.linkedGiftStyleId ? "NT$" : "￥"}）</span>
                <input type="number" value={productForm.price} onChange={(e) => setProductForm((f) => ({ ...f, price: e.target.value }))} />
              </div>
              <div className="id-row">
                <span className="id-label">運費金額（{productForm.linkedGiftStyleId ? "NT$" : "￥"}）</span>
                <input type="number" value={productForm.shippingFee} onChange={(e) => setProductForm((f) => ({ ...f, shippingFee: e.target.value }))} />
              </div>
              <div className="id-row">
                <span className="id-label">是否滿減(v)</span>
                <input type="checkbox" checked={productForm.hasDiscountFlag} onChange={(e) => setProductForm((f) => ({ ...f, hasDiscountFlag: e.target.checked }))} />
              </div>
              <div className="id-row">
                <span className="id-label">是否開放取付</span>
                <input type="checkbox" checked={productForm.codAllowed} onChange={(e) => setProductForm((f) => ({ ...f, codAllowed: e.target.checked }))} />
              </div>
              <div className="id-row">
                <span className="id-label">商品圖片</span>
                <input type="file" accept="image/*" onChange={handleProductImageUpload} />
              </div>
              <div className="id-row">
                <span className="id-label"></span>
                <input type="text" value={productImageUrlInput} onChange={(e) => setProductImageUrlInput(e.target.value)} placeholder="或貼上圖片網址（支援 Google Drive 分享連結）" />
                <button className="btn small secondary" onClick={applyProductImageUrl}>使用這個網址</button>
              </div>
              {uploadingProductImg && <div style={{ fontSize: 13, color: "#8A8779" }}>圖片上傳中…</div>}
              {productForm.imageUrl && <img src={productForm.imageUrl} alt="預覽" style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8, marginBottom: 8 }} />}
            </>
          ) : (
            <div>
              <div className="id-label" style={{ marginBottom: 8 }}>款式／價格／圖片</div>
              <div>
                {productRows.map((row, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, marginBottom: 10, padding: 10, background: "#FAF8F2", borderRadius: 8, alignItems: "flex-start" }}>
                    {row.imageUrl && (
                      <img src={row.imageUrl} alt="預覽" style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                        <input
                          type="text"
                          value={row.style}
                          onChange={(e) => updateProductRow(i, "style", e.target.value)}
                          placeholder="款式（沒有分款式可留空）"
                          style={{ flex: 1, maxWidth: 220, minWidth: 0, padding: "9px 10px", border: "1px solid var(--line)", borderRadius: 8, fontSize: 15, background: "var(--card)", color: "var(--text)", boxSizing: "border-box" }}
                        />
                        <div>
                          <div style={{ fontSize: 10, color: "#9A9787", marginBottom: 2 }}>金額(￥)</div>
                          <input
                            type="number"
                            value={row.price}
                            onChange={(e) => updateProductRow(i, "price", e.target.value)}
                            style={{ width: 60, minWidth: 60, padding: "9px 6px", border: "1px solid var(--line)", borderRadius: 8, fontSize: 14, background: "var(--card)", color: "var(--text)", boxSizing: "border-box" }}
                          />
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: "#9A9787", marginBottom: 2 }}>運費(￥)</div>
                          <input
                            type="number"
                            value={row.shippingFee}
                            onChange={(e) => updateProductRow(i, "shippingFee", e.target.value)}
                            style={{ width: 50, minWidth: 50, padding: "9px 6px", border: "1px solid var(--line)", borderRadius: 8, fontSize: 14, background: "var(--card)", color: "var(--text)", boxSizing: "border-box" }}
                          />
                        </div>
                        {i === productRows.length - 1 ? (
                          <button className="btn small secondary" onClick={addProductRow} title="再新增一列款式" style={{ flexShrink: 0 }}>＋</button>
                        ) : (
                          <button className="btn small secondary" onClick={() => removeProductRow(i)} title="移除這一列" style={{ flexShrink: 0 }}>－</button>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                        <input type="file" accept="image/*" onChange={(e) => handleProductRowImageUpload(i, e)} style={{ fontSize: 12 }} />
                        <input
                          type="text"
                          value={productRowImageUrlInputs[i] || ""}
                          onChange={(e) => setProductRowImageUrlInputs((prev) => ({ ...prev, [i]: e.target.value }))}
                          placeholder="或貼上圖片網址"
                          style={{ flex: 1, minWidth: 140, fontSize: 12, padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--card)", color: "var(--text)", boxSizing: "border-box" }}
                        />
                        <button className="btn small secondary" onClick={() => applyProductRowImageUrl(i)}>使用</button>
                        {uploadingRowImg === i && <span style={{ fontSize: 12, color: "#8A8779" }}>上傳中…</span>}
                      </div>
                      <div style={{ display: "flex", gap: 14, alignItems: "center", fontSize: 13 }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <input type="checkbox" checked={row.hasDiscountFlag} onChange={() => toggleProductRowFlag(i, "hasDiscountFlag")} />
                          是否滿減(v)
                        </label>
                        <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <input type="checkbox" checked={row.codAllowed} onChange={() => toggleProductRowFlag(i, "codAllowed")} />
                          開放取付
                        </label>
                      </div>
                    </div>
                  </div>
                ))}
                <div style={{ fontSize: 12, color: "#8A8779" }}>填好幾列，按「新增商品」會一次建立好幾筆同名不同款式（各自圖片）的商品</div>
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" onClick={saveProduct}>{productForm.id ? "儲存修改" : "新增商品"}</button>
            {productForm.id && <button className="btn secondary" onClick={() => { setProductForm(emptyProductForm); setProductRows([{ style: "", price: "0", imageUrl: "", hasDiscountFlag: true, codAllowed: true, shippingFee: "0" }]); }}>取消編輯</button>}
            <button className="btn secondary" onClick={() => { setActivePlanForProducts(null); setActiveSection("series"); }}>關閉商品管理</button>
          </div>
          <div style={{ fontSize: 13, marginTop: 6 }}>{productMsg}</div>
        </div>
          )}

          {activeSection === "members" && currentRole === "owner" && (
            <>
        <div className="auth-card">
          <h3>重設會員密碼</h3>
          <div className="id-row"><span className="id-label">帳號</span><input type="text" value={resetUsername} onChange={(e) => setResetUsername(e.target.value)} /></div>
          <button className="btn" onClick={doReset}>重設為 0000</button>
          <div style={{ fontSize: 13 }}>{resetMsg}</div>
        </div>

        <div className="auth-card">
          <h3>查詢會員／修改個人頁網址／刪除會員</h3>
          <div className="id-row">
            <span className="id-label">帳號</span>
            <input type="text" value={memberLookupUsername} onChange={(e) => setMemberLookupUsername(e.target.value)} onKeyDown={(e) => e.key === "Enter" && lookupMember()} />
            <button className="btn small" onClick={lookupMember}>查詢</button>
          </div>
          <div style={{ fontSize: 13 }}>{memberLookupMsg}</div>

          {memberLookupResult && (
            <div style={{ borderTop: "1px solid #EDE9DC", paddingTop: 10, marginTop: 4 }}>
              <div style={{ fontSize: 13, marginBottom: 4 }}>個人頁：<span style={{ wordBreak: "break-all" }}>{memberLookupResult.profileUrl}</span></div>
              {memberLookupResult.pendingProfileUrl && (
                <div style={{ fontSize: 12, color: "#B08E5A", marginBottom: 4 }}>審核中：{memberLookupResult.pendingProfileUrl}</div>
              )}
              <div style={{ fontSize: 13, marginBottom: 10 }}>
                Email：{memberLookupResult.email}（{memberLookupResult.emailVerified ? "已驗證" : "尚未驗證"}）
              </div>

              <div className="id-row">
                <span className="id-label">新個人頁</span>
                <input type="text" value={memberNewProfileUrl} onChange={(e) => setMemberNewProfileUrl(e.target.value)} placeholder="直接生效，不用審核" />
                <button className="btn small" onClick={saveMemberProfileUrl}>更新</button>
              </div>

              <button className="btn small danger" onClick={deleteMember} style={{ marginTop: 8 }}>刪除這個會員</button>
            </div>
          )}
        </div>

        <div className="auth-card">
          <h3>個人頁網址修改審核</h3>
          {profileRequests.length === 0 && <div style={{ fontSize: 13, color: "#8A8779" }}>目前沒有待審核的申請</div>}
          {profileRequests.map((r) => (
            <div key={r.memberId} style={{ padding: "8px 0", borderBottom: "1px dashed #EDE9DC" }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{r.username}</div>
              <div style={{ fontSize: 12, color: "#8A8779", margin: "4px 0" }}>
                目前：<span style={{ wordBreak: "break-all" }}>{r.currentProfileUrl}</span>
              </div>
              <div style={{ fontSize: 12, color: "#33415C", marginBottom: 8 }}>
                申請改成：<span style={{ wordBreak: "break-all" }}>{r.pendingProfileUrl}</span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn small" onClick={() => approveProfileRequest(r.memberId)}>核准</button>
                <button className="btn small danger" onClick={() => rejectProfileRequest(r.memberId)}>拒絕</button>
              </div>
            </div>
          ))}
          <div style={{ fontSize: 13, marginTop: 6 }}>{profileRequestsMsg}</div>
        </div>
            </>
          )}

          {activeSection === "orders" && currentRole === "owner" && (
            <div className="auth-card">
              <h3>訂單管理</h3>
              <div className="id-row">
                <span className="id-label">訂單編號</span>
                <input type="text" value={orderLookupNo} onChange={(e) => setOrderLookupNo(e.target.value)} onKeyDown={(e) => e.key === "Enter" && lookupOrder()} />
                <button className="btn small" onClick={lookupOrder}>查詢</button>
              </div>
              <div style={{ fontSize: 13 }}>{orderLookupMsg}</div>

              {orderLookupResult && (
                <div style={{ borderTop: "1px solid #EDE9DC", paddingTop: 10, marginTop: 4 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{orderLookupResult.planName}</div>
                  <div style={{ fontSize: 13, color: "#8A8779", margin: "4px 0" }}>
                    帳號：{orderLookupResult.username}　交易方式：{orderLookupResult.payment}
                  </div>
                  <div style={{ fontSize: 12, color: "#8A8779", marginBottom: 8 }}>
                    {new Date(orderLookupResult.createdAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}
                  </div>
                  {!editingOrderItems ? (
                    <>
                      {orderLookupResult.items.map((it: any, idx: number) => (
                        <div key={idx} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "4px 0", borderBottom: "1px dashed #EDE9DC" }}>
                          <span>{it.name}{it.style ? `（${it.style}）` : ""} x{it.qty}</span>
                          <span>NT$ {it.subtotal}</span>
                        </div>
                      ))}
                      <div style={{ textAlign: "right", fontWeight: 600, marginTop: 8 }}>合計 NT$ {orderLookupResult.total}</div>
                      {currentRole === "owner" && orderLookupResult.seriesId && (
                        <button className="btn small secondary" onClick={() => setEditingOrderItems(true)} style={{ marginTop: 8 }}>編輯商品／款式</button>
                      )}
                      {currentRole === "owner" && !orderLookupResult.seriesId && (
                        <div style={{ fontSize: 12, color: "#8A8779", marginTop: 8 }}>這張訂單沒有對應的系列了，沒辦法編輯商品內容（系列可能已被刪除）。</div>
                      )}
                    </>
                  ) : (
                    <div style={{ marginTop: 4 }}>
                      <p style={{ fontSize: 12, color: "#8A8779", margin: "0 0 8px" }}>
                        每一列選一個商品／款式跟數量，價格會用系列目前的商品目錄重新計算（不是沿用舊價格）。
                      </p>
                      {editItemRows.map((row, i) => {
                        const uniqueNames = Array.from(new Set(orderPlanProducts.map((p) => p.name)));
                        const stylesForName = orderPlanProducts.filter((p) => p.name === row.name);
                        return (
                          <div key={i} className="id-row" style={{ marginBottom: 8, flexWrap: "nowrap" }}>
                            <select
                              value={row.name}
                              onChange={(e) => {
                                const newName = e.target.value;
                                const firstStyle = orderPlanProducts.find((p) => p.name === newName)?.style || "";
                                setEditItemRows((rows) => rows.map((r, ri) => (ri === i ? { ...r, name: newName, style: firstStyle } : r)));
                              }}
                              style={{ flex: 2, minWidth: 0 }}
                            >
                              {uniqueNames.length === 0 && <option value={row.name}>{row.name}（系列商品目錄找不到，請改選）</option>}
                              {uniqueNames.map((n) => <option key={n} value={n}>{n}</option>)}
                            </select>
                            <select
                              value={row.style}
                              onChange={(e) => updateEditItemRow(i, "style", e.target.value)}
                              style={{ flex: 1, minWidth: 0 }}
                            >
                              {stylesForName.length === 0 && <option value={row.style}>{row.style || "（無款式）"}</option>}
                              {stylesForName.map((p) => <option key={p.id} value={p.style || ""}>{p.style || "（無款式）"}</option>)}
                            </select>
                            <input
                              type="number"
                              min={1}
                              value={row.qty}
                              onChange={(e) => updateEditItemRow(i, "qty", e.target.value)}
                              style={{ flex: "0 0 70px", minWidth: 70 }}
                            />
                            <button className="btn small secondary" onClick={() => removeEditItemRow(i)} disabled={editItemRows.length <= 1} style={{ flexShrink: 0 }}>刪除</button>
                          </div>
                        );
                      })}
                      <button className="btn small secondary" onClick={addEditItemRow} style={{ marginBottom: 10 }}>＋ 新增一項商品</button>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button className="btn small" onClick={saveOrderItems} disabled={savingOrderItems}>{savingOrderItems ? "儲存中…" : "儲存修改"}</button>
                        <button className="btn small secondary" onClick={() => { setEditingOrderItems(false); setEditItemRows(orderLookupResult.items.map((it: any) => ({ name: it.name, style: it.style || "", qty: String(it.qty) }))); }}>取消</button>
                      </div>
                    </div>
                  )}

                  <div className="id-row" style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #EDE9DC" }}>
                    <span className="id-label">已收金額</span>
                    <input type="number" min={0} value={orderPaidAmountInput} onChange={(e) => setOrderPaidAmountInput(e.target.value)} style={{ maxWidth: 140 }} />
                    <button className="btn small" onClick={savePaidAmount} disabled={savingPaidAmount}>{savingPaidAmount ? "儲存中…" : "更新"}</button>
                  </div>
                  <div style={{ fontSize: 12, color: "#8A8779" }}>填寫後會同步顯示在 Google Sheet 的付款狀態欄，也會讓使用者在自己的歷史訂單裡看到已收款確認。</div>

                  {currentRole === "owner" && (
                    <button className="btn small danger" onClick={deleteOrderAdmin} style={{ marginTop: 10 }}>刪除這張訂單</button>
                  )}
                </div>
              )}
            </div>
          )}

          {activeSection === "orders" && currentRole === "owner" && (
            <div className="auth-card">
              <h3>取消訂單審核</h3>
              {cancelRequests.length === 0 && <div style={{ fontSize: 13, color: "#8A8779" }}>目前沒有待審核的取消申請</div>}
              {cancelRequests.map((r) => (
                <div key={r.orderNo} style={{ padding: "8px 0", borderBottom: "1px dashed #EDE9DC" }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{r.planName}　<span style={{ fontWeight: 400, color: "#8A8779", fontSize: 12 }}>訂單編號 {r.orderNo}</span></div>
                  <div style={{ fontSize: 12, color: "#8A8779", margin: "4px 0" }}>
                    帳號：{r.username}　交易方式：{r.payment}　合計 NT$ {r.total}
                  </div>
                  <div style={{ fontSize: 12, color: "#8A8779", marginBottom: 8 }}>
                    申請時間：{new Date(r.cancelRequestedAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn small danger" onClick={() => approveCancelRequest(r.orderNo)}>核准（刪除訂單）</button>
                    <button className="btn small secondary" onClick={() => rejectCancelRequest(r.orderNo)}>拒絕（維持有效）</button>
                  </div>
                </div>
              ))}
              <div style={{ fontSize: 13, marginTop: 6 }}>{cancelRequestsMsg}</div>
            </div>
          )}

          {activeSection === "codes" && currentRole === "owner" && (
            <>
        <div className="auth-card">
          <h3>Staff 邀請碼管理</h3>
          <p style={{ fontSize: 12, color: "#8A8779", margin: 0 }}>
            每組邀請碼只能用一次，用過就會失效。owner 的邀請碼另外用固定的環境變數，不受這裡影響。
          </p>
          <button className="btn" onClick={generateInviteCode} disabled={generatingCode}>
            {generatingCode ? "產生中…" : "產生新的邀請碼"}
          </button>
          <div style={{ fontSize: 13 }}>{inviteCodesMsg}</div>

          {inviteCodes.length === 0 && <div style={{ fontSize: 13, color: "#8A8779" }}>目前沒有任何邀請碼</div>}
          {inviteCodes.map((c) => (
            <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px dashed #EDE9DC" }}>
              <div>
                <div style={{ fontSize: 14, fontFamily: "monospace" }}>{c.code}</div>
                <div style={{ fontSize: 12, color: c.used ? "#791F1F" : "#27500A" }}>
                  {c.used ? `已使用（${c.usedBy || "未知帳號"}）` : "未使用"}
                </div>
              </div>
              <span style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                {!c.used ? (
                  <>
                    <button className="btn small secondary" onClick={() => copyInviteCode(c.code)}>複製</button>
                    <button className="btn small danger" onClick={() => revokeInviteCode(c.id, false)}>撤銷</button>
                  </>
                ) : (
                  <button className="btn small danger" onClick={() => revokeInviteCode(c.id, true)}>刪除紀錄</button>
                )}
              </span>
            </div>
          ))}
        </div>

        <div className="auth-card">
          <h3>管理者名單</h3>
          {staffAdmins.length === 0 && <div style={{ fontSize: 13, color: "#8A8779" }}>目前沒有任何管理者帳號</div>}
          {staffAdmins.map((a) => (
            <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px dashed #EDE9DC" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {a.username}
                  <span style={{ fontWeight: 400, fontSize: 12, color: a.role === "owner" ? "#33415C" : "#8A8779", marginLeft: 8 }}>
                    {a.role === "owner" ? "最高權限" : "一般管理者"}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "#8A8779" }}>{a.email}（{a.emailVerified ? "已驗證" : "尚未驗證"}）</div>
              </div>
              {a.role !== "owner" && (
                <button className="btn small danger" onClick={() => deleteStaffAdmin(a.id, a.username)}>刪除</button>
              )}
            </div>
          ))}
          <div style={{ fontSize: 13, marginTop: 6 }}>{staffAdminsMsg}</div>
        </div>
            </>
          )}

          {activeSection === "legacy" && currentRole === "owner" && (
            <>
        <div className="auth-card">
          {renderCardHeader("importIdentities", "匯入身份名冊")}
          {!collapsedCards.importIdentities && (
          <>
          <p style={{ fontSize: 12, color: "#8A8779", margin: 0 }}>
            上傳 FB／LINE／Discord 暱稱對照表（CSV 檔案，從 Google 試算表「檔案 → 下載 → 逗號分隔值」匯出）。
          </p>
          <input type="file" accept=".csv" onChange={(e) => { setIdentitiesFile(e.target.files?.[0] || null); setIdentitiesResult(null); }} style={{ margin: "8px 0" }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn small secondary" onClick={() => submitIdentitiesFile(false)} disabled={!identitiesFile || identitiesImporting}>預覽</button>
            <button className="btn small" onClick={() => submitIdentitiesFile(true)} disabled={!identitiesFile || identitiesImporting}>確認匯入</button>
          </div>
          {identitiesImporting && <div style={{ fontSize: 13, marginTop: 6 }}>處理中…</div>}
          {identitiesResult && (
            <div style={{ fontSize: 13, marginTop: 8, maxHeight: 220, overflowY: "auto", border: "1px solid #EDE9DC", borderRadius: 8, padding: 8 }}>
              {identitiesResult.error ? (
                <div style={{ color: "#791F1F" }}>錯誤：{identitiesResult.error}</div>
              ) : (
                <>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>
                    {identitiesResult.commit ? `新增 ${identitiesResult.created} 筆，更新 ${identitiesResult.updated} 筆，略過 ${identitiesResult.skipped} 筆` : `共 ${identitiesResult.total} 筆（預覽模式，尚未寫入）`}
                  </div>
                  {identitiesResult.results?.map((r: any, i: number) => (
                    <div key={i} style={{ color: r.status === "error" ? "#791F1F" : r.status === "skip" ? "#8A8779" : "#33415C" }}>
                      [{r.row}] {r.label} {r.message ? `－ ${r.message}` : ""}
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
          </>
          )}
        </div>

        <div className="auth-card">
          {renderCardHeader("importManual", "匯入舊訂單（手動範本）")}
          {!collapsedCards.importManual && (
          <>
          <p style={{ fontSize: 12, color: "#8A8779", margin: 0 }}>
            格式不固定、沒辦法自動解析的舊分頁，用手動範本整理後上傳（.xlsx）。建議先「匯入身份名冊」再匯入這個，配對才會準。
          </p>
          <input type="file" accept=".xlsx" onChange={(e) => { setManualOrdersFile(e.target.files?.[0] || null); setManualOrdersResult(null); }} style={{ margin: "8px 0" }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn small secondary" onClick={() => submitManualOrdersFile(false)} disabled={!manualOrdersFile || manualOrdersImporting}>預覽</button>
            <button className="btn small" onClick={() => submitManualOrdersFile(true)} disabled={!manualOrdersFile || manualOrdersImporting}>確認匯入</button>
          </div>
          {manualOrdersImporting && <div style={{ fontSize: 13, marginTop: 6 }}>處理中…</div>}
          {manualOrdersResult && (
            <div style={{ fontSize: 13, marginTop: 8, maxHeight: 220, overflowY: "auto", border: "1px solid #EDE9DC", borderRadius: 8, padding: 8 }}>
              {manualOrdersResult.error ? (
                <div style={{ color: "#791F1F" }}>錯誤：{manualOrdersResult.error}</div>
              ) : (
                <>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>
                    共 {manualOrdersResult.groupCount} 張訂單
                    {manualOrdersResult.commit ? `，成功 ${manualOrdersResult.ok} 張，失敗 ${manualOrdersResult.failed} 張` : "（預覽模式，尚未寫入）"}
                    ，對不到身份 {manualOrdersResult.unmatched} 張
                  </div>
                  {manualOrdersResult.rowErrors?.map((e: string, i: number) => <div key={i} style={{ color: "#791F1F" }}>{e}</div>)}
                  {manualOrdersResult.results?.map((r: any, i: number) => (
                    <div key={i} style={{ color: r.status === "error" ? "#791F1F" : r.matched ? "#33415C" : r.ambiguous ? "#B08E5A" : "#8A8779" }}>
                      [{r.groupKey}] {r.label} {r.matched ? "✓對到身份" : r.ambiguous ? "⚠暱稱撞名" : "✗對不到身份"} {r.message ? `－ ${r.message}` : ""}
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
          </>
          )}
        </div>

        <div className="auth-card">
          {renderCardHeader("importSheet", "匯入舊訂單（自動解析舊試算表）")}
          {!collapsedCards.importSheet && (
          <>
          <p style={{ fontSize: 12, color: "#8A8779", margin: 0 }}>
            商品目錄+訂單明細的標準格式分頁，可以直接讀取解析。一次只處理一個分頁，避免逾時。
            這份舊試算表要先分享給服務帳戶（跟現在系統同步用的是同一組），權限給「檢視者」即可。
          </p>
          <div className="id-row">
            <span className="id-label">試算表ID</span>
            <input type="text" value={legacySheetId} onChange={(e) => setLegacySheetId(e.target.value)} placeholder="網址 /d/ 後面那一串" />
            <button className="btn small" onClick={loadLegacySheetTabs} disabled={legacySheetTabsLoading}>{legacySheetTabsLoading ? "讀取中…" : "讀取分頁清單"}</button>
          </div>
          <div style={{ fontSize: 13 }}>{legacySheetTabsMsg}</div>

          {legacySheetTabs.map((tab) => {
            const result = legacyTabResults[tab];
            const importing = legacyTabImporting[tab];
            return (
              <div key={tab} style={{ padding: "8px 0", borderBottom: "1px dashed #EDE9DC" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{tab}</span>
                  <span style={{ display: "flex", gap: 6 }}>
                    <button className="btn small secondary" onClick={() => importLegacySheetTabAction(tab, false)} disabled={importing}>預覽</button>
                    <button className="btn small" onClick={() => importLegacySheetTabAction(tab, true)} disabled={importing}>確認匯入</button>
                  </span>
                </div>
                {importing && <div style={{ fontSize: 12, color: "#8A8779" }}>處理中…</div>}
                {result && (
                  <div style={{ fontSize: 12, marginTop: 4, maxHeight: 160, overflowY: "auto" }}>
                    {result.error ? (
                      <div style={{ color: "#791F1F" }}>錯誤：{result.error}</div>
                    ) : result.standardFormat === false ? (
                      <div style={{ color: "#B08E5A" }}>{result.message}</div>
                    ) : (
                      <>
                        <div style={{ fontWeight: 600 }}>
                          共 {result.orderCount} 張訂單
                          {result.commit ? `，成功 ${result.ok} 張，失敗 ${result.failed} 張` : "（預覽模式，尚未寫入）"}
                          ，對不到身份 {result.unmatched} 張
                        </div>
                        {result.results?.map((r: any, i: number) => (
                          <div key={i} style={{ color: r.status === "error" ? "#791F1F" : r.matched ? "#33415C" : r.ambiguous ? "#B08E5A" : "#8A8779" }}>
                            [{r.orderNo}] {r.label} {r.matched ? "✓" : r.ambiguous ? "⚠撞名" : "✗未配對"} {r.message ? `－ ${r.message}` : ""}
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          </>
          )}
        </div>

        <div className="auth-card">
          {renderCardHeader("pendingRequests", "待處理請求")}
          {!collapsedCards.pendingRequests && (
          <>
          <p style={{ fontSize: 12, color: "#8A8779", margin: 0 }}>
            舊會員在「舊會員整合」頁面輸入暱稱找不到資料時，送出的協助請求。
          </p>
          {legacyRequests.length === 0 && <div style={{ fontSize: 13, color: "#8A8779" }}>目前沒有待處理的請求</div>}
          {legacyRequests.map((r) => (
            <div key={r.id} style={{ padding: "8px 0", borderBottom: "1px dashed #EDE9DC" }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{r.inputNickname}</div>
              {r.contactNote && <div style={{ fontSize: 12, color: "#8A8779", margin: "4px 0" }}>補充：{r.contactNote}</div>}
              <div style={{ fontSize: 12, color: "#8A8779", marginBottom: 8 }}>{new Date(r.createdAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn small" onClick={() => resolveLegacyRequest(r.id, "resolve")}>標記已處理</button>
                <button className="btn small secondary" onClick={() => resolveLegacyRequest(r.id, "reject")}>不予處理</button>
              </div>
            </div>
          ))}
          <div style={{ fontSize: 13, marginTop: 6 }}>{legacyRequestsMsg}</div>
          </>
          )}
        </div>

        <div className="auth-card">
          {renderCardHeader("identitySearch", "身份名冊查詢")}
          {!collapsedCards.identitySearch && (
          <>
          <div className="id-row">
            <span className="id-label">搜尋</span>
            <input
              type="text"
              value={legacyIdentitySearch}
              onChange={(e) => setLegacyIdentitySearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadLegacyIdentities()}
              placeholder="暱稱或FB網址"
            />
            <button className="btn small" onClick={loadLegacyIdentities}>查詢</button>
          </div>
          <div style={{ fontSize: 13 }}>{legacyIdentitiesMsg}</div>
          {legacyIdentities.length === 0 && <div style={{ fontSize: 13, color: "#8A8779" }}>沒有符合的資料</div>}
          {legacyIdentities.map((id) => (
            <div key={id.id} style={{ padding: "8px 0", borderBottom: "1px dashed #EDE9DC" }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {[id.fbNickname, id.lineNickname, id.discordNickname, id.dcAccountName].filter(Boolean).join(" / ") || "(無暱稱)"}
              </div>
              <div style={{ fontSize: 12, color: "#8A8779", margin: "4px 0", wordBreak: "break-all" }}>{id.fbProfileUrl}</div>
              <div style={{ fontSize: 12, color: id.claimed ? "#27500A" : "#8A8779" }}>
                {id.claimed ? `已被「${id.claimedByUsername || "未知帳號"}」認領（${new Date(id.claimedAt).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei" })}）` : "尚未認領"}
              </div>
            </div>
          ))}
          </>
          )}
        </div>

        <div className="auth-card">
          {renderCardHeader("unmatchedOrders", "配對不到身份的舊訂單")}
          {!collapsedCards.unmatchedOrders && (
          <>
          <p style={{ fontSize: 12, color: "#8A8779", margin: 0 }}>
            匯入舊資料時對不到身份名冊的訂單，可以在這裡查到內容，手動指定給正確的會員帳號（帳號要已經存在）。
          </p>
          {legacyUnmatchedOrders.length === 0 && <div style={{ fontSize: 13, color: "#8A8779" }}>目前沒有待處理的訂單</div>}
          {legacyUnmatchedOrders.map((o) => (
            <div key={o.orderNo} style={{ padding: "8px 0", borderBottom: "1px dashed #EDE9DC" }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{o.planName}　<span style={{ fontWeight: 400, color: "#8A8779", fontSize: 12 }}>訂單編號 {o.orderNo}</span></div>
              <div style={{ fontSize: 12, color: "#8A8779", margin: "4px 0" }}>
                原暱稱：{o.username}　交易方式：{o.payment}　合計 NT$ {o.total}　{new Date(o.createdAt).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei" })}
              </div>
              {o.items.map((it: any, idx: number) => (
                <div key={idx} style={{ fontSize: 13, color: "#33415C" }}>・{it.name}{it.style ? `（${it.style}）` : ""} x{it.qty}</div>
              ))}
              <div className="id-row" style={{ marginTop: 8 }}>
                <span className="id-label">指定給</span>
                <input
                  type="text"
                  placeholder="正確的會員帳號"
                  value={legacyReassignTarget[o.orderNo] || ""}
                  onChange={(e) => setLegacyReassignTarget((prev) => ({ ...prev, [o.orderNo]: e.target.value }))}
                />
                <button className="btn small" onClick={() => reassignLegacyOrder(o.orderNo)}>改派</button>
                <button className="btn small danger" onClick={() => deleteLegacyUnmatchedOrder(o.orderNo)}>刪除</button>
              </div>
            </div>
          ))}
          <div style={{ fontSize: 13, marginTop: 6 }}>{legacyUnmatchedMsg}</div>
          </>
          )}
        </div>

        <div className="auth-card">
          {renderCardHeader("duplicateOrders", "掃描重複訂單")}
          {!collapsedCards.duplicateOrders && (
          <>
          <p style={{ fontSize: 12, color: "#8A8779", margin: 0 }}>
            只掃描「舊資料匯入」建立的訂單（前台客人正常下單不會列入，因為本來就可能真的買兩次一樣的東西）。
            同一個人、同系列底下，商品內容跟交易方式一模一樣，很可能是舊資料被重複匯入造成的。
            這裡列出來讓你確認，預設會勾選「保留最早那筆、其餘刪除」，可以自己調整勾選後再刪除。
          </p>
          <button className="btn small" onClick={loadDuplicateGroups} disabled={duplicateScanning} style={{ marginTop: 8 }}>
            {duplicateScanning ? "掃描中…" : "開始掃描"}
          </button>
          <div style={{ fontSize: 13, margin: "8px 0" }}>{duplicateScanMsg}</div>
          {duplicateGroups.map((g, gi) => (
            <div key={gi} style={{ padding: "8px 0", borderBottom: "1px dashed #EDE9DC" }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{g.planName}</div>
              {g.orders.map((o: any) => (
                <label key={o.orderNo} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, padding: "4px 0", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={!!duplicateSelected[o.orderNo]}
                    onChange={(e) => setDuplicateSelected((prev) => ({ ...prev, [o.orderNo]: e.target.checked }))}
                    style={{ marginTop: 3 }}
                  />
                  <span>
                    訂單 {o.orderNo}　帳號：{o.username}{o.legacyUnmatched ? "（未配對身份）" : ""}　{o.payment}　
                    {new Date(o.createdAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}
                    <br />
                    <span style={{ color: "#8A8779" }}>
                      {o.items.map((it: any, i: number) => `${it.name}${it.style ? `(${it.style})` : ""}x${it.qty}`).join("、")}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          ))}
          {duplicateGroups.length > 0 && (
            <button className="btn small danger" onClick={deleteDuplicateOrders} disabled={duplicateDeleting} style={{ marginTop: 8 }}>
              {duplicateDeleting ? "刪除中…" : "刪除勾選的訂單"}
            </button>
          )}
          </>
          )}
        </div>
            </>
          )}

          {activeSection === "announcements" && currentRole === "owner" && (
            <>
        <div className="auth-card">
          <h3>結帳頁說明欄</h3>
          <p style={{ fontSize: 12, color: "#8A8779", margin: 0 }}>
            顯示在結帳頁面最上方（返回購物車上面），留空就不顯示。可以用來放取付/匯款相關的提醒事項。
          </p>
          <textarea
            value={checkoutNoticeInput}
            onChange={(e) => setCheckoutNoticeInput(e.target.value)}
            rows={2}
            style={{ width: "100%", marginTop: 8, padding: 8, border: "1px solid #EDE9DC", borderRadius: 8, fontFamily: "inherit", fontSize: 14, resize: "vertical" }}
            placeholder="留空表示不顯示"
          />
          <div style={{ fontSize: 13, margin: "6px 0" }}>{checkoutNoticeMsg}</div>
          <button className="btn small" onClick={saveCheckoutNotice} disabled={checkoutNoticeSaving}>{checkoutNoticeSaving ? "儲存中…" : "儲存"}</button>
        </div>

        <div className="auth-card">
          <h3>發佈新公告</h3>
          <p style={{ fontSize: 12, color: "#8A8779", margin: 0 }}>
            會顯示在首頁最上方（使用者可以關掉，但下次進來會再出現），也會出現在鈴鐺圖示的公告清單最上面。
          </p>
          <textarea
            value={newAnnouncementContent}
            onChange={(e) => setNewAnnouncementContent(e.target.value)}
            rows={3}
            style={{ width: "100%", marginTop: 8, padding: 8, border: "1px solid #EDE9DC", borderRadius: 8, fontFamily: "inherit", fontSize: 14, resize: "vertical" }}
            placeholder="輸入公告內容…"
          />
          <div style={{ fontSize: 13, margin: "6px 0" }}>{announcementMsg}</div>
          <button className="btn" onClick={postAnnouncement} disabled={announcementPosting}>{announcementPosting ? "發佈中…" : "發佈公告"}</button>
        </div>

        <div className="auth-card">
          <h3>公告歷史紀錄</h3>
          {announcementsList.length === 0 && <div style={{ fontSize: 13, color: "#8A8779" }}>還沒有發佈過任何公告</div>}
          {announcementsList.map((a, idx) => (
            <div key={a.id} style={{ padding: "8px 0", borderBottom: "1px dashed #EDE9DC" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  {idx === 0 && <span style={{ fontSize: 11, background: "#FDF6EC", color: "#B08E5A", borderRadius: 999, padding: "2px 8px", marginRight: 6 }}>目前顯示中</span>}
                  <div style={{ fontSize: 12, color: "#8A8779", margin: "4px 0" }}>{new Date(a.createdAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}</div>
                  <div style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{a.content}</div>
                </div>
                <button className="btn small danger" onClick={() => deleteAnnouncement(a.id)} style={{ flexShrink: 0 }}>刪除</button>
              </div>
            </div>
          ))}
        </div>
            </>
          )}
        </main>
      </div>

      {floatingToast && (
        <div
          style={{
            position: "fixed", bottom: 20, right: 20, maxWidth: 360,
            background: "#33415C", color: "#fff", padding: "12px 16px", borderRadius: 10,
            fontSize: 14, boxShadow: "0 4px 16px rgba(0,0,0,.2)", zIndex: 9999,
          }}
        >
          {floatingToast}
        </div>
      )}
    </div>
  );
}

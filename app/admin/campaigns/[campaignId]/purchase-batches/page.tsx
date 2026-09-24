"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { callJson, fetchJson } from "@/lib/adminClient";

/**
 * 3.3節：可搜尋過濾的目標採購單輸入框，依單號關鍵字搜尋，避免採購單數量一多下拉選單無法操作。
 * 輸入文字即時過濾清單，點選其中一項才會真正選定（不能亂打不存在的東西）。
 */
function SearchableBatchPicker({
  batches,
  value,
  search,
  onSearchChange,
  onSelect,
}: {
  batches: { id: string; label: string }[];
  value: string;
  search: string;
  onSearchChange: (v: string) => void;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = batches.find((b) => b.id === value);
  const filtered = search.trim()
    ? batches.filter((b) => b.label.toLowerCase().includes(search.trim().toLowerCase()))
    : batches;

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <input
        type="text"
        placeholder="搜尋採購單…"
        value={open ? search : selected?.label || search}
        onFocus={() => { setOpen(true); onSearchChange(""); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => onSearchChange(e.target.value)}
        style={{ padding: 6, width: 160 }}
      />
      {open && (
        <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 20, background: "#fff", border: "1px solid var(--line)", borderRadius: 8, maxHeight: 180, overflowY: "auto", width: 220, boxShadow: "0 4px 12px rgba(0,0,0,.1)" }}>
          {filtered.length === 0 && <div style={{ padding: 8, fontSize: 12, color: "#8A8779" }}>沒有符合的採購單</div>}
          {filtered.map((b) => (
            <div
              key={b.id}
              onMouseDown={() => { onSelect(b.id); setOpen(false); }}
              style={{ padding: "6px 10px", fontSize: 13, cursor: "pointer" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#F1EFE8")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {b.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** 原幣金額格式化：保留小數（商品單價可能有小數，例如 19.9），最多兩位 */
const fmtAmount = (n: number) =>
  new Intl.NumberFormat("zh-TW", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);

export default function PurchaseBatchesPage() {
  const params = useParams();
  const router = useRouter();
  const campaignId = String(params.campaignId || "");

  const [campaign, setCampaign] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [tab, setTab] = useState<"batches" | "gap" | "extra" | "backorders" | "reassign">("batches");
  const [backorders, setBackorders] = useState<any[]>([]);
  const [reassignNeeding, setReassignNeeding] = useState<any[]>([]);
  const [unassignedPool, setUnassignedPool] = useState<any[]>([]);
  const [purchaseBatches, setPurchaseBatches] = useState<any[]>([]);
  const [batchGiftGap, setBatchGiftGap] = useState<any[]>([]);
  const [extraPurchases, setExtraPurchases] = useState<any[]>([]);
  const [vendorPlatforms, setVendorPlatforms] = useState<any[]>([]);
  const [campaignGiftStyles, setCampaignGiftStyles] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [floatingToast, setFloatingToast] = useState("");

  const [newBatchPlatformId, setNewBatchPlatformId] = useState("");
  const [autoSplitting, setAutoSplitting] = useState(false);
  const [assignQtyByItem, setAssignQtyByItem] = useState<Record<string, string>>({});
  const [assignTargetBatchByItem, setAssignTargetBatchByItem] = useState<Record<string, string>>({});
  const [assignSearchByItem, setAssignSearchByItem] = useState<Record<string, string>>({});
  const [selectedBatchIds, setSelectedBatchIds] = useState<Set<string>>(new Set());
  const [draggedItem, setDraggedItem] = useState<{ orderItemId: string; qty: number; sourceBatchId: string; batchItemId: string } | null>(null);
  const [splitQtyByItem, setSplitQtyByItem] = useState<Record<string, string>>({});
  const [splitTargetByItem, setSplitTargetByItem] = useState<Record<string, string>>({});
  const [splitSearchByItem, setSplitSearchByItem] = useState<Record<string, string>>({});
  const [splitOpenForItem, setSplitOpenForItem] = useState<string | null>(null);
  // 3.3節：顧客欄位可搜尋下拉直接編輯對調
  const [customerEditForItem, setCustomerEditForItem] = useState<string | null>(null);
  const [customerCandidates, setCustomerCandidates] = useState<any[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");

  async function openCustomerEdit(batchItemId: string, productName: string, style: string) {
    setCustomerEditForItem(batchItemId);
    setCustomerSearch("");
    setCustomerCandidates([]);
    try {
      const d = await fetchJson(`/api/admin/campaigns/${campaignId}/order-items-by-product?productName=${encodeURIComponent(productName)}&style=${encodeURIComponent(style || "")}`);
      setCustomerCandidates(d.items || []);
    } catch (e: any) {
      setMsg(e.message || "載入顧客清單失敗");
    }
  }

  async function reassignCustomer(batchId: string, batchItemId: string, targetOrderItemId: string) {
    setMsg("");
    try {
      const d = await callJson(`/api/admin/campaigns/${campaignId}/purchase-batches/${batchId}/items/${batchItemId}`, "PATCH", { targetOrderItemId });
      setMsg(d.message || "已改指派");
      setCustomerEditForItem(null);
      loadPurchaseBatchesData();
    } catch (e: any) {
      setMsg(e.message || "改指派失敗");
    }
  }
  const [giftPickByBatch, setGiftPickByBatch] = useState<Record<string, string>>({});
  const [giftQtyByBatch, setGiftQtyByBatch] = useState<Record<string, string>>({});
  const [giftErrorByBatch, setGiftErrorByBatch] = useState<Record<string, string>>({});
  // 一張額外採購單可以買好幾個款式，所以款式是多列的
  const [extraItemRows, setExtraItemRows] = useState<{ giftStyleId: string; qty: string; subtotal: string }[]>([
    { giftStyleId: "", qty: "", subtotal: "" },
  ]);
  const [extraNote, setExtraNote] = useState("");
  const [extraOrderNumber, setExtraOrderNumber] = useState("");

  // ---- 到貨追蹤子頁面 ----
  const [activeBatchForArrival, setActiveBatchForArrival] = useState<any | null>(null);
  const [arrivalTree, setArrivalTree] = useState<any[]>([]);
  const [arrivalUnshippedPool, setArrivalUnshippedPool] = useState<any[]>([]);
  const [newOrderNumber, setNewOrderNumber] = useState("");
  const [newTrackingByOrderNumber, setNewTrackingByOrderNumber] = useState<Record<string, string>>({});
  const [assignShipQtyByPoolItem, setAssignShipQtyByPoolItem] = useState<Record<string, string>>({});
  const [assignShipTargetByPoolItem, setAssignShipTargetByPoolItem] = useState<Record<string, string>>({});

  useEffect(() => {
    if (msg) {
      setFloatingToast(msg);
      const t = setTimeout(() => setFloatingToast(""), 4000);
      return () => clearTimeout(t);
    }
  }, [msg]);

  useEffect(() => {
    if (!campaignId) return;
    (async () => {
      try {
        const dc = await fetchJson(`/api/admin/campaigns/${campaignId}`);
        setCampaign(dc.campaign);
        await Promise.all([loadPurchaseBatchesData(), loadVendorRules()]);
      } catch (e: any) {
        setLoadError(e.message || "載入失敗");
      } finally {
        setLoading(false);
      }
    })();
  }, [campaignId]);

  async function loadPurchaseBatchesData() {
    const [d1, d2, d3, d4, d5, d6] = await Promise.all([
      fetchJson(`/api/admin/campaigns/${campaignId}/unassigned-items`),
      fetchJson(`/api/admin/campaigns/${campaignId}/purchase-batches`),
      fetchJson(`/api/admin/campaigns/${campaignId}/gift-gap-overview`),
      fetchJson(`/api/admin/campaigns/${campaignId}/extra-purchases`),
      fetchJson(`/api/admin/campaigns/${campaignId}/backorders`),
      fetchJson(`/api/admin/campaigns/${campaignId}/reassign-candidates`),
    ]);
    setUnassignedPool(d1.pool || []);
    setPurchaseBatches(d2.batches || []);
    setBatchGiftGap(d3.overview || []);
    setExtraPurchases(d4.extraPurchases || []);
    setBackorders(d5.backorders || []);
    setReassignNeeding(d6.needing || []);
  }

  async function loadVendorRules() {
    const d2 = await fetchJson(`/api/admin/campaigns/${campaignId}/vendor-platforms`);
    setVendorPlatforms(d2.platforms || []);
    const d3 = await fetchJson(`/api/admin/campaigns/${campaignId}/gift-styles`);
    setCampaignGiftStyles(d3.giftStyles || []);
  }

  async function doReassign(shipmentItemId: string, targetOrderItemId: string) {
    setMsg("");
    try {
      const d = await callJson(`/api/admin/shipment-items/${shipmentItemId}/reassign`, "POST", { targetOrderItemId });
      setMsg(d.message || "挪用成功");
      loadPurchaseBatchesData();
    } catch (e: any) {
      setMsg(e.message || "挪用失敗");
    }
  }

  async function autoSplit() {
    setMsg("");
    setAutoSplitting(true);
    try {
      const d = await callJson(`/api/admin/campaigns/${campaignId}/purchase-batches/auto-split`, "POST", {});
      setMsg(`已自動建立 ${d.createdBatchCount} 張採購單（${d.platformSummary}）${d.assignedGiftCount ? `，並配置 ${d.assignedGiftCount} 個滿贈（依缺口由大到小分配，剩餘名額留給你自行決定）` : ""}，可以再手動微調`);
      loadPurchaseBatchesData();
    } catch (e: any) {
      setMsg(e.message || "自動分配失敗");
    } finally {
      setAutoSplitting(false);
    }
  }

  async function splitMoveItem(sourceBatchId: string, batchItemId: string, orderItemId: string, totalQty: number, moveQty: number, targetBatchId: string) {
    if (!isFinite(moveQty) || moveQty <= 0 || moveQty > totalQty) return setMsg("搬移數量格式不正確");
    if (!targetBatchId) return setMsg("請選擇目標採購單");
    setMsg("");
    try {
      // 先整筆刪除，讓這個訂單品項的數量重新變成「可分配」，再分別建回原採購單(剩餘)跟目標採購單(搬走的部分)
      const remain = totalQty - moveQty;
      const adjusted: string[] = [];
      // 還有剩餘要建回去時，刪除當下先不夾限滿贈（不然會用「全部搬走」的金額去夾，多砍）
      const d1 = await callJson(`/api/admin/campaigns/${campaignId}/purchase-batches/${sourceBatchId}/items`, "DELETE", { batchItemId, skipGiftClamp: remain > 0 });
      if (d1?.adjustedGifts) adjusted.push(...d1.adjustedGifts);
      if (remain > 0) {
        const d2 = await callJson(`/api/admin/campaigns/${campaignId}/purchase-batches/${sourceBatchId}/items`, "POST", { orderItemId, qty: remain });
        if (d2?.adjustedGifts) adjusted.push(...d2.adjustedGifts);
      }
      await callJson(`/api/admin/campaigns/${campaignId}/purchase-batches/${targetBatchId}/items`, "POST", { orderItemId, qty: moveQty });
      setSplitOpenForItem(null);
      if (adjusted.length > 0) setMsg(`採購單金額變少，已自動調整滿贈配置：${adjusted.join("；")}`);
      loadPurchaseBatchesData();
    } catch (e: any) {
      setMsg(e.message || "搬移失敗");
    }
  }

  async function moveItemToBatch(targetBatchId: string) {
    if (!draggedItem) return;
    if (draggedItem.sourceBatchId === targetBatchId) { setDraggedItem(null); return; }
    setMsg("");
    try {
      const d = await callJson(`/api/admin/campaigns/${campaignId}/purchase-batches/${draggedItem.sourceBatchId}/items`, "DELETE", { batchItemId: draggedItem.batchItemId });
      await callJson(`/api/admin/campaigns/${campaignId}/purchase-batches/${targetBatchId}/items`, "POST", { orderItemId: draggedItem.orderItemId, qty: draggedItem.qty });
      if (d?.adjustedGifts) setMsg(`原採購單金額變少，已自動調整滿贈配置：${d.adjustedGifts.join("；")}`);
      loadPurchaseBatchesData();
    } catch (e: any) {
      setMsg(e.message || "搬動失敗");
    }
    setDraggedItem(null);
  }

  async function createPurchaseBatch() {
    setMsg("");
    try {
      await callJson(`/api/admin/campaigns/${campaignId}/purchase-batches`, "POST", { platformId: newBatchPlatformId || null });
      setNewBatchPlatformId("");
      loadPurchaseBatchesData();
    } catch (e: any) {
      setMsg(e.message || "建立失敗");
    }
  }

  async function assignItemToBatch(orderItemId: string) {
    const batchId = assignTargetBatchByItem[orderItemId];
    const qty = Number(assignQtyByItem[orderItemId]);
    if (!batchId) return setMsg("請先選擇要分配進哪張採購單");
    if (!isFinite(qty) || qty <= 0) return setMsg("請輸入要分配的數量");
    try {
      await callJson(`/api/admin/campaigns/${campaignId}/purchase-batches/${batchId}/items`, "POST", { orderItemId, qty });
      setAssignQtyByItem((prev) => ({ ...prev, [orderItemId]: "" }));
      loadPurchaseBatchesData();
    } catch (e: any) {
      setMsg(e.message || "分配失敗");
    }
  }

  async function removeBatchItem(batchId: string, batchItemId: string) {
    const d = await callJson(`/api/admin/campaigns/${campaignId}/purchase-batches/${batchId}/items`, "DELETE", { batchItemId });
    if (d?.adjustedGifts) setMsg(`採購單金額變少，已自動調整滿贈配置：${d.adjustedGifts.join("；")}`);
    loadPurchaseBatchesData();
  }

  async function updateExtraAdjustment(batchId: string, text: string) {
    try {
      await callJson(`/api/admin/campaigns/${campaignId}/purchase-batches/${batchId}`, "PATCH", { extraAdjustmentText: text });
      loadPurchaseBatchesData();
    } catch (e: any) {
      setMsg(e.message || "更新失敗");
    }
  }

  async function changeBatchPlatform(batchId: string, platformId: string) {
    const d = await callJson(`/api/admin/campaigns/${campaignId}/purchase-batches/${batchId}`, "PATCH", { platformId: platformId || null });
    if (d.adjustedGifts) {
      setMsg(`換平台後已自動調整滿贈配置：${d.adjustedGifts.join("；")}`);
    }
    loadPurchaseBatchesData();
  }

  async function deleteBatch(batchId: string) {
    if (!confirm("確定要刪除這張採購單嗎？裡面的品項會回到未分配池。")) return;
    await callJson(`/api/admin/campaigns/${campaignId}/purchase-batches/${batchId}`, "DELETE", {});
    loadPurchaseBatchesData();
  }

  const [syncingCostSheet, setSyncingCostSheet] = useState(false);
  async function syncCostSheet() {
    setMsg("");
    setSyncingCostSheet(true);
    try {
      const d = await callJson(`/api/admin/campaigns/${campaignId}/cost-sheet`, "POST", {});
      setMsg(`成本表已同步到 Google 試算表的「${d.tabName}」分頁（你自己填的匯率、每公斤運費、其他成本都會保留）`);
    } catch (e: any) {
      setMsg(e.message || "同步失敗");
    } finally {
      setSyncingCostSheet(false);
    }
  }

  async function resetAndAutoSplit() {
    const purchasedCount = purchaseBatches.filter((b: any) => (b.vendorOrderNumbers || []).length > 0).length;
    const deletableCount = purchaseBatches.length - purchasedCount;
    if (deletableCount === 0) return setMsg("沒有可以重新分配的採購單（全部都已登記廠商訂單編號）");
    if (!confirm(`會清空 ${deletableCount} 張尚未採購的採購單，把品項全部重新拆一次。\n已登記廠商訂單編號的 ${purchasedCount} 張不會被動到。\n確定要繼續嗎？`)) return;
    setMsg("");
    setAutoSplitting(true);
    try {
      const r = await callJson(`/api/admin/campaigns/${campaignId}/purchase-batches/reset-split`, "POST", {});
      const d = await callJson(`/api/admin/campaigns/${campaignId}/purchase-batches/auto-split`, "POST", {});
      setMsg(
        `已清空 ${r.deletedCount} 張採購單並重新分配，建立 ${d.createdBatchCount} 張（${d.platformSummary}）` +
        `${d.assignedGiftCount ? `，配置 ${d.assignedGiftCount} 個滿贈` : ""}` +
        `${r.keptCount ? `；保留 ${r.keptCount} 張已採購的採購單` : ""}`
      );
      setSelectedBatchIds(new Set());
      loadPurchaseBatchesData();
    } catch (e: any) {
      setMsg(e.message || "重新分配失敗");
      loadPurchaseBatchesData();
    } finally {
      setAutoSplitting(false);
    }
  }

  function toggleBatchSelect(batchId: string) {
    setSelectedBatchIds((prev) => {
      const next = new Set(prev);
      if (next.has(batchId)) next.delete(batchId);
      else next.add(batchId);
      return next;
    });
  }

  async function deleteSelectedBatches() {
    if (selectedBatchIds.size === 0) return;
    if (!confirm(`確定要刪除選取的 ${selectedBatchIds.size} 張採購單嗎？裡面的品項會回到未分配池。`)) return;
    setMsg("");
    try {
      for (const id of Array.from(selectedBatchIds)) {
        await callJson(`/api/admin/campaigns/${campaignId}/purchase-batches/${id}`, "DELETE", {});
      }
      setMsg(`已刪除 ${selectedBatchIds.size} 張採購單`);
      setSelectedBatchIds(new Set());
      loadPurchaseBatchesData();
    } catch (e: any) {
      setMsg(e.message || "刪除失敗");
      loadPurchaseBatchesData();
    }
  }

  async function setBatchGiftQty(batchId: string, giftStyleId: string, qty: number) {
    if (!giftStyleId) return;
    try {
      await callJson(`/api/admin/campaigns/${campaignId}/purchase-batches/${batchId}/gifts`, "PUT", { giftStyleId, qty });
      setGiftErrorByBatch((prev) => ({ ...prev, [batchId]: "" }));
      setGiftPickByBatch((prev) => ({ ...prev, [batchId]: "" }));
      loadPurchaseBatchesData();
    } catch (e: any) {
      setGiftErrorByBatch((prev) => ({ ...prev, [batchId]: e.message || "設定失敗" }));
    }
  }

  function editBatchGift(batchId: string, giftStyleId: string, qty: number) {
    setGiftPickByBatch((prev) => ({ ...prev, [batchId]: giftStyleId }));
    setGiftQtyByBatch((prev) => ({ ...prev, [batchId]: String(qty) }));
  }

  async function removeBatchGift(batchId: string, giftStyleId: string) {
    try {
      await callJson(`/api/admin/campaigns/${campaignId}/purchase-batches/${batchId}/gifts`, "PUT", { giftStyleId, qty: 0 });
      loadPurchaseBatchesData();
    } catch (e: any) {
      setMsg(e.message || "刪除失敗");
    }
  }

  async function addExtraPurchase() {
    setMsg("");
    const items = extraItemRows
      .filter((r) => r.giftStyleId)
      .map((r) => ({ giftStyleId: r.giftStyleId, qty: Number(r.qty), subtotal: r.subtotal }));
    if (items.length === 0) return setMsg("請至少選一個滿贈款式");
    if (items.some((it) => !isFinite(it.qty) || it.qty <= 0)) return setMsg("每個款式都要填正確的數量");
    try {
      await callJson(`/api/admin/campaigns/${campaignId}/extra-purchases`, "POST", {
        items, note: extraNote, orderNumber: extraOrderNumber,
      });
      setExtraItemRows([{ giftStyleId: "", qty: "", subtotal: "" }]); setExtraNote(""); setExtraOrderNumber("");
      loadPurchaseBatchesData();
    } catch (e: any) {
      setMsg(e.message || "新增失敗");
    }
  }

  async function deleteExtraPurchase(id: string) {
    await callJson(`/api/admin/campaigns/${campaignId}/extra-purchases/${id}`, "DELETE", {});
    loadPurchaseBatchesData();
  }

  // ---- 額外採購的到貨追蹤（訂單編號 → 物流單號 → 到貨勾選，可以分批到貨）----
  const [expandedExtraId, setExpandedExtraId] = useState<string | null>(null);
  const [extraNewOrderNumber, setExtraNewOrderNumber] = useState<Record<string, string>>({});
  const [extraNewShipment, setExtraNewShipment] = useState<Record<string, { tracking: string; qty: string; weight: string }>>({});
  // 這張物流單要裝哪個款式、幾個（到貨勾選在這一層，所以同一張物流單的不同款式可以各自到貨）
  const [extraNewShipmentItem, setExtraNewShipmentItem] = useState<Record<string, { itemId: string; qty: string }>>({});
  const [extraTrackMsg, setExtraTrackMsg] = useState<Record<string, string>>({});

  /** 只重抓額外採購清單，不重抓整頁（勾到貨時才不會卡） */
  async function reloadExtraPurchases() {
    try {
      const d = await fetchJson(`/api/admin/campaigns/${campaignId}/extra-purchases`);
      setExtraPurchases(d.extraPurchases || []);
    } catch {}
  }

  async function extraTracking(purchaseId: string, method: string, body: any) {
    setExtraTrackMsg((prev) => ({ ...prev, [purchaseId]: "" }));
    try {
      await callJson(`/api/admin/campaigns/${campaignId}/extra-purchases/${purchaseId}/tracking`, method, body);
      await reloadExtraPurchases();
      return true;
    } catch (e: any) {
      setExtraTrackMsg((prev) => ({ ...prev, [purchaseId]: e.message || "操作失敗" }));
      await reloadExtraPurchases();
      return false;
    }
  }

  async function addExtraOrderNumber(purchaseId: string) {
    const orderNumber = (extraNewOrderNumber[purchaseId] || "").trim();
    if (!orderNumber) return setExtraTrackMsg((prev) => ({ ...prev, [purchaseId]: "請輸入廠商訂單編號" }));
    if (await extraTracking(purchaseId, "POST", { action: "addOrderNumber", orderNumber })) {
      setExtraNewOrderNumber((prev) => ({ ...prev, [purchaseId]: "" }));
    }
  }

  async function addExtraShipment(purchaseId: string, orderNumberId: string) {
    const s = extraNewShipment[orderNumberId] || { tracking: "", qty: "", weight: "" };
    if (await extraTracking(purchaseId, "POST", { action: "addShipment", orderNumberId, trackingNumber: s.tracking, weightKg: s.weight })) {
      setExtraNewShipment((prev) => ({ ...prev, [orderNumberId]: { tracking: "", qty: "", weight: "" } }));
    }
  }

  /** 把某個款式裝進這張物流單（數量與到貨勾選都在這一層） */
  async function addExtraShipmentItem(purchaseId: string, shipmentId: string) {
    const pick = extraNewShipmentItem[shipmentId] || { itemId: "", qty: "" };
    if (!pick.itemId) return setExtraTrackMsg((prev) => ({ ...prev, [purchaseId]: "請選擇這張物流單裝了哪個款式" }));
    if (await extraTracking(purchaseId, "POST", { action: "addShipmentItem", shipmentId, extraPurchaseItemId: pick.itemId, qty: pick.qty })) {
      setExtraNewShipmentItem((prev) => ({ ...prev, [shipmentId]: { itemId: "", qty: "" } }));
    }
  }

  /** 勾到貨：畫面先更新，不等後端（跟一般採購單的到貨勾選一樣） */
  function toggleExtraArrived(purchaseId: string, shipmentItemId: string, arrived: boolean) {
    setExtraPurchases((prev) =>
      prev.map((p: any) =>
        p.id !== purchaseId
          ? p
          : {
              ...p,
              orderNumbers: p.orderNumbers.map((o: any) => ({
                ...o,
                shipments: o.shipments.map((s: any) => ({
                  ...s,
                  items: s.items.map((si: any) => (si.id === shipmentItemId ? { ...si, arrived } : si)),
                })),
              })),
            }
      )
    );
    extraTracking(purchaseId, "PATCH", { shipmentItemId, arrived });
  }

  // ---- 到貨追蹤 ----
  async function openArrivalTracking(batch: any) {
    setActiveBatchForArrival(batch);
    setMsg("");
    await loadArrivalTree(batch.id);
  }

  async function loadArrivalTree(batchId: string) {
    const d = await fetchJson(`/api/admin/campaigns/${campaignId}/purchase-batches/${batchId}/arrival`);
    setArrivalTree(d.tree || []);
    setArrivalUnshippedPool(d.unshippedPool || []);
  }

  async function addOrderNumber() {
    if (!activeBatchForArrival) return;
    if (!newOrderNumber.trim()) return setMsg("請輸入廠商訂單編號");
    try {
      await callJson(`/api/admin/campaigns/${campaignId}/purchase-batches/${activeBatchForArrival.id}/arrival`, "POST", { orderNumber: newOrderNumber });
      setNewOrderNumber("");
      loadArrivalTree(activeBatchForArrival.id);
      loadPurchaseBatchesData(); // 採購單列表的「已採購／尚未採購」狀態要跟著更新
    } catch (e: any) {
      setMsg(e.message || "新增失敗");
    }
  }

  async function deleteOrderNumber(orderNumberId: string) {
    if (!activeBatchForArrival) return;
    if (!confirm("確定要刪除這個廠商訂單編號嗎？底下的物流單號也會一起刪除。")) return;
    await callJson(`/api/admin/order-numbers/${orderNumberId}`, "DELETE", {});
    loadArrivalTree(activeBatchForArrival.id);
    loadPurchaseBatchesData(); // 刪光訂單編號後，狀態要變回「尚未採購」
  }

  async function addShipment(orderNumberId: string) {
    if (!activeBatchForArrival) return;
    try {
      await callJson(`/api/admin/order-numbers/${orderNumberId}`, "POST", { trackingNumber: newTrackingByOrderNumber[orderNumberId] || "" });
      setNewTrackingByOrderNumber((prev) => ({ ...prev, [orderNumberId]: "" }));
      loadArrivalTree(activeBatchForArrival.id);
    } catch (e: any) {
      setMsg(e.message || "新增失敗");
    }
  }

  async function updateShipmentWeight(shipmentId: string, weightKg: string) {
    try {
      await callJson(`/api/admin/shipments/${shipmentId}`, "PATCH", { weightKg });
      if (activeBatchForArrival) loadArrivalTree(activeBatchForArrival.id);
    } catch (e: any) {
      setMsg(e.message || "更新重量失敗");
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
    if (!shipmentId) return setMsg("請選擇要分配進哪個物流單號");
    if (!isFinite(qty) || qty <= 0) return setMsg("請輸入數量");
    try {
      await callJson(`/api/admin/shipments/${shipmentId}/items`, "POST", { type: poolItem.type, id: poolItem.id, qty });
      setAssignShipQtyByPoolItem((prev) => ({ ...prev, [key]: "" }));
      loadArrivalTree(activeBatchForArrival.id);
    } catch (e: any) {
      setMsg(e.message || "分配失敗");
    }
  }

  async function toggleArrived(itemId: string, arrived: boolean) {
    if (!activeBatchForArrival) return;
    // 勾勾先立刻打上去，不等後端回應——寫入本身很快，慢的是後面的重抓，
    // 讓畫面先反應，勾一連串品項時就不會每勾一個就卡一下
    setArrivalTree((prev) =>
      prev.map((on: any) => ({
        ...on,
        shipments: (on.shipments || []).map((s: any) => ({
          ...s,
          items: (s.items || []).map((it: any) => (it.id === itemId ? { ...it, arrived } : it)),
        })),
      }))
    );
    try {
      const d = await callJson(`/api/admin/shipment-items/${itemId}`, "PATCH", { arrived });
      if (d.matchedBackorders) {
        const desc = d.matchedBackorders.map((m: any) => `${m.username} x${m.qty}`).join("、");
        setMsg(`已自動優先配對欠貨：${desc}`);
        // 有配對到欠貨才需要重抓（欠貨清單變了），一般情況不用
        loadArrivalTree(activeBatchForArrival.id);
      }
      // 採購單列表的「到貨中 3/5」進度，返回列表時本來就會重抓一次，這裡不用再抓一遍
    } catch (e: any) {
      // 寫入失敗就把勾勾退回原狀，不然畫面會跟資料庫不一致
      setArrivalTree((prev) =>
        prev.map((on: any) => ({
          ...on,
          shipments: (on.shipments || []).map((s: any) => ({
            ...s,
            items: (s.items || []).map((it: any) => (it.id === itemId ? { ...it, arrived: !arrived } : it)),
          })),
        }))
      );
      setMsg(e.message || "更新到貨狀態失敗");
    }
  }

  async function removeShipmentItem(itemId: string) {
    if (!activeBatchForArrival) return;
    await callJson(`/api/admin/shipment-items/${itemId}`, "DELETE", {});
    loadArrivalTree(activeBatchForArrival.id);
  }

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#8A8779" }}>載入中…</div>;
  if (loadError) return <div style={{ padding: 40, textAlign: "center", color: "#B3261E" }}>{loadError}</div>;

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px 80px" }}>
      {/* 在到貨追蹤子頁面時，這顆要返回採購單列表（不是跳出去回後台）——
          原本不管在哪個狀態都是回後台，在子頁面很容易誤按 */}
      <button
        className="btn secondary"
        style={{ marginBottom: 16 }}
        onClick={() => {
          if (activeBatchForArrival) {
            setActiveBatchForArrival(null);
            loadPurchaseBatchesData();
          } else {
            router.push("/admin");
          }
        }}
      >
        {activeBatchForArrival ? "← 返回採購單列表" : "← 返回後台"}
      </button>
      <h2 style={{ marginBottom: 4 }}>拆單：{campaign?.name}</h2>

      {(() => {
        // 2.3節防呆檢查：全體拆單結果如果低於顧客結帳當下已看到的保底數量，照理不該發生，
        // 屬於設定異常，這裡主動跳出警示，不用等店家自己點進「贈品缺口總覽」分頁才發現
        const shortages = batchGiftGap.filter((g: any) => g.diff < 0);
        if (shortages.length === 0) return null;
        return (
          <div style={{ background: "#FCEBEB", border: "1px solid #E5A5A5", borderRadius: 10, padding: 14, marginBottom: 16 }}>
            <div style={{ fontWeight: 600, color: "#791F1F", marginBottom: 6 }}>
              ⚠ 目前配置數量低於已經向顧客承諾的保底數量
            </div>
            <div style={{ fontSize: 13, color: "#791F1F", marginBottom: 8 }}>
              照理不該發生，請檢查廠商規則設定（門檻、平台上限）或補上額外採購：
            </div>
            {shortages.map((g: any) => (
              <div key={g.giftStyleId} style={{ fontSize: 13, color: "#791F1F" }}>
                ・{g.styleName}（門檻{g.thresholdAmount}）：保底需要 {g.promised}，目前只有 {g.allocated + g.extra}，<strong>缺 {-g.diff}</strong>
              </div>
            ))}
            <button className="btn small secondary" style={{ marginTop: 8 }} onClick={() => setTab("gap")}>
              查看贈品缺口總覽
            </button>
          </div>
        );
      })()}

      {!activeBatchForArrival ? (
        <div className="auth-card">
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <button className={`btn small ${tab === "batches" ? "" : "secondary"}`} onClick={() => setTab("batches")}>採購單</button>
            <button className={`btn small ${tab === "gap" ? "" : "secondary"}`} onClick={() => setTab("gap")}>贈品缺口總覽</button>
            <button className={`btn small ${tab === "extra" ? "" : "secondary"}`} onClick={() => setTab("extra")}>額外採購</button>
            <button className={`btn small ${tab === "backorders" ? "" : "secondary"}`} onClick={() => setTab("backorders")}>欠貨總覽</button>
            <button className={`btn small ${tab === "reassign" ? "" : "secondary"}`} onClick={() => setTab("reassign")}>挪用建議</button>
          </div>

          {tab === "batches" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                <select value={newBatchPlatformId} onChange={(e) => setNewBatchPlatformId(e.target.value)} style={{ padding: 8 }}>
                  <option value="">（尚未指定平台）</option>
                  {vendorPlatforms.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <button className="btn small" onClick={createPurchaseBatch}>新增採購單</button>
                <button className="btn small secondary" onClick={autoSplit} disabled={autoSplitting}>
                  {autoSplitting ? "自動分配中…" : "自動分配未分配品項"}
                </button>
                <button className="btn small secondary" onClick={syncCostSheet} disabled={syncingCostSheet}>
                  {syncingCostSheet ? "同步中…" : "同步成本表"}
                </button>
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>未分配品項池</div>
                {unassignedPool.length === 0 && <div style={{ fontSize: 13, color: "#8A8779" }}>沒有未分配的品項</div>}
                {unassignedPool.map((it) => (
                  <div key={it.orderItemId} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px dashed var(--line)" }}>
                    <span style={{ fontSize: 13, minWidth: 200 }}>{it.username}：{it.seriesName ? `${it.seriesName} / ` : ""}{it.productName}{it.style ? `（${it.style}）` : ""} 剩 {it.qty} 件（￥{fmtAmount(it.unitPriceOriginal ?? it.unitPrice)}/件）</span>
                    <input
                      type="number"
                      placeholder="數量"
                      style={{ width: 60, minWidth: 60 }}
                      value={assignQtyByItem[it.orderItemId] || ""}
                      onChange={(e) => setAssignQtyByItem((prev) => ({ ...prev, [it.orderItemId]: e.target.value }))}
                    />
                    <SearchableBatchPicker
                      batches={purchaseBatches.map((b, idx) => ({ id: b.id, label: `採購單${idx + 1}${b.platform ? `（${b.platform.name}）` : ""}` }))}
                      value={assignTargetBatchByItem[it.orderItemId] || ""}
                      search={assignSearchByItem[it.orderItemId] || ""}
                      onSearchChange={(v) => setAssignSearchByItem((prev) => ({ ...prev, [it.orderItemId]: v }))}
                      onSelect={(id) => setAssignTargetBatchByItem((prev) => ({ ...prev, [it.orderItemId]: id }))}
                    />
                    <button className="btn small secondary" onClick={() => assignItemToBatch(it.orderItemId)}>分配</button>
                  </div>
                ))}
              </div>

              {purchaseBatches.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={selectedBatchIds.size === purchaseBatches.length && purchaseBatches.length > 0}
                      onChange={(e) =>
                        setSelectedBatchIds(e.target.checked ? new Set(purchaseBatches.map((b) => b.id)) : new Set())
                      }
                      style={{ width: 16, height: 16 }}
                    />
                    全選
                  </label>
                  {selectedBatchIds.size > 0 && (
                    <button className="btn small danger" onClick={deleteSelectedBatches}>
                      刪除選取的 {selectedBatchIds.size} 張
                    </button>
                  )}
                  <button className="btn small secondary" onClick={resetAndAutoSplit} disabled={autoSplitting}>
                    {autoSplitting ? "處理中…" : "全部重新分配"}
                  </button>
                  <span style={{ fontSize: 11, color: "#8A8779" }}>已填廠商訂單編號的採購單不會被動到</span>
                </div>
              )}

              {purchaseBatches.map((b, idx) => (
                <div
                  key={b.id}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => moveItemToBatch(b.id)}
                  style={{ border: draggedItem ? "2px dashed #33415C" : "1px solid var(--line)", borderRadius: 10, padding: 14, marginBottom: 14 }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
                    <span style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={selectedBatchIds.has(b.id)}
                        onChange={() => toggleBatchSelect(b.id)}
                        style={{ width: 16, height: 16 }}
                      />
                      採購單{idx + 1}
                      {(b.vendorOrderNumbers || []).length > 0 ? (
                        <span style={{ fontSize: 11, background: "#E8F0E0", color: "#3D6B1F", padding: "2px 8px", borderRadius: 999, fontWeight: 400 }}>已採購</span>
                      ) : (
                        <span style={{ fontSize: 11, background: "#F1EFE8", color: "#8A8779", padding: "2px 8px", borderRadius: 999, fontWeight: 400 }}>尚未採購</span>
                      )}
                    </span>
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

                  <div style={{ fontSize: 12, color: "#8A8779", marginBottom: 8, padding: "6px 10px", background: "#F7F5EF", borderRadius: 8 }}>
                    廠商訂單編號：
                    {(b.vendorOrderNumbers || []).length > 0 ? (
                      <span style={{ color: "#2C2C2A" }}>{b.vendorOrderNumbers.join("、")}</span>
                    ) : (
                      <span>尚未登記（到「到貨追蹤」頁面新增）</span>
                    )}
                  </div>

                  {b.items.length === 0 && <div style={{ fontSize: 13, color: "#8A8779" }}>還沒有分配任何品項（可以把品項拖曳過來）</div>}
                  {b.items.map((it: any) => (
                    <div key={it.id}>
                      <div
                        draggable
                        onDragStart={() => setDraggedItem({ orderItemId: it.orderItemId, qty: it.qty, sourceBatchId: b.id, batchItemId: it.id })}
                        onDragEnd={() => setDraggedItem(null)}
                        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, padding: "4px 6px", cursor: "grab", borderRadius: 6, background: draggedItem?.batchItemId === it.id ? "#F1EFE8" : "transparent" }}
                      >
                        <span>⠿ {it.username}：{it.seriesName ? `${it.seriesName} / ` : ""}{it.productName}{it.style ? `（${it.style}）` : ""} x{it.qty}（￥{fmtAmount(it.unitPriceOriginal)}/件）</span>
                        <span style={{ display: "flex", gap: 6 }}>
                          {it.qty > 1 && (
                            <button className="btn small secondary" onClick={() => setSplitOpenForItem(splitOpenForItem === it.id ? null : it.id)}>拆分搬移</button>
                          )}
                          <button className="btn small secondary" onClick={() => customerEditForItem === it.id ? setCustomerEditForItem(null) : openCustomerEdit(it.id, it.productName, it.style)}>改顧客</button>
                          <button className="btn small secondary" onClick={() => removeBatchItem(b.id, it.id)}>移出</button>
                        </span>
                      </div>
                      {customerEditForItem === it.id && (
                        <div style={{ padding: "6px 6px 10px 20px" }}>
                          <input
                            type="text"
                            placeholder="搜尋顧客帳號…"
                            value={customerSearch}
                            onChange={(e) => setCustomerSearch(e.target.value)}
                            style={{ padding: 6, width: 200, marginBottom: 6 }}
                          />
                          <div style={{ maxHeight: 160, overflowY: "auto", border: "1px solid var(--line)", borderRadius: 8 }}>
                            {customerCandidates
                              .filter((c: any) => !customerSearch.trim() || c.username.toLowerCase().includes(customerSearch.trim().toLowerCase()))
                              .filter((c: any) => c.orderItemId !== it.orderItemId)
                              .map((c: any) => (
                                <div key={c.orderItemId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 10px", fontSize: 12, borderBottom: "1px dashed var(--line)" }}>
                                  <span>{c.username}（訂購{c.qty}件，還可接收{c.remainingQty}件）</span>
                                  <button className="btn small secondary" onClick={() => reassignCustomer(b.id, it.id, c.orderItemId)}>改成這位</button>
                                </div>
                              ))}
                            {customerCandidates.filter((c: any) => c.orderItemId !== it.orderItemId).length === 0 && (
                              <div style={{ padding: 8, fontSize: 12, color: "#8A8779" }}>沒有其他顧客訂購這個商品款式</div>
                            )}
                          </div>
                        </div>
                      )}
                      {it.reassignmentNote && (
                        <div style={{ fontSize: 11, color: "#8A6D3B", background: "#FAEEDA", padding: "3px 8px", borderRadius: 6, margin: "2px 0 4px 20px" }}>
                          {it.reassignmentNote}
                        </div>
                      )}
                      {splitOpenForItem === it.id && (
                        <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "4px 6px 8px 20px", flexWrap: "wrap" }}>
                          <span style={{ fontSize: 12, color: "#8A8779" }}>搬移數量</span>
                          <input
                            type="number"
                            style={{ width: 60, minWidth: 60 }}
                            placeholder={`1~${it.qty - 1}`}
                            value={splitQtyByItem[it.id] || ""}
                            onChange={(e) => setSplitQtyByItem((prev) => ({ ...prev, [it.id]: e.target.value }))}
                          />
                          <SearchableBatchPicker
                            batches={purchaseBatches.filter((pb) => pb.id !== b.id).map((pb, i2) => ({ id: pb.id, label: `採購單${purchaseBatches.indexOf(pb) + 1}${pb.platform ? `（${pb.platform.name}）` : ""}` }))}
                            value={splitTargetByItem[it.id] || ""}
                            search={splitSearchByItem[it.id] || ""}
                            onSearchChange={(v) => setSplitSearchByItem((prev) => ({ ...prev, [it.id]: v }))}
                            onSelect={(id) => setSplitTargetByItem((prev) => ({ ...prev, [it.id]: id }))}
                          />
                          <button
                            className="btn small secondary"
                            onClick={() => splitMoveItem(b.id, it.id, it.orderItemId, it.qty, Number(splitQtyByItem[it.id]), splitTargetByItem[it.id])}
                          >
                            確認搬移
                          </button>
                        </div>
                      )}
                    </div>
                  ))}

                  <div style={{ fontSize: 13, marginTop: 8, color: "#5F5E5A" }}>
                    原幣小計 ￥{fmtAmount(b.subtotalOriginal)}
                    {b.discountableOriginal != null && b.discountableOriginal !== b.subtotalOriginal && (
                      <span>　（可折金額 ￥{fmtAmount(b.discountableOriginal)}，只算有滿減標記的商品）</span>
                    )}
                    {b.matchedThresholdAmount != null && <span>　達門檻￥{b.matchedThresholdAmount}，折扣￥{b.matchedDiscountAmount}</span>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                    <span style={{ fontSize: 12, color: "#8A8779" }}>額外調整（可連續輸入多筆數字，如 -20 -30，自動加總）</span>
                    <input
                      type="text"
                      defaultValue={b.extraAdjustmentText}
                      onBlur={(e) => updateExtraAdjustment(b.id, e.target.value)}
                      style={{ width: 120, padding: 4, fontSize: 12 }}
                    />
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>
                    實收 ￥{fmtAmount(b.netReceivable)}
                  </div>

                  <div style={{ marginTop: 10, borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
                    <div style={{ fontSize: 12, color: "#8A8779", marginBottom: 4 }}>滿贈配置</div>
                    {(() => {
                      // 每款式的可選上限＝「依門檻算出的上限」跟「平台每款上限」兩者取較小值（3.2/3.3節）
                      function effectiveMax(styleId: string, thresholdAmount: number): number {
                        const amountBasedMax = Math.floor(b.subtotalOriginal / thresholdAmount);
                        const cap = b.platform ? vendorPlatforms.find((p: any) => p.id === b.platform.id)?.styleCaps?.[styleId] : undefined;
                        return cap != null ? Math.min(amountBasedMax, cap) : amountBasedMax;
                      }
                      const unlockedStyles = campaignGiftStyles
                        .map((s) => ({ ...s, max: effectiveMax(s.id, s.threshold_amount) }))
                        .filter((s) => s.max > 0);
                      // 整張採購單的滿贈總量上限（後端算好的：min(金額÷基礎單位, 平台上限)）。
                      // 原本「＋」只看單一款式上限，總量滿了還能繼續加
                      const giftTotal = b.gifts.reduce((s: number, g: any) => s + g.qty, 0);
                      const giftTotalCap = Number(b.giftTotalCap) || 0;
                      const totalFull = giftTotal >= giftTotalCap;

                      return (
                        <>
                          {b.platform && (
                            <div style={{ fontSize: 12, color: totalFull ? "#3D6B1F" : "#8A8779", marginBottom: 4 }}>
                              滿贈總量 {giftTotal} / {giftTotalCap}
                            </div>
                          )}
                          {b.gifts.map((g: any) => {
                            const max = effectiveMax(g.giftStyleId, g.thresholdAmount);
                            return (
                              <div key={g.giftStyleId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, padding: "4px 0" }}>
                                <span>{g.styleName}（門檻{g.thresholdAmount}，上限{max}）</span>
                                <div className="stepper">
                                  <button className="step-btn" disabled={g.qty <= 0} onClick={() => setBatchGiftQty(b.id, g.giftStyleId, g.qty - 1)}>－</button>
                                  <input className="qty" value={g.qty} readOnly />
                                  <button className="step-btn" disabled={g.qty >= max || totalFull} onClick={() => setBatchGiftQty(b.id, g.giftStyleId, g.qty + 1)}>＋</button>
                                </div>
                              </div>
                            );
                          })}
                          {!b.platform && <div style={{ fontSize: 12, color: "#993C1D" }}>還沒指定平台，無法配置滿贈</div>}
                          {b.platform && !totalFull && unlockedStyles.filter((s) => !b.gifts.find((g: any) => g.giftStyleId === s.id)).length > 0 && (
                            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                              <select
                                style={{ padding: 6 }}
                                value={giftPickByBatch[b.id] || ""}
                                onChange={(e) => setGiftPickByBatch((prev) => ({ ...prev, [b.id]: e.target.value }))}
                              >
                                <option value="">新增款式（已排除未解鎖的）</option>
                                {unlockedStyles
                                  .filter((s) => !b.gifts.find((g: any) => g.giftStyleId === s.id))
                                  .map((s) => (
                                    <option key={s.id} value={s.id}>{s.style_name}（上限{s.max}）</option>
                                  ))}
                              </select>
                              <button
                                className="btn small secondary"
                                disabled={!giftPickByBatch[b.id]}
                                onClick={() => setBatchGiftQty(b.id, giftPickByBatch[b.id], 1)}
                              >
                                加入
                              </button>
                            </div>
                          )}
                        </>
                      );
                    })()}
                    {giftErrorByBatch[b.id] && (
                      <div style={{ color: "#B3261E", fontSize: 12, marginTop: 4 }}>{giftErrorByBatch[b.id]}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "gap" && (
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

          {tab === "extra" && (
            <div>
              <p style={{ fontSize: 13, color: "#8A8779", margin: "0 0 12px" }}>跟其他賣家/管道額外買到的現貨，用來抵掉贈品缺口，不強制走拆單，會計入這次檔期的成本。</p>
              <div className="id-row"><span className="id-label">訂單編號（採購單號）</span><input type="text" value={extraOrderNumber} onChange={(e) => setExtraOrderNumber(e.target.value)} placeholder="選填" /></div>
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 13, color: "#8A8779", marginBottom: 4 }}>款式（一張單可以買好幾個款式）</div>
                {extraItemRows.map((row, i) => (
                  <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap", alignItems: "center" }}>
                    <select
                      className="admin-input"
                      value={row.giftStyleId}
                      onChange={(e) => setExtraItemRows((rows) => rows.map((r, ri) => (ri === i ? { ...r, giftStyleId: e.target.value } : r)))}
                      style={{ flex: 1, minWidth: 180 }}
                    >
                      <option value="">請選擇款式</option>
                      {campaignGiftStyles.map((s) => (
                        <option key={s.id} value={s.id}>{s.style_name}（門檻{s.threshold_amount}）</option>
                      ))}
                    </select>
                    <input type="number" className="admin-input" placeholder="數量" value={row.qty}
                      onChange={(e) => setExtraItemRows((rows) => rows.map((r, ri) => (ri === i ? { ...r, qty: e.target.value } : r)))}
                      style={{ width: 80 }} />
                    <input type="number" className="admin-input" placeholder="成本(選填)" value={row.subtotal}
                      onChange={(e) => setExtraItemRows((rows) => rows.map((r, ri) => (ri === i ? { ...r, subtotal: e.target.value } : r)))}
                      style={{ width: 110 }} />
                    <button className="btn small secondary" disabled={extraItemRows.length <= 1}
                      onClick={() => setExtraItemRows((rows) => rows.filter((_, ri) => ri !== i))}>刪除</button>
                  </div>
                ))}
                <button className="btn small secondary" onClick={() => setExtraItemRows((rows) => [...rows, { giftStyleId: "", qty: "", subtotal: "" }])}>＋ 新增一個款式</button>
              </div>
              <div className="id-row"><span className="id-label">備註</span><input type="text" value={extraNote} onChange={(e) => setExtraNote(e.target.value)} placeholder="選填" /></div>
              <button className="btn" onClick={addExtraPurchase}>新增額外採購紀錄</button>

              <div style={{ marginTop: 16, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
                {extraPurchases.length === 0 && <div style={{ fontSize: 13, color: "#8A8779" }}>還沒有任何額外採購紀錄</div>}
                {extraPurchases.map((p) => {
                  const expanded = expandedExtraId === p.id;
                  const allArrived = p.totalQty > 0 && p.arrivedQty >= p.totalQty;
                  return (
                    <div key={p.id} style={{ padding: "10px 0", borderBottom: "1px dashed var(--line)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 14 }}>
                          {p.orderNumber ? `[${p.orderNumber}] ` : ""}
                          共 {p.items.length} 個款式 / {p.totalQty} 個
                          {p.subtotal ? `　成本 ￥${p.subtotal}` : ""}
                          {p.note ? `（${p.note}）` : ""}
                        </span>
                        <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <button
                            className="btn small"
                            style={allArrived ? { background: "#639922" } : p.arrivedQty > 0 ? { background: "#D9A441" } : undefined}
                            onClick={() => setExpandedExtraId(expanded ? null : p.id)}
                          >
                            到貨 {p.arrivedQty}/{p.totalQty}
                          </button>
                          <button className="btn small danger" onClick={() => deleteExtraPurchase(p.id)}>刪除</button>
                        </span>
                      </div>

                      {/* 這張單買了哪些款式 */}
                      <div style={{ paddingLeft: 12, marginTop: 4 }}>
                        {p.items.map((it: any) => (
                          <div key={it.id} style={{ fontSize: 13, color: "#6B6858", padding: "2px 0" }}>
                            ・{it.styleName} x{it.qty}
                            {it.subtotal != null ? `　成本 ￥${it.subtotal}` : ""}
                            <span style={{ color: it.arrivedQty >= it.qty ? "#3D6B1F" : "#8A8779", marginLeft: 6 }}>
                              到貨 {it.arrivedQty}/{it.qty}
                              {it.trackedQty < it.qty ? `（還有 ${it.qty - it.trackedQty} 個沒開物流單）` : ""}
                            </span>
                          </div>
                        ))}
                      </div>

                      {expanded && (
                        <div style={{ marginTop: 10, padding: 12, background: "#F7F5EF", borderRadius: 8 }}>
                          <div style={{ fontSize: 12, color: "#8A8779", marginBottom: 8 }}>
                            廠商訂單編號 → 物流單號 → 物流單裡的款式。到貨勾選在最底層，同一張物流單裝了不同款式可以各自勾。
                          </div>

                          {p.orderNumbers.map((o: any) => {
                            const ns = extraNewShipment[o.id] || { tracking: "", qty: "", weight: "" };
                            return (
                              <div key={o.id} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 10, marginBottom: 10, background: "var(--card)" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                                  <span style={{ fontSize: 13, fontWeight: 600 }}>廠商訂單編號：{o.orderNumber}</span>
                                  <button className="btn small danger" onClick={() => { if (confirm("確定要刪除這個訂單編號嗎？底下的物流單號也會一起刪除。")) extraTracking(p.id, "DELETE", { orderNumberId: o.id }); }}>刪除</button>
                                </div>

                                {o.shipments.map((s: any) => {
                                  const pick = extraNewShipmentItem[s.id] || { itemId: "", qty: "" };
                                  return (
                                    <div key={s.id} style={{ border: "1px dashed var(--line)", borderRadius: 8, padding: 8, marginBottom: 8 }}>
                                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 13, marginBottom: 4 }}>
                                        <span>物流單號：{s.trackingNumber || "（未填）"}</span>
                                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                          重量
                                          <input type="number" step="0.01" className="admin-input" defaultValue={s.weightKg ?? ""}
                                            onBlur={(e) => extraTracking(p.id, "PATCH", { shipmentId: s.id, weightKg: e.target.value })}
                                            placeholder="KG" style={{ width: 80 }} />
                                          KG
                                        </span>
                                        <button className="btn small danger" onClick={() => extraTracking(p.id, "DELETE", { shipmentId: s.id })}>刪除物流單</button>
                                      </div>

                                      {s.items.map((si: any) => (
                                        <div key={si.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0 3px 12px", flexWrap: "wrap", fontSize: 13 }}>
                                          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                            <input type="checkbox" checked={si.arrived} onChange={(e) => toggleExtraArrived(p.id, si.id, e.target.checked)} style={{ width: 16, height: 16 }} />
                                            <span>{si.arrived ? "已到貨" : "未到貨"}</span>
                                          </label>
                                          <span>{si.styleName}</span>
                                          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                            數量
                                            <input type="number" className="admin-input" defaultValue={si.qty}
                                              onBlur={(e) => { if (Number(e.target.value) !== si.qty) extraTracking(p.id, "PATCH", { shipmentItemId: si.id, qty: e.target.value }); }}
                                              style={{ width: 70 }} />
                                          </span>
                                          <button className="btn small danger" onClick={() => extraTracking(p.id, "DELETE", { shipmentItemId: si.id })}>移除</button>
                                        </div>
                                      ))}

                                      <div style={{ display: "flex", gap: 6, marginTop: 4, paddingLeft: 12, flexWrap: "wrap", alignItems: "center" }}>
                                        <select className="admin-input" value={pick.itemId}
                                          onChange={(e) => setExtraNewShipmentItem((prev) => ({ ...prev, [s.id]: { ...pick, itemId: e.target.value } }))}
                                          style={{ minWidth: 170 }}>
                                          <option value="">這張物流單裝了哪個款式</option>
                                          {p.items.map((it: any) => (
                                            <option key={it.id} value={it.id}>{it.styleName}（還沒開 {it.qty - it.trackedQty} 個）</option>
                                          ))}
                                        </select>
                                        <input type="number" className="admin-input" placeholder="數量" value={pick.qty}
                                          onChange={(e) => setExtraNewShipmentItem((prev) => ({ ...prev, [s.id]: { ...pick, qty: e.target.value } }))}
                                          style={{ width: 80 }} />
                                        <button className="btn small secondary" onClick={() => addExtraShipmentItem(p.id, s.id)}>加入這張物流單</button>
                                      </div>
                                    </div>
                                  );
                                })}

                                <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
                                  <input type="text" className="admin-input" placeholder="物流單號（選填）" value={ns.tracking}
                                    onChange={(e) => setExtraNewShipment((prev) => ({ ...prev, [o.id]: { ...ns, tracking: e.target.value } }))} style={{ minWidth: 150 }} />
                                  <input type="number" step="0.01" className="admin-input" placeholder="重量KG" value={ns.weight}
                                    onChange={(e) => setExtraNewShipment((prev) => ({ ...prev, [o.id]: { ...ns, weight: e.target.value } }))} style={{ width: 90 }} />
                                  <button className="btn small secondary" onClick={() => addExtraShipment(p.id, o.id)}>新增物流單號</button>
                                </div>
                              </div>
                            );
                          })}

                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <input type="text" className="admin-input" placeholder="廠商訂單編號" value={extraNewOrderNumber[p.id] || ""}
                              onChange={(e) => setExtraNewOrderNumber((prev) => ({ ...prev, [p.id]: e.target.value }))} style={{ minWidth: 200 }} />
                            <button className="btn small secondary" onClick={() => addExtraOrderNumber(p.id)}>新增廠商訂單編號</button>
                          </div>

                          {extraTrackMsg[p.id] && <div style={{ color: "#B3261E", fontSize: 12, marginTop: 6 }}>{extraTrackMsg[p.id]}</div>}
                        </div>
                      )}
                    </div>
                  );
                                })}
              </div>
            </div>
          )}

          {tab === "backorders" && (
            <div>
              <p style={{ fontSize: 13, color: "#8A8779", margin: "0 0 12px" }}>
                目前還沒補齊的欠貨清單，依產生時間先後排序。標記到貨時，系統會自動優先把新到貨的數量配對給最早的欠貨紀錄。
              </p>
              {backorders.length === 0 && <div style={{ fontSize: 13, color: "#8A8779" }}>目前沒有任何欠貨紀錄</div>}
              {backorders.map((b) => (
                <div key={b.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px dashed var(--line)" }}>
                  <span style={{ fontSize: 14 }}>{b.username}：{b.seriesName ? `${b.seriesName} / ` : ""}{b.productName}{b.style ? `（${b.style}）` : ""} 欠 {b.qty} 件</span>
                  <span style={{ fontSize: 12, color: "#8A8779" }}>{new Date(b.createdAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}</span>
                </div>
              ))}
            </div>
          )}

          {tab === "reassign" && (
            <div>
              <p style={{ fontSize: 13, color: "#8A8779", margin: "0 0 12px" }}>
                這些顧客的品項還沒到貨，但其他顧客有同商品同款式已經到貨，可以一鍵挪用湊齊，原本的顧客會自動產生欠貨紀錄。
              </p>
              {reassignNeeding.length === 0 && <div style={{ fontSize: 13, color: "#8A8779" }}>目前沒有可以挪用的建議</div>}
              {reassignNeeding.map((n: any) => (
                <div key={n.orderItemId} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 12, marginBottom: 10 }}>
                  <div style={{ fontSize: 14, marginBottom: 6 }}>
                    {n.username}：{n.seriesName ? `${n.seriesName} / ` : ""}{n.productName}{n.style ? `（${n.style}）` : ""} 還缺 {n.stillNeed} 件
                  </div>
                  {n.candidates.map((c: any) => (
                    <div key={c.shipmentItemId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, padding: "4px 0" }}>
                      <span>可挪用來源：{c.username} 已到貨 {c.qty} 件</span>
                      <button className="btn small secondary" onClick={() => doReassign(c.shipmentItemId, n.orderItemId)}>一鍵挪用</button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="auth-card">
          <h3>到貨追蹤</h3>
          <p style={{ fontSize: 13, color: "#8A8779", margin: "0 0 12px" }}>
            三層結構：廠商訂單編號 → 物流單號 → 品項。滿贈品項比照一般商品，同樣可以被分配進物流單號、同樣要追蹤到貨狀態，只記到貨/未到貨兩態。
          </p>

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
                    className="admin-input"
                    placeholder="數量"
                    style={{ width: 80 }}
                    value={assignShipQtyByPoolItem[key] || ""}
                    onChange={(e) => setAssignShipQtyByPoolItem((prev) => ({ ...prev, [key]: e.target.value }))}
                  />
                  <select
                    className="admin-input"
                    style={{ minWidth: 200 }}
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
            <input type="text" className="admin-input" value={newOrderNumber} onChange={(e) => setNewOrderNumber(e.target.value)} placeholder="廠商訂單編號" style={{ minWidth: 220 }} />
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
                      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 12, color: "#8A8779" }}>重量</span>
                        <input
                          type="number"
                          step="0.01"
                          className="admin-input"
                          defaultValue={s.weightKg ?? ""}
                          onBlur={(e) => updateShipmentWeight(s.id, e.target.value)}
                          placeholder="KG"
                          style={{ width: 90 }}
                        />
                        <span style={{ fontSize: 12, color: "#8A8779" }}>KG</span>
                        <button className="btn small danger" onClick={() => deleteShipment(s.id)}>刪除</button>
                      </span>
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
                  className="admin-input"
                  placeholder="物流單號（選填）"
                  style={{ minWidth: 220 }}
                  value={newTrackingByOrderNumber[on.id] || ""}
                  onChange={(e) => setNewTrackingByOrderNumber((prev) => ({ ...prev, [on.id]: e.target.value }))}
                />
                <button className="btn small secondary" onClick={() => addShipment(on.id)}>新增物流單號</button>
              </div>
            </div>
          ))}

          <button className="btn secondary" style={{ marginTop: 16 }} onClick={() => { setActiveBatchForArrival(null); loadPurchaseBatchesData(); }}>返回採購單列表</button>
        </div>
      )}

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

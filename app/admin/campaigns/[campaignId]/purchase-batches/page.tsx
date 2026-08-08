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
  const [extraGiftStyleId, setExtraGiftStyleId] = useState("");
  const [extraQty, setExtraQty] = useState("");
  const [extraNote, setExtraNote] = useState("");
  const [extraOrderNumber, setExtraOrderNumber] = useState("");
  const [extraSubtotal, setExtraSubtotal] = useState("");

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
      await callJson(`/api/admin/campaigns/${campaignId}/purchase-batches/${sourceBatchId}/items`, "DELETE", { batchItemId });
      const remain = totalQty - moveQty;
      if (remain > 0) {
        await callJson(`/api/admin/campaigns/${campaignId}/purchase-batches/${sourceBatchId}/items`, "POST", { orderItemId, qty: remain });
      }
      await callJson(`/api/admin/campaigns/${campaignId}/purchase-batches/${targetBatchId}/items`, "POST", { orderItemId, qty: moveQty });
      setSplitOpenForItem(null);
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
      await callJson(`/api/admin/campaigns/${campaignId}/purchase-batches/${draggedItem.sourceBatchId}/items`, "DELETE", { batchItemId: draggedItem.batchItemId });
      await callJson(`/api/admin/campaigns/${campaignId}/purchase-batches/${targetBatchId}/items`, "POST", { orderItemId: draggedItem.orderItemId, qty: draggedItem.qty });
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
    await callJson(`/api/admin/campaigns/${campaignId}/purchase-batches/${batchId}/items`, "DELETE", { batchItemId });
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
    if (!extraGiftStyleId) return setMsg("請選擇滿贈款式");
    const qty = Number(extraQty);
    if (!isFinite(qty) || qty <= 0) return setMsg("數量格式不正確");
    try {
      await callJson(`/api/admin/campaigns/${campaignId}/extra-purchases`, "POST", {
        giftStyleId: extraGiftStyleId, qty, note: extraNote, orderNumber: extraOrderNumber, subtotal: extraSubtotal,
      });
      setExtraGiftStyleId(""); setExtraQty(""); setExtraNote(""); setExtraOrderNumber(""); setExtraSubtotal("");
      loadPurchaseBatchesData();
    } catch (e: any) {
      setMsg(e.message || "新增失敗");
    }
  }

  async function deleteExtraPurchase(id: string) {
    await callJson(`/api/admin/campaigns/${campaignId}/extra-purchases/${id}`, "DELETE", {});
    loadPurchaseBatchesData();
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
    const d = await callJson(`/api/admin/shipment-items/${itemId}`, "PATCH", { arrived });
    if (d.matchedBackorders) {
      const desc = d.matchedBackorders.map((m: any) => `${m.username} x${m.qty}`).join("、");
      setMsg(`已自動優先配對欠貨：${desc}`);
    }
    loadArrivalTree(activeBatchForArrival.id);
    loadPurchaseBatchesData();
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
      <button className="btn secondary" style={{ marginBottom: 16 }} onClick={() => router.push("/admin")}>← 返回後台</button>
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

                      return (
                        <>
                          {b.gifts.map((g: any) => {
                            const max = effectiveMax(g.giftStyleId, g.thresholdAmount);
                            return (
                              <div key={g.giftStyleId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, padding: "4px 0" }}>
                                <span>{g.styleName}（門檻{g.thresholdAmount}，上限{max}）</span>
                                <div className="stepper">
                                  <button className="step-btn" disabled={g.qty <= 0} onClick={() => setBatchGiftQty(b.id, g.giftStyleId, g.qty - 1)}>－</button>
                                  <input className="qty" value={g.qty} readOnly />
                                  <button className="step-btn" disabled={g.qty >= max} onClick={() => setBatchGiftQty(b.id, g.giftStyleId, g.qty + 1)}>＋</button>
                                </div>
                              </div>
                            );
                          })}
                          {!b.platform && <div style={{ fontSize: 12, color: "#993C1D" }}>還沒指定平台，無法配置滿贈</div>}
                          {b.platform && unlockedStyles.filter((s) => !b.gifts.find((g: any) => g.giftStyleId === s.id)).length > 0 && (
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
              <div className="id-row"><span className="id-label">小計（成本）</span><input type="number" value={extraSubtotal} onChange={(e) => setExtraSubtotal(e.target.value)} placeholder="選填" /></div>
              <div className="id-row"><span className="id-label">備註</span><input type="text" value={extraNote} onChange={(e) => setExtraNote(e.target.value)} placeholder="選填" /></div>
              <button className="btn" onClick={addExtraPurchase}>新增額外採購紀錄</button>

              <div style={{ marginTop: 16, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
                {extraPurchases.length === 0 && <div style={{ fontSize: 13, color: "#8A8779" }}>還沒有任何額外採購紀錄</div>}
                {extraPurchases.map((p) => (
                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px dashed var(--line)" }}>
                    <span style={{ fontSize: 14 }}>
                      {p.orderNumber ? `[${p.orderNumber}] ` : ""}{p.styleName} x{p.qty}
                      {p.subtotal != null ? `　成本 ￥${p.subtotal}` : ""}
                      {p.note ? `（${p.note}）` : ""}
                    </span>
                    <button className="btn small danger" onClick={() => deleteExtraPurchase(p.id)}>刪除</button>
                  </div>
                ))}
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
                  <span style={{ fontSize: 14 }}>{b.username}：{b.productName}{b.style ? `（${b.style}）` : ""} 欠 {b.qty} 件</span>
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
                    {n.username}：{n.productName}{n.style ? `（${n.style}）` : ""} 還缺 {n.stillNeed} 件
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

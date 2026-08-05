"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { callJson, fetchJson } from "@/lib/adminClient";

export default function PurchaseBatchesPage() {
  const params = useParams();
  const router = useRouter();
  const campaignId = String(params.campaignId || "");

  const [campaign, setCampaign] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [tab, setTab] = useState<"batches" | "gap" | "extra">("batches");
  const [unassignedPool, setUnassignedPool] = useState<any[]>([]);
  const [purchaseBatches, setPurchaseBatches] = useState<any[]>([]);
  const [batchGiftGap, setBatchGiftGap] = useState<any[]>([]);
  const [extraPurchases, setExtraPurchases] = useState<any[]>([]);
  const [vendorPlatforms, setVendorPlatforms] = useState<any[]>([]);
  const [campaignGiftStyles, setCampaignGiftStyles] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [floatingToast, setFloatingToast] = useState("");

  const [newBatchPlatformId, setNewBatchPlatformId] = useState("");
  const [assignQtyByItem, setAssignQtyByItem] = useState<Record<string, string>>({});
  const [assignTargetBatchByItem, setAssignTargetBatchByItem] = useState<Record<string, string>>({});
  const [giftPickByBatch, setGiftPickByBatch] = useState<Record<string, string>>({});
  const [giftQtyByBatch, setGiftQtyByBatch] = useState<Record<string, string>>({});
  const [giftErrorByBatch, setGiftErrorByBatch] = useState<Record<string, string>>({});
  const [extraGiftStyleId, setExtraGiftStyleId] = useState("");
  const [extraQty, setExtraQty] = useState("");
  const [extraNote, setExtraNote] = useState("");

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
    const [d1, d2, d3, d4] = await Promise.all([
      fetchJson(`/api/admin/campaigns/${campaignId}/unassigned-items`),
      fetchJson(`/api/admin/campaigns/${campaignId}/purchase-batches`),
      fetchJson(`/api/admin/campaigns/${campaignId}/gift-gap-overview`),
      fetchJson(`/api/admin/campaigns/${campaignId}/extra-purchases`),
    ]);
    setUnassignedPool(d1.pool || []);
    setPurchaseBatches(d2.batches || []);
    setBatchGiftGap(d3.overview || []);
    setExtraPurchases(d4.extraPurchases || []);
  }

  async function loadVendorRules() {
    const d2 = await fetchJson(`/api/admin/campaigns/${campaignId}/vendor-platforms`);
    setVendorPlatforms(d2.platforms || []);
    const d3 = await fetchJson(`/api/admin/campaigns/${campaignId}/gift-styles`);
    setCampaignGiftStyles(d3.giftStyles || []);
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

  async function changeBatchPlatform(batchId: string, platformId: string) {
    await callJson(`/api/admin/campaigns/${campaignId}/purchase-batches/${batchId}`, "PATCH", { platformId: platformId || null });
    loadPurchaseBatchesData();
  }

  async function deleteBatch(batchId: string) {
    if (!confirm("確定要刪除這張採購單嗎？裡面的品項會回到未分配池。")) return;
    await callJson(`/api/admin/campaigns/${campaignId}/purchase-batches/${batchId}`, "DELETE", {});
    loadPurchaseBatchesData();
  }

  async function setBatchGift(batchId: string) {
    const giftStyleId = giftPickByBatch[batchId];
    const qty = Number(giftQtyByBatch[batchId]);
    if (!giftStyleId) return setGiftErrorByBatch((prev) => ({ ...prev, [batchId]: "請選擇滿贈款式" }));
    if (!isFinite(qty) || qty < 0) return setGiftErrorByBatch((prev) => ({ ...prev, [batchId]: "數量格式不正確" }));
    try {
      await callJson(`/api/admin/campaigns/${campaignId}/purchase-batches/${batchId}/gifts`, "PUT", { giftStyleId, qty });
      setGiftErrorByBatch((prev) => ({ ...prev, [batchId]: "" }));
      setGiftPickByBatch((prev) => ({ ...prev, [batchId]: "" }));
      setGiftQtyByBatch((prev) => ({ ...prev, [batchId]: "" }));
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
      await callJson(`/api/admin/campaigns/${campaignId}/extra-purchases`, "POST", { giftStyleId: extraGiftStyleId, qty, note: extraNote });
      setExtraGiftStyleId(""); setExtraQty(""); setExtraNote("");
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
    } catch (e: any) {
      setMsg(e.message || "新增失敗");
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
    await callJson(`/api/admin/shipment-items/${itemId}`, "PATCH", { arrived });
    loadArrivalTree(activeBatchForArrival.id);
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

      {!activeBatchForArrival ? (
        <div className="auth-card">
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <button className={`btn small ${tab === "batches" ? "" : "secondary"}`} onClick={() => setTab("batches")}>採購單</button>
            <button className={`btn small ${tab === "gap" ? "" : "secondary"}`} onClick={() => setTab("gap")}>贈品缺口總覽</button>
            <button className={`btn small ${tab === "extra" ? "" : "secondary"}`} onClick={() => setTab("extra")}>額外採購</button>
          </div>

          {tab === "batches" && (
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

          <button className="btn secondary" style={{ marginTop: 16 }} onClick={() => setActiveBatchForArrival(null)}>返回採購單列表</button>
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

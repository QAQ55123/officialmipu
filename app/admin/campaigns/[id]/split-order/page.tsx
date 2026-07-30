"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

type GiftInfo = { id: string; giftStyleId: string; styleName: string; qty: number; max: number };
type ItemInfo = {
  id: string;
  orderItemId: string;
  customerMemberId: string;
  customerName: string;
  productName: string;
  styleName: string | null;
  qty: number;
  unitAmount: number;
  reassignmentNote: string | null;
};
type OrderInfo = {
  id: string;
  platformId: string;
  adjustmentText: string;
  items: ItemInfo[];
  gifts: GiftInfo[];
  subtotal: number;
  bracket: number | null;
  discount: number;
  quota: number;
  giftTotal: number;
  adjustment: number;
  net: number;
};
type Platform = { id: string; name: string; orderGiftCap: number; tierCaps: Record<number, number> };
type Tier = { thresholdAmount: number; discountAmount: number };
type GapItem = { giftStyleId: string; styleName: string; required: number; allocated: number; diff: number };
type Backorder = { id: string; customerName: string; productName: string; styleName: string | null; qty: number };

export default function SplitOrderPage() {
  const params = useParams();
  const router = useRouter();
  const campaignId = params.id as string;

  const [batchId, setBatchId] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderInfo[]>([]);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [gapSummary, setGapSummary] = useState<GapItem[]>([]);
  const [backorders, setBackorders] = useState<Backorder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [computing, setComputing] = useState(false);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [extraFormOpen, setExtraFormOpen] = useState(false);

  const [openGiftAdd, setOpenGiftAdd] = useState<string | null>(null);
  const [openSplit, setOpenSplit] = useState<{ orderId: string; itemId: string } | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<{ orderId: string; itemId: string } | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerOptions, setCustomerOptions] = useState<{ id: string; username: string }[]>([]);

  const loadBatch = useCallback(
    async (id: string) => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/admin/campaigns/${campaignId}/split-order/${id}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "載入失敗");
        setOrders(data.orders);
        setPlatforms(data.platforms);
        setTiers(data.tiers);
        setGapSummary(data.gapSummary);
        setBackorders(data.backorders);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    },
    [campaignId]
  );

  async function loadLatestBatch() {
    setLoading(true);
    const res = await fetch(`/api/admin/campaigns/${campaignId}/split-order`);
    const data = await res.json();
    if (data.batches && data.batches.length > 0) {
      const latest = data.batches[0].id;
      setBatchId(latest);
      await loadBatch(latest);
    } else {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLatestBatch();
  }, [campaignId]);

  async function handleCompute() {
    setComputing(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/campaigns/${campaignId}/split-order`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "試算失敗");
      setBatchId(data.batchId);
      await loadBatch(data.batchId);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setComputing(false);
    }
  }

  async function handlePlatformChange(orderId: string, platformId: string) {
    await fetch(`/api/admin/split-order/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platformId }),
    });
    if (batchId) loadBatch(batchId);
  }

  async function handleAdjustmentChange(orderId: string, text: string) {
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, adjustmentText: text } : o)));
    await fetch(`/api/admin/split-order/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adjustmentText: text }),
    });
    if (batchId) loadBatch(batchId);
  }

  async function handleMoveItem(itemId: string, targetOrderId: string, moveQty: number) {
    const res = await fetch(`/api/admin/split-order/order-items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "move", targetOrderId, moveQty }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return;
    }
    setOpenSplit(null);
    if (batchId) loadBatch(batchId);
  }

  async function handleReassignCustomer(itemId: string, newCustomerMemberId: string) {
    const res = await fetch(`/api/admin/split-order/order-items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reassign", newCustomerMemberId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return;
    }
    setEditingCustomer(null);
    if (batchId) loadBatch(batchId);
  }

  async function handleGiftAdd(orderId: string, giftStyleId: string) {
    await fetch(`/api/admin/split-order/orders/${orderId}/gifts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ giftStyleId }),
    });
    setOpenGiftAdd(null);
    if (batchId) loadBatch(batchId);
  }

  async function handleGiftQty(giftId: string, qty: number) {
    if (qty <= 0) {
      await fetch(`/api/admin/split-order/gifts/${giftId}`, { method: "DELETE" });
    } else {
      await fetch(`/api/admin/split-order/gifts/${giftId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qty }),
      });
    }
    if (batchId) loadBatch(batchId);
  }

  useEffect(() => {
    if (!editingCustomer) return;
    fetch(`/api/admin/campaigns/${campaignId}/customers?q=${encodeURIComponent(customerSearch)}`)
      .then((r) => r.json())
      .then((d) => setCustomerOptions(d.customers || []));
  }, [customerSearch, editingCustomer, campaignId]);

  if (loading) return <div className="admin-page">載入中…</div>;

  return (
    <div className="admin-page" style={{ maxWidth: 1000 }}>
      <nav className="admin-nav">
        <Link href="/admin">← 後台首頁</Link>
      </nav>
      <h1>拆單工具</h1>
      <p className="admin-sub">把該檔期所有顧客商品混在一起拆分成多張採購單，最大化贈品與折扣</p>

      {error && <div className="admin-error-box">{error}</div>}

      <div className="admin-toolbar">
        <button className="btn" onClick={handleCompute} disabled={computing}>
          {computing ? "試算中…" : "重新試算拆單"}
        </button>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setSettingsOpen((v) => !v)}>廠商規則設定</button>
          <button onClick={() => setExtraFormOpen((v) => !v)}>額外採購</button>
        </div>
      </div>

      {settingsOpen && (
        <VendorSettingsPanel campaignId={campaignId} tiers={tiers} platforms={platforms} onSaved={() => batchId && loadBatch(batchId)} />
      )}

      {extraFormOpen && (
        <ExtraPurchaseForm campaignId={campaignId} onSaved={() => { setExtraFormOpen(false); if (batchId) loadBatch(batchId); }} />
      )}

      {gapSummary.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>贈品缺口總覽</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
            {gapSummary.map((g) => (
              <div
                key={g.giftStyleId}
                style={{
                  background: g.diff < 0 ? "#FDE8E8" : g.diff > 0 ? "#E6F4EA" : "#F7F5EC",
                  borderRadius: 8,
                  padding: "10px 12px",
                }}
              >
                <div style={{ fontSize: 12, color: "var(--muted)" }}>{g.styleName}</div>
                <div style={{ fontSize: 15, fontWeight: 500 }}>
                  {g.allocated} / {g.required}
                  {g.diff < 0 && <span style={{ fontSize: 12, fontWeight: 400 }}>（缺 {Math.abs(g.diff)}）</span>}
                  {g.diff > 0 && <span style={{ fontSize: 12, fontWeight: 400 }}>（餘 {g.diff}）</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {backorders.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>欠貨總覽</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {backorders.map((b) => (
              <div key={b.id} style={{ fontSize: 13, padding: "5px 10px", background: "#FDF3E0", borderRadius: 6 }}>
                {b.customerName} 欠 {b.productName}
                {b.styleName ? `（${b.styleName}）` : ""} x{b.qty}
              </div>
            ))}
          </div>
        </div>
      )}

      {orders.length === 0 ? (
        <div className="admin-empty">還沒有拆單結果，按上面「重新試算拆單」開始</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {orders.map((order, idx) => {
            const giftOver = order.giftTotal > order.quota;
            const eligibleGiftIds = order.gifts.map((g) => g.giftStyleId);
            return (
              <div
                key={order.id}
                style={{
                  background: "#fff",
                  border: `1px solid ${giftOver ? "#E0A63C" : "#E5E1D3"}`,
                  borderRadius: 12,
                  padding: 20,
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const data = JSON.parse(e.dataTransfer.getData("text/plain"));
                  handleMoveItem(data.itemId, order.id, data.qty);
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
                  <span style={{ fontWeight: 500 }}>第{idx + 1}單</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <select value={order.platformId} onChange={(e) => handlePlatformChange(order.id, e.target.value)}>
                      {platforms.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <span style={{ fontSize: 13, color: "var(--muted)" }}>
                      小計 {Math.round(order.subtotal * 10) / 10} · {order.bracket ? `${order.bracket}R` : "未達門檻"} · 折
                      {order.discount} · 可選{order.quota}
                    </span>
                    <button onClick={() => router.push(`/admin/campaigns/${campaignId}/split-order/${order.id}/arrival`)}>
                      到貨追蹤
                    </button>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 4, borderTop: "1px solid #E5E1D3", paddingTop: 10 }}>
                  {order.items.map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      orderId={order.id}
                      isEditingCustomer={editingCustomer?.itemId === item.id}
                      onStartEditCustomer={() => {
                        setEditingCustomer({ orderId: order.id, itemId: item.id });
                        setCustomerSearch("");
                      }}
                      customerOptions={customerOptions}
                      onSelectCustomer={(memberId: string) => handleReassignCustomer(item.id, memberId)}
                      onSearchChange={setCustomerSearch}
                      isSplitOpen={openSplit?.itemId === item.id}
                      onToggleSplit={() => setOpenSplit(openSplit?.itemId === item.id ? null : { orderId: order.id, itemId: item.id })}
                      orders={orders}
                      onMove={(targetOrderId: string, moveQty: number) => handleMoveItem(item.id, targetOrderId, moveQty)}
                    />
                  ))}
                </div>

                <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #E5E1D3" }}>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>
                    贈品配置（已選 {order.giftTotal} / 可選 {order.quota}）
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                    {order.gifts.map((g) => (
                      <span
                        key={g.id}
                        style={{
                          fontSize: 13,
                          padding: "5px 10px",
                          background: "#F0EEE4",
                          borderRadius: 6,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        {g.styleName}
                        <button onClick={() => handleGiftQty(g.id, g.qty - 1)} style={{ width: 18 }}>
                          −
                        </button>
                        {g.qty}
                        <button onClick={() => handleGiftQty(g.id, g.qty + 1)} disabled={g.qty >= g.max} style={{ width: 18 }}>
                          +
                        </button>
                        <span style={{ fontSize: 11, color: "var(--muted)" }}>上限{g.max}</span>
                      </span>
                    ))}
                    <GiftAddControl
                      orderId={order.id}
                      campaignId={campaignId}
                      alreadyAdded={eligibleGiftIds}
                      open={openGiftAdd === order.id}
                      onToggle={() => setOpenGiftAdd(openGiftAdd === order.id ? null : order.id)}
                      onAdd={(styleId: string) => handleGiftAdd(order.id, styleId)}
                    />
                  </div>
                  {giftOver && (
                    <div style={{ fontSize: 13, color: "#B45309", marginTop: 8 }}>
                      已超過此單門檻可選數量（{order.giftTotal} / {order.quota}）
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, paddingTop: 12, borderTop: "1px solid #E5E1D3", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, color: "var(--muted)" }}>額外調整</span>
                  <input
                    type="text"
                    value={order.adjustmentText}
                    onChange={(e) => handleAdjustmentChange(order.id, e.target.value)}
                    placeholder="-20 -30"
                    style={{ width: 110 }}
                  />
                  <span style={{ fontSize: 13, color: "var(--muted)" }}>調整 {Math.round(order.adjustment * 10) / 10}</span>
                  <span style={{ fontSize: 13, color: "var(--muted)" }}>折扣 -{order.discount}</span>
                  <span style={{ marginLeft: "auto", fontWeight: 500, fontSize: 15 }}>實收 {Math.round(order.net * 10) / 10}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ItemRow({
  item,
  orderId,
  isEditingCustomer,
  onStartEditCustomer,
  customerOptions,
  onSelectCustomer,
  onSearchChange,
  isSplitOpen,
  onToggleSplit,
  orders,
  onMove,
}: any) {
  const [moveQty, setMoveQty] = useState(1);
  const [targetOrderId, setTargetOrderId] = useState("");
  const [targetSearch, setTargetSearch] = useState("");

  const targetOptions = orders.filter((o: OrderInfo) => o.id !== orderId).filter((o: OrderInfo, idx: number) => {
    const label = `第${orders.findIndex((x: OrderInfo) => x.id === o.id) + 1}單`;
    return targetSearch === "" || label.includes(targetSearch);
  });

  return (
    <div>
      <div
        draggable
        onDragStart={(e) => e.dataTransfer.setData("text/plain", JSON.stringify({ itemId: item.id, qty: item.qty }))}
        style={{ display: "grid", gridTemplateColumns: "110px 1fr 55px 55px 55px 26px", gap: 8, fontSize: 13, padding: "6px 8px", borderRadius: 6, alignItems: "center", cursor: "grab", background: item.reassignmentNote ? "#FDF3E0" : "transparent" }}
      >
        {isEditingCustomer ? (
          <span style={{ position: "relative" }}>
            <input
              autoFocus
              placeholder="搜尋顧客"
              onChange={(e) => onSearchChange(e.target.value)}
              style={{ width: 95, fontSize: 12 }}
            />
            <div style={{ position: "absolute", top: 30, left: 0, width: 140, maxHeight: 160, overflowY: "auto", background: "#fff", border: "1px solid #E5E1D3", borderRadius: 6, zIndex: 10 }}>
              {customerOptions.map((c: any) => (
                <div key={c.id} onClick={() => onSelectCustomer(c.id)} style={{ padding: "6px 10px", fontSize: 13, cursor: "pointer" }}>
                  {c.username}
                </div>
              ))}
            </div>
          </span>
        ) : (
          <span style={{ display: "flex", alignItems: "center", gap: 3, color: item.reassignmentNote ? "#B45309" : "#33415C" }}>
            {item.customerName}
            <button onClick={onStartEditCustomer} style={{ width: 16, height: 16, padding: 0, border: "none", background: "transparent" }}>
              ✎
            </button>
          </span>
        )}
        <span>
          {item.productName}
          {item.styleName ? `（${item.styleName}）` : ""}
          {item.reassignmentNote && <span style={{ fontSize: 11, color: "#B45309" }}> （{item.reassignmentNote}）</span>}
        </span>
        <span style={{ color: "var(--muted)", textAlign: "right" }}>{item.unitAmount}</span>
        <span style={{ color: "var(--muted)", textAlign: "right" }}>x{item.qty}</span>
        <span style={{ textAlign: "right", fontWeight: 500 }}>{item.unitAmount * item.qty}</span>
        {item.qty > 1 ? (
          <button onClick={onToggleSplit} style={{ width: 26, height: 26, padding: 0 }}>
            ✂
          </button>
        ) : (
          <span />
        )}
      </div>

      {isSplitOpen && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 8px 12px 118px", fontSize: 13, flexWrap: "wrap" }}>
          <span>搬移數量</span>
          <input type="number" min={1} max={item.qty - 1} value={moveQty} onChange={(e) => setMoveQty(Number(e.target.value))} style={{ width: 60 }} />
          <span>個 移到</span>
          <span style={{ position: "relative" }}>
            <input placeholder="搜尋單號" onChange={(e) => setTargetSearch(e.target.value)} style={{ width: 140 }} />
          </span>
          <select value={targetOrderId} onChange={(e) => setTargetOrderId(e.target.value)}>
            <option value="">選擇目標</option>
            {targetOptions.map((o: OrderInfo) => (
              <option key={o.id} value={o.id}>
                第{orders.findIndex((x: OrderInfo) => x.id === o.id) + 1}單
              </option>
            ))}
          </select>
          <button onClick={() => targetOrderId && onMove(targetOrderId, moveQty)}>確認搬移</button>
        </div>
      )}
    </div>
  );
}

function GiftAddControl({ orderId, campaignId, alreadyAdded, open, onToggle, onAdd }: any) {
  const [allStyles, setAllStyles] = useState<{ id: string; style_name: string; threshold_amount: number }[]>([]);
  const [selected, setSelected] = useState("");

  useEffect(() => {
    if (!open) return;
    fetch(`/api/admin/campaigns/${campaignId}/gift-styles`)
      .then((r) => r.json())
      .then((d) => setAllStyles(d.giftStyles || []));
  }, [open]);

  const options = allStyles.filter((s) => !alreadyAdded.includes(s.id));

  return open ? (
    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <select value={selected} onChange={(e) => setSelected(e.target.value)} style={{ minWidth: 160 }}>
        <option value="">選擇款式</option>
        {options.map((s) => (
          <option key={s.id} value={s.id}>
            {s.style_name}（門檻{s.threshold_amount}）
          </option>
        ))}
      </select>
      <button onClick={() => selected && onAdd(selected)}>加入</button>
      <button onClick={onToggle}>取消</button>
    </span>
  ) : (
    <button onClick={onToggle} style={{ padding: "4px 10px", fontSize: 13 }}>
      ＋ 新增贈品
    </button>
  );
}

function VendorSettingsPanel({ campaignId, tiers, platforms, onSaved }: any) {
  const [localTiers, setLocalTiers] = useState<Tier[]>(tiers.length > 0 ? tiers : [{ thresholdAmount: 100, discountAmount: 0 }]);
  const [localPlatforms, setLocalPlatforms] = useState<Platform[]>(platforms);
  const [newPlatformName, setNewPlatformName] = useState("");
  const [newPlatformCap, setNewPlatformCap] = useState(5);

  async function saveTiers() {
    await fetch(`/api/admin/campaigns/${campaignId}/vendor-gift-tiers`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tiers: localTiers }),
    });
    onSaved();
  }

  async function addPlatform() {
    await fetch(`/api/admin/campaigns/${campaignId}/vendor-platforms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newPlatformName, orderGiftCap: newPlatformCap }),
    });
    setNewPlatformName("");
    onSaved();
  }

  async function savePlatformTierCap(platformId: string, thresholdAmount: number, perStyleCap: number) {
    const platform = localPlatforms.find((p) => p.id === platformId);
    if (!platform) return;
    const tierCaps = localTiers.map((t) => ({
      thresholdAmount: t.thresholdAmount,
      perStyleCap: t.thresholdAmount === thresholdAmount ? perStyleCap : platform.tierCaps[t.thresholdAmount] ?? 1,
    }));
    await fetch(`/api/admin/campaigns/${campaignId}/vendor-platforms/${platformId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tierCaps }),
    });
    onSaved();
  }

  return (
    <div className="admin-form-card">
      <div style={{ fontWeight: 500, marginBottom: 8 }}>門檻金額與折扣（三平台共用）</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
        {localTiers.map((t, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <span>門檻</span>
            <input
              type="number"
              value={t.thresholdAmount}
              onChange={(e) => {
                const next = [...localTiers];
                next[i] = { ...next[i], thresholdAmount: Number(e.target.value) };
                setLocalTiers(next);
              }}
              style={{ width: 80 }}
            />
            <span>折扣</span>
            <input
              type="number"
              value={t.discountAmount}
              onChange={(e) => {
                const next = [...localTiers];
                next[i] = { ...next[i], discountAmount: Number(e.target.value) };
                setLocalTiers(next);
              }}
              style={{ width: 80 }}
            />
          </div>
        ))}
        <button onClick={() => setLocalTiers([...localTiers, { thresholdAmount: 0, discountAmount: 0 }])} style={{ width: "fit-content" }}>
          ＋ 新增門檻
        </button>
        <button className="btn" onClick={saveTiers} style={{ width: "fit-content" }}>
          儲存門檻設定
        </button>
      </div>

      <div style={{ fontWeight: 500, marginBottom: 8 }}>各平台規則</div>
      {localPlatforms.map((p) => (
        <div key={p.id} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid #E5E1D3" }}>
          <div style={{ fontWeight: 500, marginBottom: 6 }}>
            {p.name}（單筆上限 {p.orderGiftCap}）
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 12 }}>
            {localTiers.map((t) => (
              <span key={t.thresholdAmount}>
                {t.thresholdAmount}R 每款上限{" "}
                <input
                  type="number"
                  defaultValue={p.tierCaps[t.thresholdAmount] ?? 1}
                  onBlur={(e) => savePlatformTierCap(p.id, t.thresholdAmount, Number(e.target.value))}
                  style={{ width: 50 }}
                />
              </span>
            ))}
          </div>
        </div>
      ))}

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
        <input placeholder="新平台名稱" value={newPlatformName} onChange={(e) => setNewPlatformName(e.target.value)} />
        <input type="number" value={newPlatformCap} onChange={(e) => setNewPlatformCap(Number(e.target.value))} style={{ width: 70 }} />
        <button onClick={addPlatform}>新增平台</button>
      </div>
    </div>
  );
}

function ExtraPurchaseForm({ campaignId, onSaved }: any) {
  const [orderRef, setOrderRef] = useState("");
  const [giftStyleId, setGiftStyleId] = useState("");
  const [styles, setStyles] = useState<{ id: string; style_name: string }[]>([]);
  const [qty, setQty] = useState(1);
  const [subtotal, setSubtotal] = useState(0);

  useEffect(() => {
    fetch(`/api/admin/campaigns/${campaignId}/gift-styles`)
      .then((r) => r.json())
      .then((d) => setStyles(d.giftStyles || []));
  }, [campaignId]);

  async function submit() {
    await fetch(`/api/admin/campaigns/${campaignId}/extra-purchases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderRef, giftStyleId, qty, subtotal }),
    });
    onSaved();
  }

  return (
    <div className="admin-form-card">
      <div style={{ fontWeight: 500, marginBottom: 8 }}>額外採購</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input placeholder="訂單編號" value={orderRef} onChange={(e) => setOrderRef(e.target.value)} />
        <select value={giftStyleId} onChange={(e) => setGiftStyleId(e.target.value)}>
          <option value="">選擇款式</option>
          {styles.map((s) => (
            <option key={s.id} value={s.id}>
              {s.style_name}
            </option>
          ))}
        </select>
        <input type="number" value={qty} onChange={(e) => setQty(Number(e.target.value))} style={{ width: 60 }} />
        <input type="number" placeholder="小計" value={subtotal} onChange={(e) => setSubtotal(Number(e.target.value))} style={{ width: 80 }} />
        <button className="btn" onClick={submit}>
          送出
        </button>
      </div>
    </div>
  );
}

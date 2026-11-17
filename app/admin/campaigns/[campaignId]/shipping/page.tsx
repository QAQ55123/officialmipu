"use client";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { callJson, fetchJson } from "@/lib/adminClient";

type WorkItem = {
  type: "item" | "gift";
  id: string;
  seriesName: string;
  name: string;
  style: string;
  ordered: number;
  arrived: number;
  shipped: number;
  shippable: number;
  notArrived: number;
  overShipped: number; // 已出貨超過到貨（例如重複建了批次）
  batchNos: number[];
  isGift: boolean;
};
type ShippedBatch = {
  id: string;
  batchNo: number;
  customerShippingFee: number;
  items: { label: string; qty: number }[];
};
type Customer = {
  orderId: string;
  orderNo: string;
  username: string;
  shippedBatchCount: number;
  notArrivedCount: number;
  overShippedCount: number;
  lines: WorkItem[]; // 這位顧客的所有品項（可出貨／未到貨／已出貨）
  items: WorkItem[]; // 其中可以勾選出貨的
  shippedBatches: ShippedBatch[];
};

/**
 * 出貨作業：列出這個檔期「至少有一件已到貨」的顧客，每位顧客的所有品項都顯示狀態，
 * 店家才判斷得了東西到齊了沒，再決定現在出還是等到齊。
 * 原本要一張訂單一張訂單去訂單管理查、一張一張建批次，顧客一多根本沒辦法用。
 */
export default function ShippingWorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const campaignId = String(params.campaignId || "");

  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [campaignName, setCampaignName] = useState("");
  const [msg, setMsg] = useState("");
  const [filter, setFilter] = useState("");
  // key = `${orderId}|${type}|${id}`，值是要出的數量
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [shopUrl, setShopUrl] = useState("");
  const [busy, setBusy] = useState("");
  const [onlyComplete, setOnlyComplete] = useState(false); // 只看全部到齊的顧客
  const creatingRef = useRef(false); // 建立中鎖住，擋同一瞬間的連點

  async function load() {
    setLoading(true);
    try {
      const d = await fetchJson(`/api/admin/campaigns/${campaignId}/shipping-workspace`);
      setCustomers(d.customers || []);
    } catch (e: any) {
      setMsg(e.message || "載入失敗");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!campaignId) return;
    fetchJson(`/api/admin/campaigns`)
      .then((d) => {
        const c = (d.campaigns || []).find((x: any) => x.id === campaignId);
        if (c) setCampaignName(c.name);
      })
      .catch(() => {});
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  const keyOf = (c: Customer, it: WorkItem) => `${c.orderId}|${it.type}|${it.id}`;

  // 搜尋到顧客或其中任一品項時，整位顧客的所有品項都顯示（要看得到全部才判斷得了到齊了沒）
  const visible = customers.filter((c) => {
    if (onlyComplete && c.notArrivedCount > 0) return false;
    const q = filter.trim().toLowerCase();
    if (!q) return true;
    if (c.username.toLowerCase().includes(q)) return true;
    return c.lines.some((it) => `${it.seriesName}${it.name}${it.style}`.toLowerCase().includes(q));
  });
  const completeCount = customers.filter((c) => c.notArrivedCount === 0).length;

  const pickedList = Object.entries(picks)
    .filter(([, qty]) => qty > 0)
    .map(([k, qty]) => {
      const [orderId, type, id] = k.split("|");
      return { orderId, type: type as "item" | "gift", id, qty };
    });

  function toggleItem(c: Customer, it: WorkItem, checked: boolean) {
    setPicks((prev) => ({ ...prev, [keyOf(c, it)]: checked ? it.shippable : 0 }));
  }
  function setQty(c: Customer, it: WorkItem, qty: number) {
    const v = Math.max(0, Math.min(it.shippable, qty));
    setPicks((prev) => ({ ...prev, [keyOf(c, it)]: v }));
  }
  function toggleCustomer(c: Customer, checked: boolean) {
    setPicks((prev) => {
      const next = { ...prev };
      c.items.forEach((it) => (next[keyOf(c, it)] = checked ? it.shippable : 0));
      return next;
    });
  }
  // 全選只選目前畫面上看得到的顧客（開了「只看全部到齊」就只選到齊的）
  function toggleAll(checked: boolean) {
    setPicks(() => {
      const next: Record<string, number> = {};
      visible.forEach((c) => c.items.forEach((it) => (next[keyOf(c, it)] = checked ? it.shippable : 0)));
      return next;
    });
  }

  async function deleteBatch(c: Customer, b: ShippedBatch) {
    if (!confirm(`確定要刪除 ${c.username} 的第 ${b.batchNo} 批嗎？裡面的品項會回到可出貨的狀態。\n如果已經通知過顧客，刪除不會通知顧客，請自行確認。`)) return;
    setBusy(`del-${b.id}`);
    setMsg("");
    try {
      await callJson(`/api/admin/orders/${encodeURIComponent(c.orderNo)}/shipping-batches/${b.id}`, "DELETE", {});
      setMsg(`已刪除 ${c.username} 的第 ${b.batchNo} 批`);
      load();
    } catch (e: any) {
      setMsg(e.message || "刪除失敗");
    } finally {
      setBusy("");
    }
  }

  async function createBatches() {
    if (pickedList.length === 0) return setMsg("請先勾選要出貨的品項");
    if (creatingRef.current) return;
    creatingRef.current = true;
    setBusy("batch");
    setMsg("");
    try {
      const d = await callJson(`/api/admin/campaigns/${campaignId}/shipping-workspace/create-batches`, "POST", {
        picks: pickedList,
      });
      setMsg(`已建立 ${d.createdCount} 個出貨批次`);
      setPicks({});
      load();
    } catch (e: any) {
      setMsg(e.message || "建立失敗");
      // 被擋下來通常代表畫面上的資料已經過時（例如別的地方剛建過批次），重新載入讓畫面跟資料庫一致
      setPicks({});
      load();
    } finally {
      creatingRef.current = false;
      setBusy("");
    }
  }

  async function exportMyship() {
    setBusy("export");
    setMsg("");
    try {
      const r = await fetch(`/api/admin/campaigns/${campaignId}/myship-export`, { cache: "no-store" });
      if (!r.ok) {
        const d = await r.json();
        throw new Error(d.error || "匯出失敗");
      }
      const total = r.headers.get("X-Total-Customers") || "0";
      const over = decodeURIComponent(r.headers.get("X-Over-Limit") || "");
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `賣貨便_${campaignName || "檔期"}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg(`已匯出 ${total} 位顧客${over ? `；金額超過賣貨便單規格上限、需要另外處理：${over}` : ""}`);
    } catch (e: any) {
      setMsg(e.message || "匯出失敗");
    } finally {
      setBusy("");
    }
  }

  async function notifyCustomers() {
    if (pickedList.length === 0) return setMsg("請先勾選要通知的品項");
    if (!shopUrl.trim()) return setMsg("請填寫賣場網址");
    setBusy("notify");
    setMsg("");
    try {
      const d = await callJson(`/api/admin/campaigns/${campaignId}/shipping-workspace/notify`, "POST", {
        shopUrl: shopUrl.trim(),
        picks: pickedList,
      });
      const failText = (d.failed || []).length > 0 ? `；無法寄送：${(d.failed || []).join("、")}` : "";
      setMsg(`已寄出 ${d.sentCount} 封到貨通知${failText}`);
    } catch (e: any) {
      setMsg(e.message || "寄送失敗");
    } finally {
      setBusy("");
    }
  }

  const totalItems = visible.reduce((s, c) => s + c.items.length, 0);

  return (
    <div className="page-wrap" style={{ maxWidth: 900, margin: "0 auto", padding: "24px 20px 60px" }}>
      <button className="btn secondary" style={{ marginBottom: 16 }} onClick={() => router.push("/admin")}>
        ← 返回後台
      </button>

      <h2 style={{ marginBottom: 4 }}>出貨作業{campaignName ? `：${campaignName}` : ""}</h2>
      <p style={{ fontSize: 12, color: "#8A8779", marginTop: 0, marginBottom: 16 }}>
        列出至少有一件已到貨的顧客（不管出貨了沒），每位顧客的所有品項都會顯示狀態（可出貨／未到貨／已出貨）。一件都還沒到的顧客不會列出來。
      </p>

      {msg && (
        <div style={{ fontSize: 13, marginBottom: 12, padding: "8px 12px", background: "#F7F5EF", borderRadius: 8 }}>{msg}</div>
      )}

      {loading ? (
        <div style={{ fontSize: 13, color: "#8A8779" }}>載入中…</div>
      ) : customers.length === 0 ? (
        <div style={{ fontSize: 13, color: "#8A8779" }}>目前沒有已到貨的品項</div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={pickedList.length > 0 && pickedList.length === totalItems}
                onChange={(e) => toggleAll(e.target.checked)}
                style={{ width: 16, height: 16 }}
              />
              全選
            </label>
            <input
              type="text"
              className="admin-input"
              placeholder="搜尋顧客或商品"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={{ flex: 1, minWidth: 150 }}
            />
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              <input type="checkbox" checked={onlyComplete} onChange={(e) => setOnlyComplete(e.target.checked)} style={{ width: 16, height: 16 }} />
              只看全部到齊（{completeCount} 位）
            </label>
            <span style={{ fontSize: 12, color: "#8A8779" }}>
              已勾選 {pickedList.length} 項 / 共 {totalItems} 項
            </span>
          </div>

          {visible.map((c) => {
            const allChecked = c.items.length > 0 && c.items.every((it) => (picks[keyOf(c, it)] || 0) > 0);
            return (
              <div
                key={c.orderId}
                style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, padding: 14, marginBottom: 10 }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
                  <label style={{ fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>
                    <input type="checkbox" checked={allChecked} disabled={c.items.length === 0} onChange={(e) => toggleCustomer(c, e.target.checked)} style={{ width: 16, height: 16 }} />
                    {c.username}
                    {c.notArrivedCount === 0 ? (
                      <span style={{ fontSize: 11, fontWeight: 500, color: "#0F6E56", background: "#E1F5EE", padding: "1px 8px", borderRadius: 999 }}>全部到齊</span>
                    ) : (
                      <span style={{ fontSize: 11, fontWeight: 500, color: "#854F0B", background: "#FAEEDA", padding: "1px 8px", borderRadius: 999 }}>還有 {c.notArrivedCount} 件沒到</span>
                    )}
                    {c.overShippedCount > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 500, color: "#A32D2D", background: "#FCEBEB", padding: "1px 8px", borderRadius: 999 }}>重複出貨 {c.overShippedCount} 件</span>
                    )}
                  </label>
                  <span style={{ fontSize: 12, color: "#8A8779" }}>
                    訂單 {c.orderNo}
                    {c.shippedBatchCount > 0 && `　已出過 ${c.shippedBatchCount} 批`}
                  </span>
                </div>
                <div style={{ paddingLeft: 20, fontSize: 13 }}>
                  {c.lines.map((it) => {
                    const qty = picks[keyOf(c, it)] || 0;
                    const canPick = it.shippable > 0;
                    // 可出貨以外的部分（還沒到、已出貨）用小字標在後面
                    const notes: string[] = [];
                    if (it.notArrived > 0) notes.push(`未到貨 ${it.notArrived}`);
                    if (it.shipped > 0) notes.push(`已出貨 ${it.shipped}${it.batchNos.length ? `（第 ${it.batchNos.join("、")} 批）` : ""}`);
                    return (
                      <div key={`${it.type}-${it.id}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", gap: 8, flexWrap: "wrap", color: canPick ? undefined : "#8A8779" }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                          {canPick ? (
                            <input type="checkbox" checked={qty > 0} onChange={(e) => toggleItem(c, it, e.target.checked)} style={{ width: 15, height: 15, flexShrink: 0 }} />
                          ) : (
                            <span style={{ width: 15, flexShrink: 0 }} />
                          )}
                          {it.isGift && (
                            <span style={{ display: "inline-block", fontSize: 11, color: "#3C3489", background: "#EEEDFE", padding: "1px 8px", borderRadius: 999, flexShrink: 0 }}>
                              滿贈
                            </span>
                          )}
                          <span style={{ wordBreak: "break-word" }}>
                            {it.seriesName ? `${it.seriesName} / ` : ""}
                            {it.name}
                            {it.style ? `（${it.style}）` : ""} x{it.ordered}
                          </span>
                        </label>
                        <span style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, flexWrap: "wrap" }}>
                          {notes.length > 0 && (
                            <span style={{ fontSize: 12, color: it.notArrived > 0 ? "#854F0B" : "#8A8779" }}>{notes.join("・")}</span>
                          )}
                          {it.overShipped > 0 && (
                            <span style={{ fontSize: 12, fontWeight: 600, color: "#A32D2D" }}>已出貨超過到貨 {it.overShipped} 件</span>
                          )}
                          {canPick && (
                            <>
                              <span style={{ fontSize: 12, color: "#0F6E56" }}>可出貨</span>
                              <input
                                type="number"
                                className="admin-input"
                                value={qty}
                                min={0}
                                max={it.shippable}
                                onChange={(e) => setQty(c, it, Number(e.target.value))}
                                style={{ width: 70 }}
                              />
                              <span style={{ color: "#8A8779", fontSize: 12 }}>/ {it.shippable}</span>
                            </>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {c.shippedBatches.length > 0 && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed var(--line)" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#5F5E5A", marginBottom: 4 }}>已建立的出貨批次</div>
                    {c.shippedBatches.map((b) => (
                      <div key={b.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, fontSize: 12, color: "#5F5E5A", padding: "3px 0" }}>
                        <span style={{ minWidth: 0, wordBreak: "break-word" }}>
                          第 {b.batchNo} 批：{b.items.map((x) => `${x.label} x${x.qty}`).join("、")}　運費 NT$ {b.customerShippingFee}
                        </span>
                        <button className="btn small danger" style={{ flexShrink: 0 }} onClick={() => deleteBatch(c, b)} disabled={busy === `del-${b.id}`}>
                          {busy === `del-${b.id}` ? "刪除中…" : "刪除"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          <div style={{ background: "#F7F5EF", borderRadius: 12, padding: 14, marginTop: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>對勾選的品項執行</div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
              <button className="btn small" onClick={createBatches} disabled={busy === "batch"}>
                {busy === "batch" ? "建立中…" : `建立出貨批次（${pickedList.length} 項）`}
              </button>
              <span style={{ fontSize: 12, color: "#8A8779" }}>每張訂單各自建立批次並算運費</span>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
              <button className="btn small secondary" onClick={exportMyship} disabled={busy === "export"}>
                {busy === "export" ? "匯出中…" : "匯出賣貨便表單"}
              </button>
              <span style={{ fontSize: 12, color: "#8A8779" }}>依「尚欠金額」產生，每 50 人一個商品</span>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input
                type="text"
                className="admin-input"
                placeholder="賣場網址"
                value={shopUrl}
                onChange={(e) => setShopUrl(e.target.value)}
                style={{ flex: 1, minWidth: 170 }}
              />
              <button className="btn small secondary" onClick={notifyCustomers} disabled={busy === "notify"}>
                {busy === "notify" ? "寄送中…" : "寄送到貨通知"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

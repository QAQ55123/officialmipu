"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { callJson, fetchJson } from "@/lib/adminClient";

type WorkItem = {
  type: "item" | "gift";
  id: string;
  seriesName: string;
  name: string;
  style: string;
  shippable: number;
  isGift: boolean;
};
type Customer = {
  orderId: string;
  orderNo: string;
  username: string;
  shippedBatchCount: number;
  items: WorkItem[];
};

/**
 * 出貨作業：把這個檔期「已到貨、還沒出貨」的品項依顧客列出來，一次處理完。
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

  const visible = customers
    .map((c) => {
      if (!filter.trim()) return c;
      const q = filter.trim().toLowerCase();
      if (c.username.toLowerCase().includes(q)) return c;
      const items = c.items.filter((it) => `${it.seriesName}${it.name}${it.style}`.toLowerCase().includes(q));
      return items.length > 0 ? { ...c, items } : null;
    })
    .filter(Boolean) as Customer[];

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
  function toggleAll(checked: boolean) {
    setPicks(() => {
      const next: Record<string, number> = {};
      customers.forEach((c) => c.items.forEach((it) => (next[keyOf(c, it)] = checked ? it.shippable : 0)));
      return next;
    });
  }

  async function createBatches() {
    if (pickedList.length === 0) return setMsg("請先勾選要出貨的品項");
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
    } finally {
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

  const totalItems = customers.reduce((s, c) => s + c.items.length, 0);

  return (
    <div className="page-wrap" style={{ maxWidth: 900, margin: "0 auto", padding: "24px 20px 60px" }}>
      <button className="btn secondary" style={{ marginBottom: 16 }} onClick={() => router.push("/admin")}>
        ← 返回後台
      </button>

      <h2 style={{ marginBottom: 4 }}>出貨作業{campaignName ? `：${campaignName}` : ""}</h2>
      <p style={{ fontSize: 12, color: "#8A8779", marginTop: 0, marginBottom: 16 }}>
        只列出「已到貨、還沒出貨」的品項，依顧客分組。沒到貨的之後到了會自動出現在這裡。
      </p>

      {msg && (
        <div style={{ fontSize: 13, marginBottom: 12, padding: "8px 12px", background: "#F7F5EF", borderRadius: 8 }}>{msg}</div>
      )}

      {loading ? (
        <div style={{ fontSize: 13, color: "#8A8779" }}>載入中…</div>
      ) : customers.length === 0 ? (
        <div style={{ fontSize: 13, color: "#8A8779" }}>目前沒有已到貨、待出貨的品項</div>
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
            <span style={{ fontSize: 12, color: "#8A8779" }}>
              已勾選 {pickedList.length} 項 / 共 {totalItems} 項
            </span>
          </div>

          {visible.map((c) => {
            const allChecked = c.items.every((it) => (picks[keyOf(c, it)] || 0) > 0);
            return (
              <div
                key={c.orderId}
                style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, padding: 14, marginBottom: 10 }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
                  <label style={{ fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>
                    <input type="checkbox" checked={allChecked} onChange={(e) => toggleCustomer(c, e.target.checked)} style={{ width: 16, height: 16 }} />
                    {c.username}
                  </label>
                  <span style={{ fontSize: 12, color: "#8A8779" }}>
                    訂單 {c.orderNo}
                    {c.shippedBatchCount > 0 && `　已出過 ${c.shippedBatchCount} 批`}
                  </span>
                </div>
                <div style={{ paddingLeft: 20, fontSize: 13 }}>
                  {c.items.map((it) => {
                    const qty = picks[keyOf(c, it)] || 0;
                    return (
                      <div key={`${it.type}-${it.id}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", gap: 8, flexWrap: "wrap" }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                          <input type="checkbox" checked={qty > 0} onChange={(e) => toggleItem(c, it, e.target.checked)} style={{ width: 15, height: 15, flexShrink: 0 }} />
                          {it.isGift && (
                            <span style={{ display: "inline-block", fontSize: 11, color: "#3C3489", background: "#EEEDFE", padding: "1px 8px", borderRadius: 999, flexShrink: 0 }}>
                              滿贈
                            </span>
                          )}
                          <span style={{ wordBreak: "break-word" }}>
                            {it.seriesName ? `${it.seriesName} / ` : ""}
                            {it.name}
                            {it.style ? `（${it.style}）` : ""}
                          </span>
                        </label>
                        <span style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
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
                        </span>
                      </div>
                    );
                  })}
                </div>
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

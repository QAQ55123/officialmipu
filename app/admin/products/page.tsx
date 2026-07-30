"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Variant = { id: string; style_name: string | null };
type Product = {
  id: string;
  name: string;
  amount: number;
  shipping_fee: number;
  has_discount_flag: boolean;
  image_url: string | null;
  series_id: string | null;
  product_variants: Variant[];
};
type Series = { id: string; name: string; is_gift_series: boolean };

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

  // 手動新增表單
  const [name, setName] = useState("");
  const [seriesId, setSeriesId] = useState("");
  const [amount, setAmount] = useState("");
  const [shippingFee, setShippingFee] = useState("");
  const [hasDiscountFlag, setHasDiscountFlag] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [stylesText, setStylesText] = useState(""); // 逗號分隔，留空=單一款式

  // CSV 匯入
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importSeriesId, setImportSeriesId] = useState("");
  const [importResult, setImportResult] = useState<any>(null);
  const [importing, setImporting] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [pRes, sRes] = await Promise.all([
        fetch("/api/admin/products"),
        fetch("/api/admin/series"),
      ]);
      const pData = await pRes.json();
      const sData = await sRes.json();
      if (!pRes.ok) throw new Error(pData.error || "載入商品失敗");
      if (!sRes.ok) throw new Error(sData.error || "載入系列失敗");
      setProducts(pData.products || []);
      setSeriesList(sData.series || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate() {
    setError("");
    if (!name.trim()) {
      setError("請輸入商品名稱");
      return;
    }
    const amountNum = Number(amount);
    if (!isFinite(amountNum)) {
      setError("金額格式不正確");
      return;
    }
    const styles = stylesText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      const res = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          seriesId: seriesId || null,
          amount: amountNum,
          shippingFee: Number(shippingFee) || 0,
          hasDiscountFlag,
          imageUrl: imageUrl || null,
          styles,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "新增失敗");
      setName("");
      setAmount("");
      setShippingFee("");
      setImageUrl("");
      setStylesText("");
      setHasDiscountFlag(false);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("確定要刪除這個商品嗎？")) return;
    try {
      const res = await fetch(`/api/admin/products/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "刪除失敗");
      load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function handleImport() {
    if (!importFile) {
      setError("請先選擇要匯入的檔案");
      return;
    }
    setImporting(true);
    setError("");
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append("file", importFile);
      if (importSeriesId) formData.append("seriesId", importSeriesId);

      const res = await fetch("/api/admin/products/import", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "匯入失敗");
      setImportResult(data);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="admin-page">
      <nav className="admin-nav">
        <Link href="/admin">← 後台首頁</Link>
      </nav>
      <h1>商品管理</h1>
      <p className="admin-sub">
        商品名稱 / 款式 / 金額 / 運費金額 / 是否滿減(v)，可手動新增或用 CSV / Excel 批次匯入
      </p>

      {error && <div className="admin-error-box">{error}</div>}

      {/* CSV 匯入區塊 */}
      <div className="admin-form-card">
        <div style={{ fontWeight: 500, marginBottom: 10 }}>批次匯入（CSV / Excel）</div>
        <div className="admin-form-row">
          <label>匯入到哪個系列（可留空）</label>
          <select value={importSeriesId} onChange={(e) => setImportSeriesId(e.target.value)}>
            <option value="">（不指定）</option>
            {seriesList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="admin-form-row">
          <label>選擇檔案</label>
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={(e) => setImportFile(e.target.files?.[0] || null)}
          />
        </div>
        <div className="admin-form-actions">
          <button className="btn" onClick={handleImport} disabled={importing}>
            {importing ? "匯入中…" : "開始匯入"}
          </button>
        </div>
        {importResult && (
          <div style={{ marginTop: 12, fontSize: 13 }}>
            共 {importResult.total} 筆，成功 {importResult.success} 筆，失敗 {importResult.failed} 筆
            {importResult.failed > 0 && (
              <ul style={{ margin: "6px 0 0", paddingLeft: 18, color: "var(--danger)" }}>
                {importResult.results
                  .filter((r: any) => !r.ok)
                  .map((r: any, i: number) => (
                    <li key={i}>
                      第{r.row}列（{r.name || "空白"}）：{r.error}
                    </li>
                  ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* 手動新增區塊 */}
      <div className="admin-toolbar">
        <button className="btn" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "收起表單" : "＋ 手動新增商品"}
        </button>
      </div>

      {showForm && (
        <div className="admin-form-card">
          <div className="admin-form-row">
            <label>商品名稱</label>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="admin-form-row">
            <label>系列</label>
            <select value={seriesId} onChange={(e) => setSeriesId(e.target.value)}>
              <option value="">（不指定）</option>
              {seriesList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.is_gift_series ? "（贈品/滿贈系列）" : ""}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <div className="admin-form-row" style={{ flex: 1 }}>
              <label>金額</label>
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="admin-form-row" style={{ flex: 1 }}>
              <label>運費金額</label>
              <input type="number" value={shippingFee} onChange={(e) => setShippingFee(e.target.value)} />
            </div>
          </div>
          <div className="admin-form-row">
            <label>款式（逗號分隔多款式，留空＝單一款式）</label>
            <input value={stylesText} onChange={(e) => setStylesText(e.target.value)} placeholder="如：A,B,C,D" />
          </div>
          <div className="admin-form-row">
            <label>商品圖片網址（一般圖床或 Google 雲端硬碟分享連結皆可）</label>
            <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
          </div>
          <div className="admin-form-row" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={hasDiscountFlag}
              onChange={(e) => setHasDiscountFlag(e.target.checked)}
            />
            <label style={{ margin: 0 }}>
              是否滿減(v)：決定結帳時套用哪一軌匯率，顧客一律看原價，不會顯示折扣
            </label>
          </div>
          <div className="admin-form-actions">
            <button className="btn" onClick={handleCreate}>
              新增商品
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="admin-empty">載入中…</div>
      ) : products.length === 0 ? (
        <div className="admin-empty">還沒有任何商品</div>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>商品名稱</th>
              <th>款式</th>
              <th>金額</th>
              <th>運費</th>
              <th>滿減(v)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td style={{ fontSize: 13, color: "var(--muted)" }}>
                  {p.product_variants.map((v) => v.style_name).filter(Boolean).join("、") || "（單一款式）"}
                </td>
                <td>{p.amount}</td>
                <td>{p.shipping_fee}</td>
                <td>{p.has_discount_flag ? "v" : ""}</td>
                <td className="admin-row-actions">
                  <button className="admin-link-btn danger" onClick={() => handleDelete(p.id)}>
                    刪除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

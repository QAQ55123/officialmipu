"use client";

import { useEffect, useState } from "react";

type Variant = { id: string; style_name: string | null };
type Product = {
  id: string;
  name: string;
  amount: number;
  shipping_fee: number;
  has_discount_flag: boolean;
  image_url: string | null;
  series_id: string | null;
  sort_order: number;
  product_variants: Variant[];
};
type Series = { id: string; name: string; is_gift_series: boolean };

export default function ProductsSection() {
  const [products, setProducts] = useState<Product[]>([]);
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [campaignList, setCampaignList] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [seriesId, setSeriesId] = useState("");
  const [seriesSearchText, setSeriesSearchText] = useState("");
  const [addToCampaignId, setAddToCampaignId] = useState("");
  const [amount, setAmount] = useState("");
  const [shippingFee, setShippingFee] = useState("");
  const [hasDiscountFlag, setHasDiscountFlag] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [stylesText, setStylesText] = useState("");

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importSeriesId, setImportSeriesId] = useState("");
  const [importCampaignId, setImportCampaignId] = useState("");
  const [importResult, setImportResult] = useState<any>(null);
  const [importing, setImporting] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [productSearch, setProductSearch] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [pRes, sRes, cRes] = await Promise.all([
        fetch("/api/admin/products"),
        fetch("/api/admin/series"),
        fetch("/api/admin/campaigns"),
      ]);
      const pData = await pRes.json();
      const sData = await sRes.json();
      const cData = await cRes.json();
      if (!pRes.ok) throw new Error(pData.error || "載入商品失敗");
      if (!sRes.ok) throw new Error(sData.error || "載入系列失敗");
      setProducts(pData.products || []);
      setSeriesList(sData.series || []);
      setCampaignList((cData.campaigns || []).map((c: any) => ({ id: c.id, name: c.name })));
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
    if (!name.trim()) return setError("請輸入商品名稱");
    const amountNum = Number(amount);
    if (!isFinite(amountNum)) return setError("金額格式不正確");
    const styles = stylesText.split(",").map((s) => s.trim()).filter(Boolean);

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
          campaignId: addToCampaignId || null,
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
      setAddToCampaignId("");
      setSeriesSearchText("");
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
    if (!importFile) return setError("請先選擇要匯入的檔案");
    setImporting(true);
    setError("");
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append("file", importFile);
      if (importSeriesId) formData.append("seriesId", importSeriesId);
      if (importCampaignId) formData.append("campaignId", importCampaignId);
      const res = await fetch("/api/admin/products/import", { method: "POST", body: formData });
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

  async function handleUploadImage(file: File) {
    setUploading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/admin/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "上傳失敗");
      setImageUrl(data.url);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }

  async function persistOrder(next: Product[]) {
    setProducts(next);
    await fetch("/api/admin/products/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: next.map((p) => p.id) }),
    });
  }

  function handleDrop(targetId: string) {
    if (!draggedId || draggedId === targetId) return;
    const next = [...products];
    const fromIdx = next.findIndex((p) => p.id === draggedId);
    const toIdx = next.findIndex((p) => p.id === targetId);
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    persistOrder(next);
    setDraggedId(null);
  }

  return (
    <div>
      <p className="admin-sub">商品名稱 / 款式 / 金額 / 運費金額 / 是否滿減(v)，可手動新增或用 CSV/Excel 批次匯入。拖曳可調整順序。</p>
      {error && <div className="admin-error-box">{error}</div>}

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
          <label>順便加進哪個檔期（可留空）</label>
          <select value={importCampaignId} onChange={(e) => setImportCampaignId(e.target.value)}>
            <option value="">（先不加進任何檔期）</option>
            {campaignList.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="admin-form-row">
          <label>選擇檔案</label>
          <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => setImportFile(e.target.files?.[0] || null)} />
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
            <label>系列（輸入文字搜尋）</label>
            <input
              list="series-options"
              value={seriesSearchText}
              onChange={(e) => {
                const text = e.target.value;
                setSeriesSearchText(text);
                const matched = seriesList.find((s) => s.name === text);
                setSeriesId(matched ? matched.id : "");
              }}
              placeholder="輸入系列名稱，留空＝不指定"
            />
            <datalist id="series-options">
              {seriesList.map((s) => (
                <option key={s.id} value={s.name} />
              ))}
            </datalist>
          </div>
          <div className="admin-form-row">
            <label>順便加進哪個檔期（選填，之後也能到「檔期商品」補加）</label>
            <select value={addToCampaignId} onChange={(e) => setAddToCampaignId(e.target.value)}>
              <option value="">（先不加進任何檔期）</option>
              {campaignList.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
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
          <div className="admin-form-row">
            <label>或者直接上傳圖片檔案（會自動填入上面的網址欄位）</label>
            <input
              type="file"
              accept="image/*"
              disabled={uploading}
              onChange={(e) => e.target.files?.[0] && handleUploadImage(e.target.files[0])}
            />
            {uploading && <span style={{ fontSize: 13, color: "var(--muted)" }}>上傳中…</span>}
          </div>
          <div className="admin-form-row" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={hasDiscountFlag} onChange={(e) => setHasDiscountFlag(e.target.checked)} />
            <label style={{ margin: 0 }}>是否滿減(v)：決定結帳時套用哪一軌匯率，顧客一律看原價，不會顯示折扣</label>
          </div>
          <div className="admin-form-actions">
            <button className="btn" onClick={handleCreate}>
              新增商品
            </button>
          </div>
        </div>
      )}

      <input
        placeholder="搜尋商品名稱"
        value={productSearch}
        onChange={(e) => setProductSearch(e.target.value)}
        style={{ width: "100%", marginBottom: 10, boxSizing: "border-box" }}
      />

      {loading ? (
        <div className="admin-empty">載入中…</div>
      ) : products.length === 0 ? (
        <div className="admin-empty">還沒有任何商品</div>
      ) : (
        <div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "20px 1fr 1fr 60px 60px 40px auto",
              gap: 8,
              padding: "0 12px 6px",
              fontSize: 12,
              color: "var(--muted)",
            }}
          >
            <span></span>
            <span>商品名稱</span>
            <span>款式</span>
            <span>金額</span>
            <span>運費</span>
            <span>滿減</span>
            <span></span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {products
              .filter((p) => productSearch === "" || p.name.includes(productSearch))
              .map((p) => {
                const seriesName = seriesList.find((s) => s.id === p.series_id)?.name;
                return (
                  <div
                    key={p.id}
                    draggable
                    onDragStart={() => setDraggedId(p.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleDrop(p.id)}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "20px 1fr 1fr 60px 60px 40px auto",
                      gap: 8,
                      alignItems: "center",
                      padding: "8px 12px",
                      background: "#fff",
                      border: "1px solid #E5E1D3",
                      borderRadius: 8,
                      cursor: "grab",
                      fontSize: 13,
                    }}
                  >
                    <span style={{ color: "var(--muted)" }}>⠿</span>
                    <span>
                      {p.name}
                      {seriesName && <span style={{ color: "var(--muted)" }}> （{seriesName}）</span>}
                    </span>
                    <span style={{ color: "var(--muted)" }}>
                      {p.product_variants.map((v) => v.style_name).filter(Boolean).join("、") || "（單一款式）"}
                    </span>
                    <span>{p.amount}</span>
                    <span>{p.shipping_fee}</span>
                    <span>{p.has_discount_flag ? "v" : ""}</span>
                    <button className="admin-link-btn danger" onClick={() => handleDelete(p.id)}>
                      刪除
                    </button>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}

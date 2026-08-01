"use client";
import { useEffect, useState } from "react";

type Variant = { id: string; style_name: string | null; amount: number; shipping_fee: number; has_discount_flag: boolean; cod_allowed: boolean; image_url: string | null };
type Product = { id: string; name: string; series_id: string | null; image_url: string | null; product_variants: Variant[] };
type Series = { id: string; name: string; is_gift_series: boolean };

const emptyProductForm = { id: "", name: "", style: "", price: "0", imageUrl: "" };

export default function ProductsSection() {
  const [products, setProducts] = useState<Product[]>([]);
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);
  const [productMsg, setProductMsg] = useState("");
  const [filterText, setFilterText] = useState("");

  const [seriesId, setSeriesId] = useState(""); // 這次要歸屬的系列（新建/更新既有商品都會用到）
  const [coverImageUrl, setCoverImageUrl] = useState(""); // 商品本身的封面圖（跟款式照片分開）
  const [coverImageUrlInput, setCoverImageUrlInput] = useState("");
  const [uploadingCoverImg, setUploadingCoverImg] = useState(false);

  const [productForm, setProductForm] = useState(emptyProductForm);
  const [productRows, setProductRows] = useState<{ style: string; price: string; imageUrl: string }[]>([{ style: "", price: "0", imageUrl: "" }]);
  const [productRowImageUrlInputs, setProductRowImageUrlInputs] = useState<Record<number, string>>({});
  const [uploadingRowImg, setUploadingRowImg] = useState<number | null>(null);
  const [productImageUrlInput, setProductImageUrlInput] = useState("");
  const [uploadingProductImg, setUploadingProductImg] = useState(false);
  const [draggedVariantId, setDraggedVariantId] = useState<string | null>(null);

  // 匯入
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importSeriesId, setImportSeriesId] = useState("");
  const [importResult, setImportResult] = useState<any>(null);
  const [importing, setImporting] = useState(false);

  async function load() {
    setLoading(true);
    const [pRes, sRes] = await Promise.all([fetch("/api/admin/products"), fetch("/api/admin/series")]);
    const pData = await pRes.json();
    const sData = await sRes.json();
    setProducts(pData.products || []);
    setSeriesList(sData.series || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function uploadImage(file: File): Promise<string> {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/admin/upload", { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "上傳失敗");
    return data.url;
  }

  // ---- 款式列（新增商品用，比照原本 productRows 邏輯）----
  function addProductRow() {
    setProductRows((rows) => [...rows, { style: "", price: rows[rows.length - 1]?.price || "0", imageUrl: "" }]);
  }
  function removeProductRow(idx: number) {
    setProductRows((rows) => (rows.length <= 1 ? rows : rows.filter((_, i) => i !== idx)));
    setProductRowImageUrlInputs((prev) => {
      const next = { ...prev };
      delete next[idx];
      return next;
    });
  }
  function updateProductRow(idx: number, field: "style" | "price" | "imageUrl", value: string) {
    setProductRows((rows) => rows.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
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
    updateProductRow(idx, "imageUrl", v);
    setProductRowImageUrlInputs((prev) => ({ ...prev, [idx]: "" }));
  }

  // ---- 編輯單一款式用（比照原本 productForm 單筆模式）----
  function editProduct(product: Product, v: Variant) {
    setProductForm({ id: v.id, name: product.name, style: v.style_name || "", price: String(v.amount), imageUrl: v.image_url || "" });
    setSeriesId(product.series_id || "");
    setProductImageUrlInput("");
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
  function applyProductImageUrl() {
    const v = productImageUrlInput.trim();
    if (!v) return;
    setProductForm((f) => ({ ...f, imageUrl: v }));
    setProductImageUrlInput("");
  }

  // ---- 封面圖（商品本身，跟款式分開）----
  async function handleCoverImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCoverImg(true);
    try {
      const url = await uploadImage(file);
      setCoverImageUrl(url);
    } catch (err: any) {
      setProductMsg("封面圖上傳失敗：" + err.message);
    } finally {
      setUploadingCoverImg(false);
    }
  }
  function applyCoverImageUrl() {
    const v = coverImageUrlInput.trim();
    if (!v) return;
    setCoverImageUrl(v);
    setCoverImageUrlInput("");
  }

  async function saveProduct() {
    if (!productForm.name.trim()) return setProductMsg("請填寫商品名稱");
    setProductMsg("處理中…");
    try {
      if (productForm.id) {
        // 編輯既有款式：單筆更新
        const res = await fetch(`/api/admin/product-variants/${productForm.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ styleName: productForm.style, amount: Number(productForm.price), imageUrl: productForm.imageUrl || null }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "儲存失敗");
        setProductForm(emptyProductForm);
        setProductMsg("已儲存");
      } else {
        // 新增商品：同名會自動歸到既有商品底下，不同名才新建
        const rows = productRows.filter((r) => r.style.trim() || productRows.length === 1);
        const res = await fetch("/api/admin/products", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: productForm.name, seriesId: seriesId || null, imageUrl: coverImageUrl || null,
            rows: rows.map((r) => ({ style: r.style, price: r.price || "0", imageUrl: r.imageUrl || null })),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "儲存失敗");
        setProductForm((f) => ({ ...f, style: "", price: "0" }));
        setProductRows([{ style: "", price: "0", imageUrl: "" }]);
        setProductMsg(`已新增 ${rows.length} 筆`);
      }
      load();
    } catch (e: any) {
      setProductMsg("失敗：" + e.message);
    }
  }

  async function deleteVariant(id: string) {
    if (!confirm("確定要刪除這個商品款式嗎？")) return;
    try {
      await fetch(`/api/admin/product-variants/${id}`, { method: "DELETE" });
      load();
    } catch (e: any) {
      setProductMsg("失敗：" + e.message);
    }
  }

  async function deleteWholeProduct(id: string) {
    if (!confirm("確定要刪除這整個商品（含所有款式）嗎？")) return;
    await fetch(`/api/admin/products/${id}`, { method: "DELETE" });
    load();
  }

  function handleVariantDrop(targetId: string) {
    if (!draggedVariantId || draggedVariantId === targetId) return;
    // 拖曳排序：跟原本一樣先更新畫面、再存到後端（這裡簡化：款式目前沒有獨立的排序API，暫不落地儲存）
    setDraggedVariantId(null);
  }

  async function handleImport() {
    if (!importFile) return setProductMsg("請先選擇要匯入的檔案");
    setImporting(true); setProductMsg(""); setImportResult(null);
    const formData = new FormData();
    formData.append("file", importFile);
    if (importSeriesId) formData.append("seriesId", importSeriesId);
    const res = await fetch("/api/admin/products/import", { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) setProductMsg(data.error);
    else setImportResult(data);
    setImporting(false);
    load();
  }

  const distinctNames = Array.from(new Set(products.map((p) => p.name)));
  const filtered = products.filter((p) => !filterText.trim() || p.name.toLowerCase().includes(filterText.toLowerCase()));

  return (
    <>
      <div className="auth-card">
        <h3>批次匯入（CSV / Excel）</h3>
        <p style={{ fontSize: 12, color: "#8A8779", margin: 0 }}>
          欄位：商品名稱｜款式｜金額｜運費金額｜是否滿減(v)。同一個商品名稱可以重複好幾列，會自動歸到同一個商品底下。
        </p>
        <div className="id-row">
          <span className="id-label">匯入到系列</span>
          <select value={importSeriesId} onChange={(e) => setImportSeriesId(e.target.value)} style={{ flex: 1, padding: 8 }}>
            <option value="">（不指定）</option>
            {seriesList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="id-row">
          <span className="id-label">選擇檔案</span>
          <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => setImportFile(e.target.files?.[0] || null)} />
        </div>
        <button className="btn" onClick={handleImport} disabled={importing}>{importing ? "匯入中…" : "開始匯入"}</button>
        {importResult && <div style={{ fontSize: 13, marginTop: 6 }}>共 {importResult.total} 筆，成功 {importResult.success} 筆，失敗 {importResult.failed} 筆</div>}
      </div>

      <div className="auth-card">
        <h3>商品管理（獨立商品庫）</h3>

        <div style={{ marginBottom: 12 }}>
          <input type="text" value={filterText} onChange={(e) => setFilterText(e.target.value)} placeholder="搜尋商品名稱…" style={{ width: "100%", padding: 8, marginBottom: 10, border: "1px solid #EDE9DC", borderRadius: 8 }} />

          {loading ? (
            <div style={{ fontSize: 13, color: "#8A8779" }}>載入中…</div>
          ) : filtered.length === 0 ? (
            <div style={{ fontSize: 13, color: "#8A8779" }}>還沒有商品</div>
          ) : (
            filtered.map((p) => (
              <div key={p.id} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0" }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#33415C" }}>
                    {p.image_url && <img src={p.image_url} alt="" style={{ width: 24, height: 24, objectFit: "cover", borderRadius: 4, verticalAlign: "middle", marginRight: 6 }} />}
                    {p.name}
                  </span>
                  <button className="btn small danger" onClick={() => deleteWholeProduct(p.id)}>刪除整個商品</button>
                </div>
                {p.product_variants.map((v) => (
                  <div
                    key={v.id}
                    draggable
                    onDragStart={() => setDraggedVariantId(v.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleVariantDrop(v.id)}
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0 8px 10px", borderBottom: "1px dashed #EDE9DC", cursor: "grab", opacity: draggedVariantId === v.id ? 0.4 : 1 }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ color: "#B0AC9C", fontSize: 14, cursor: "grab" }} title="拖曳排序">⠿</span>
                      {v.image_url && <img src={v.image_url} alt={v.style_name || ""} style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 6 }} />}
                      <div>
                        <div style={{ fontSize: 14 }}>{v.style_name || "單一款式"}</div>
                        <div style={{ fontSize: 12, color: "#8A8779" }}>
                          NT$ {v.amount}{v.has_discount_flag && " · v"}{!v.cod_allowed && " · 不開放取付"}
                        </div>
                      </div>
                    </div>
                    <span style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button className="btn small secondary" onClick={() => editProduct(p, v)}>編輯</button>
                      <button className="btn small danger" onClick={() => deleteVariant(v.id)}>刪除</button>
                    </span>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        <div className="id-row">
          <span className="id-label">商品名稱</span>
          <input type="text" value={productForm.name} onChange={(e) => setProductForm((f) => ({ ...f, name: e.target.value }))} placeholder="例如：原味米菓" />
        </div>

        {!productForm.id && distinctNames.length > 0 && (
          <div className="id-row">
            <span className="id-label">快速選擇</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {distinctNames.map((name) => (
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

        {!productForm.id && (
          <>
            <div className="id-row">
              <span className="id-label">系列</span>
              <select value={seriesId} onChange={(e) => setSeriesId(e.target.value)} style={{ flex: 1, padding: 8 }}>
                <option value="">（不指定）</option>
                {seriesList.map((s) => <option key={s.id} value={s.id}>{s.name}{s.is_gift_series ? "（贈品/滿贈）" : ""}</option>)}
              </select>
            </div>
            <div className="id-row">
              <span className="id-label">商品封面圖</span>
              <input type="file" accept="image/*" onChange={handleCoverImageUpload} />
            </div>
            <div className="id-row">
              <span className="id-label"></span>
              <input type="text" value={coverImageUrlInput} onChange={(e) => setCoverImageUrlInput(e.target.value)} placeholder="或貼上圖片網址（支援 Google Drive 分享連結）" />
              <button className="btn small secondary" onClick={applyCoverImageUrl}>使用這個網址</button>
            </div>
            {uploadingCoverImg && <div style={{ fontSize: 13, color: "#8A8779" }}>封面圖上傳中…</div>}
            {coverImageUrl && <img src={coverImageUrl} alt="封面預覽" style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8, marginBottom: 8 }} />}

            {distinctNames.length > 0 && (
              <div className="id-row">
                <span className="id-label">複製款式</span>
                <select
                  defaultValue=""
                  onChange={(e) => {
                    const sourceName = e.target.value;
                    if (!sourceName) return;
                    const source = products.find((p) => p.name === sourceName);
                    if (source) {
                      const rows = source.product_variants.map((v) => ({ style: v.style_name || "", price: String(v.amount), imageUrl: v.image_url || "" }));
                      if (rows.length > 0) setProductRows(rows);
                    }
                    e.target.value = "";
                  }}
                >
                  <option value="">選一個商品複製款式（記得修改金額）</option>
                  {distinctNames.map((name) => <option key={name} value={name}>{name}</option>)}
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
              <span className="id-label">價格</span>
              <input type="number" value={productForm.price} onChange={(e) => setProductForm((f) => ({ ...f, price: e.target.value }))} />
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
          <div className="id-row" style={{ alignItems: "flex-start" }}>
            <span className="id-label" style={{ paddingTop: 8 }}>款式／價格／圖片</span>
            <div style={{ flex: 1 }}>
              {productRows.map((row, i) => (
                <div key={i} style={{ display: "flex", gap: 8, marginBottom: 10, padding: 10, background: "#FAF8F2", borderRadius: 8, alignItems: "flex-start" }}>
                  {row.imageUrl && <img src={row.imageUrl} alt="預覽" style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />}
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input type="text" value={row.style} onChange={(e) => updateProductRow(i, "style", e.target.value)} placeholder="款式（沒有分款式可留空）" style={{ flex: 1 }} />
                      <input type="number" value={row.price} onChange={(e) => updateProductRow(i, "price", e.target.value)} placeholder="價格" style={{ width: 90 }} />
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <input type="file" accept="image/*" onChange={(e) => handleProductRowImageUpload(i, e)} style={{ fontSize: 12 }} />
                      <input
                        type="text"
                        value={productRowImageUrlInputs[i] || ""}
                        onChange={(e) => setProductRowImageUrlInputs((prev) => ({ ...prev, [i]: e.target.value }))}
                        placeholder="或貼上圖片網址"
                        style={{ flex: 1, minWidth: 140, fontSize: 12 }}
                      />
                      <button className="btn small secondary" onClick={() => applyProductRowImageUrl(i)}>使用</button>
                      {uploadingRowImg === i && <span style={{ fontSize: 12, color: "#8A8779" }}>上傳中…</span>}
                    </div>
                  </div>
                  {i === productRows.length - 1 ? (
                    <button className="btn small secondary" onClick={addProductRow} title="再新增一列款式" style={{ flexShrink: 0 }}>＋</button>
                  ) : (
                    <button className="btn small secondary" onClick={() => removeProductRow(i)} title="移除這一列" style={{ flexShrink: 0 }}>－</button>
                  )}
                </div>
              ))}
              <div style={{ fontSize: 12, color: "#8A8779" }}>填好幾列，按「新增商品」會一次建立好幾筆同名不同款式（各自圖片）的商品</div>
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={saveProduct}>{productForm.id ? "儲存修改" : "新增商品"}</button>
          {productForm.id && <button className="btn secondary" onClick={() => setProductForm(emptyProductForm)}>取消編輯</button>}
        </div>
        <div style={{ fontSize: 13, marginTop: 6 }}>{productMsg}</div>
      </div>
    </>
  );
}

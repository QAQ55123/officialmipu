"use client";
import { useEffect, useState } from "react";

type Variant = { id: string; style_name: string | null; amount: number; shipping_fee: number; has_discount_flag: boolean; cod_allowed: boolean; image_url: string | null };
type Product = { id: string; name: string; series_id: string | null; product_variants: Variant[] };
type Series = { id: string; name: string; is_gift_series: boolean };

type Row = { styleName: string; amount: string; shippingFee: string; hasDiscountFlag: boolean; codAllowed: boolean; imageUrl: string };
const emptyRow = (): Row => ({ styleName: "", amount: "0", shippingFee: "0", hasDiscountFlag: false, codAllowed: true, imageUrl: "" });

export default function ProductsSection() {
  const [products, setProducts] = useState<Product[]>([]);
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [filterText, setFilterText] = useState("");

  // 匯入
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importSeriesId, setImportSeriesId] = useState("");
  const [importResult, setImportResult] = useState<any>(null);
  const [importing, setImporting] = useState(false);

  // 新增商品表單
  const [name, setName] = useState("");
  const [seriesId, setSeriesId] = useState("");
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [uploadingRow, setUploadingRow] = useState<number | null>(null);

  // 編輯單一款式
  const [editingVariantId, setEditingVariantId] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<Row>(emptyRow());
  const [editOriginalImageUrl, setEditOriginalImageUrl] = useState("");
  const [uploadingEdit, setUploadingEdit] = useState(false);

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

  function updateRow(i: number, field: keyof Row, value: any) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  }
  function addRow() { setRows((prev) => [...prev, emptyRow()]); }

  async function uploadImage(file: File): Promise<string | null> {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/admin/upload", { method: "POST", body: formData });
    const data = await res.json();
    return res.ok ? data.url : null;
  }

  async function deleteUnusedImage(url: string) {
    if (!url) return;
    await fetch("/api/admin/upload/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) }).catch(() => {});
  }

  async function handleRowUpload(i: number, file: File) {
    const oldUrl = rows[i].imageUrl;
    setUploadingRow(i);
    const url = await uploadImage(file);
    if (url) {
      updateRow(i, "imageUrl", url);
      if (oldUrl) deleteUnusedImage(oldUrl); // 換圖：舊的還沒存進資料庫，立刻清掉
    }
    else setMsg("圖片上傳失敗");
    setUploadingRow(null);
  }

  function removeRow(i: number) {
    const url = rows[i].imageUrl;
    if (url) deleteUnusedImage(url); // 整列被移除：這張還沒存進資料庫的圖也一起清掉
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function saveNewProduct() {
    setMsg("");
    if (!name.trim()) return setMsg("請輸入商品名稱");
    try {
      const res = await fetch("/api/admin/products", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seriesId: seriesId || null, name,
          variants: rows.map((r) => ({ styleName: r.styleName || null, amount: Number(r.amount), shippingFee: Number(r.shippingFee) || 0, hasDiscountFlag: r.hasDiscountFlag, codAllowed: r.codAllowed, imageUrl: r.imageUrl || null })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "儲存失敗");
      setName(""); setSeriesId(""); setRows([emptyRow()]);
      load();
    } catch (e: any) {
      setMsg(e.message);
    }
  }

  function copyStylesFrom(productId: string) {
    const source = products.find((p) => p.id === productId);
    if (!source) return;
    setRows(source.product_variants.map((v) => ({
      styleName: v.style_name || "", amount: String(v.amount), shippingFee: String(v.shipping_fee),
      hasDiscountFlag: v.has_discount_flag, codAllowed: v.cod_allowed, imageUrl: v.image_url || "",
    })));
  }

  function startEditVariant(v: Variant) {
    setEditingVariantId(v.id);
    setEditRow({ styleName: v.style_name || "", amount: String(v.amount), shippingFee: String(v.shipping_fee), hasDiscountFlag: v.has_discount_flag, codAllowed: v.cod_allowed, imageUrl: v.image_url || "" });
    setEditOriginalImageUrl(v.image_url || "");
  }

  function cancelEditVariant() {
    // 編輯過程中如果上傳了新圖但取消不儲存，那張還沒存進資料庫的新圖要清掉，原本資料庫裡那張不動
    if (editRow.imageUrl && editRow.imageUrl !== editOriginalImageUrl) {
      deleteUnusedImage(editRow.imageUrl);
    }
    setEditingVariantId(null);
  }

  async function saveEditVariant() {
    if (!editingVariantId) return;
    const res = await fetch(`/api/admin/product-variants/${editingVariantId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ styleName: editRow.styleName || null, amount: Number(editRow.amount), shippingFee: Number(editRow.shippingFee) || 0, hasDiscountFlag: editRow.hasDiscountFlag, codAllowed: editRow.codAllowed, imageUrl: editRow.imageUrl || null }),
    });
    const data = await res.json();
    if (!res.ok) return setMsg(data.error);
    setEditingVariantId(null);
    load();
  }

  async function deleteVariant(id: string) {
    if (!confirm("確定要刪除這個款式嗎？（如果是這個商品最後一個款式，商品本身也會一併刪除）")) return;
    await fetch(`/api/admin/product-variants/${id}`, { method: "DELETE" });
    load();
  }

  async function handleImport() {
    if (!importFile) return setMsg("請先選擇要匯入的檔案");
    setImporting(true); setMsg(""); setImportResult(null);
    const formData = new FormData();
    formData.append("file", importFile);
    if (importSeriesId) formData.append("seriesId", importSeriesId);
    const res = await fetch("/api/admin/products/import", { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) setMsg(data.error);
    else setImportResult(data);
    setImporting(false);
    load();
  }

  const filtered = products.filter((p) => !filterText.trim() || p.name.toLowerCase().includes(filterText.toLowerCase()));
  const seriesName = (id: string | null) => seriesList.find((s) => s.id === id)?.name;

  return (
    <>
      <div className="auth-card">
        <h3>批次匯入（CSV / Excel）</h3>
        <p style={{ fontSize: 12, color: "#8A8779", margin: 0 }}>
          欄位：商品名稱｜款式｜金額｜運費金額｜是否滿減(v)。一列＝一個具體款式，同一個商品名稱可以重複好幾列，會自動歸到同一個商品底下。
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
        <h3>商品管理（獨立商品庫，款式各自獨立金額／圖片／運費／取付設定）</h3>
        <input type="text" value={filterText} onChange={(e) => setFilterText(e.target.value)} placeholder="搜尋商品名稱…" style={{ width: "100%", padding: 8, marginBottom: 10, border: "1px solid #EDE9DC", borderRadius: 8 }} />

        <div style={{ marginBottom: 12, maxHeight: 360, overflowY: "auto" }}>
          {loading ? <div style={{ fontSize: 13, color: "#8A8779" }}>載入中…</div> : filtered.length === 0 ? (
            <div style={{ fontSize: 13, color: "#8A8779" }}>還沒有商品</div>
          ) : (
            filtered.map((p) => (
              <div key={p.id} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#33415C", padding: "6px 0" }}>
                  {p.name}{seriesName(p.series_id) && <span style={{ fontWeight: 400, color: "#8A8779" }}> （{seriesName(p.series_id)}）</span>}
                </div>
                {p.product_variants.map((v) => (
                  <div key={v.id}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0 8px 10px", borderBottom: "1px dashed #EDE9DC" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {v.image_url && <img src={v.image_url} alt="" style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 6 }} />}
                        <div>
                          <div style={{ fontSize: 14 }}>{v.style_name || "單一款式"}</div>
                          <div style={{ fontSize: 12, color: "#8A8779" }}>NT$ {v.amount}{v.has_discount_flag && " · v"}{!v.cod_allowed && " · 不開放取付"}</div>
                        </div>
                      </div>
                      <span style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        <button className="btn small secondary" onClick={() => startEditVariant(v)}>編輯</button>
                        <button className="btn small danger" onClick={() => deleteVariant(v.id)}>刪除</button>
                      </span>
                    </div>
                    {editingVariantId === v.id && (
                      <div style={{ padding: 10, background: "#FAF8F2", borderRadius: 8, marginBottom: 8 }}>
                        <div className="id-row"><span className="id-label">款式</span><input type="text" value={editRow.styleName} onChange={(e) => setEditRow((r) => ({ ...r, styleName: e.target.value }))} /></div>
                        <div className="id-row"><span className="id-label">金額</span><input type="number" value={editRow.amount} onChange={(e) => setEditRow((r) => ({ ...r, amount: e.target.value }))} /></div>
                        <div className="id-row"><span className="id-label">運費</span><input type="number" value={editRow.shippingFee} onChange={(e) => setEditRow((r) => ({ ...r, shippingFee: e.target.value }))} /></div>
                        <div className="id-row"><span className="id-label">圖片網址</span><input type="text" value={editRow.imageUrl} onChange={(e) => setEditRow((r) => ({ ...r, imageUrl: e.target.value }))} /></div>
                        <div className="id-row">
                          <span className="id-label">或上傳</span>
                          <input type="file" accept="image/*" disabled={uploadingEdit} onChange={async (e) => {
                            if (!e.target.files?.[0]) return;
                            const prevUnsavedUrl = editRow.imageUrl !== editOriginalImageUrl ? editRow.imageUrl : "";
                            setUploadingEdit(true);
                            const url = await uploadImage(e.target.files[0]);
                            if (url) {
                              setEditRow((r) => ({ ...r, imageUrl: url }));
                              if (prevUnsavedUrl) deleteUnusedImage(prevUnsavedUrl);
                            }
                            setUploadingEdit(false);
                          }} />
                        </div>
                        <div className="id-row"><span className="id-label">滿減(v)</span><input type="checkbox" checked={editRow.hasDiscountFlag} onChange={(e) => setEditRow((r) => ({ ...r, hasDiscountFlag: e.target.checked }))} /></div>
                        <div className="id-row"><span className="id-label">開放取付</span><input type="checkbox" checked={editRow.codAllowed} onChange={(e) => setEditRow((r) => ({ ...r, codAllowed: e.target.checked }))} /></div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button className="btn small" onClick={saveEditVariant}>儲存</button>
                          <button className="btn small secondary" onClick={cancelEditVariant}>取消</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        <div style={{ borderTop: "1px solid #EDE9DC", paddingTop: 12 }}>
          <h4 style={{ margin: "0 0 8px" }}>新增商品</h4>
          <div className="id-row"><span className="id-label">商品名稱</span><input type="text" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="id-row">
            <span className="id-label">系列</span>
            <select value={seriesId} onChange={(e) => setSeriesId(e.target.value)} style={{ flex: 1, padding: 8 }}>
              <option value="">（不指定）</option>
              {seriesList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          {products.length > 0 && (
            <div className="id-row">
              <span className="id-label">複製款式</span>
              <select defaultValue="" onChange={(e) => { if (e.target.value) copyStylesFrom(e.target.value); e.target.value = ""; }} style={{ flex: 1, padding: 8 }}>
                <option value="">選一個商品複製款式（記得修改金額）</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 14 }}>
            <span className="id-label" style={{ paddingTop: 8 }}>款式／金額／圖片</span>
            <div style={{ flex: 1 }}>
              {rows.map((row, i) => (
                <div key={i} style={{ display: "flex", gap: 8, marginBottom: 10, padding: 10, background: "#FAF8F2", borderRadius: 8, alignItems: "flex-start" }}>
                  {row.imageUrl && <img src={row.imageUrl} alt="" style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />}
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input type="text" value={row.styleName} onChange={(e) => updateRow(i, "styleName", e.target.value)} placeholder="款式（留空＝單一款式）" style={{ flex: 1 }} />
                      <input type="number" value={row.amount} onChange={(e) => updateRow(i, "amount", e.target.value)} placeholder="金額" style={{ width: 80 }} />
                      <input type="number" value={row.shippingFee} onChange={(e) => updateRow(i, "shippingFee", e.target.value)} placeholder="運費" style={{ width: 70 }} />
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && handleRowUpload(i, e.target.files[0])} style={{ fontSize: 12 }} />
                      <input type="text" value={row.imageUrl} onChange={(e) => updateRow(i, "imageUrl", e.target.value)} placeholder="或貼上圖片網址" style={{ flex: 1, minWidth: 140, fontSize: 12 }} />
                      {uploadingRow === i && <span style={{ fontSize: 12, color: "#8A8779" }}>上傳中…</span>}
                    </div>
                    <div style={{ display: "flex", gap: 12, fontSize: 12 }}>
                      <label><input type="checkbox" checked={row.hasDiscountFlag} onChange={(e) => updateRow(i, "hasDiscountFlag", e.target.checked)} /> 滿減(v)</label>
                      <label><input type="checkbox" checked={row.codAllowed} onChange={(e) => updateRow(i, "codAllowed", e.target.checked)} /> 開放取付</label>
                    </div>
                  </div>
                  {i === rows.length - 1 ? (
                    <button className="btn small secondary" onClick={addRow} title="再新增一列款式" style={{ flexShrink: 0 }}>＋</button>
                  ) : (
                    <button className="btn small secondary" onClick={() => removeRow(i)} title="移除這一列" style={{ flexShrink: 0 }}>－</button>
                  )}
                </div>
              ))}
              <div style={{ fontSize: 12, color: "#8A8779" }}>填好幾列，會一次建立好幾個同商品名稱、不同款式（各自獨立金額/圖片）的品項</div>
            </div>
          </div>

          <button className="btn" onClick={saveNewProduct}>新增商品</button>
          {msg && <div style={{ fontSize: 13, color: "#dc2626", marginTop: 6 }}>{msg}</div>}
        </div>
      </div>
    </>
  );
}

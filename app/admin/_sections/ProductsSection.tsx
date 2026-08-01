"use client";
import { useEffect, useState } from "react";

type Variant = { id: string; style_name: string | null };
type Product = { id: string; name: string; amount: number; shipping_fee: number; has_discount_flag: boolean; cod_allowed: boolean; image_url: string | null; series_id: string | null; product_variants: Variant[] };
type Series = { id: string; name: string; is_gift_series: boolean };

export default function ProductsSection() {
  const [products, setProducts] = useState<Product[]>([]);
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [filterText, setFilterText] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [seriesId, setSeriesId] = useState("");
  const [amount, setAmount] = useState("");
  const [shippingFee, setShippingFee] = useState("");
  const [stylesText, setStylesText] = useState("");
  const [hasDiscountFlag, setHasDiscountFlag] = useState(false);
  const [codAllowed, setCodAllowed] = useState(true);
  const [imageUrl, setImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);

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

  function resetForm() {
    setEditingId(null); setName(""); setSeriesId(""); setAmount(""); setShippingFee("");
    setStylesText(""); setHasDiscountFlag(false); setCodAllowed(true); setImageUrl("");
  }
  function editItem(p: Product) {
    setEditingId(p.id); setName(p.name); setSeriesId(p.series_id || ""); setAmount(String(p.amount)); setShippingFee(String(p.shipping_fee));
    setStylesText(p.product_variants.map((v) => v.style_name).filter(Boolean).join(","));
    setHasDiscountFlag(p.has_discount_flag); setCodAllowed(p.cod_allowed); setImageUrl(p.image_url || "");
  }

  async function handleUpload(file: File) {
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/admin/upload", { method: "POST", body: formData });
    const data = await res.json();
    if (res.ok) setImageUrl(data.url); else setMsg(data.error);
    setUploading(false);
  }

  async function save() {
    setMsg("");
    if (!name.trim()) return setMsg("請輸入商品名稱");
    const amountNum = Number(amount);
    if (!isFinite(amountNum)) return setMsg("金額格式不正確");
    const styles = stylesText.split(",").map((s) => s.trim()).filter(Boolean);
    const body = { name, seriesId: seriesId || null, amount: amountNum, shippingFee: Number(shippingFee) || 0, hasDiscountFlag, codAllowed, imageUrl: imageUrl || null, styles };
    try {
      const res = editingId
        ? await fetch(`/api/admin/products/${editingId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        : await fetch("/api/admin/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "儲存失敗");
      resetForm();
      load();
    } catch (e: any) {
      setMsg(e.message);
    }
  }

  async function deleteItem(id: string) {
    if (!confirm("確定要刪除這個商品嗎？")) return;
    await fetch(`/api/admin/products/${id}`, { method: "DELETE" });
    load();
  }

  const filtered = products.filter((p) => !filterText.trim() || p.name.toLowerCase().includes(filterText.toLowerCase()));

  return (
    <div className="auth-card">
      <h3>商品管理（獨立商品庫）</h3>

      <input type="text" value={filterText} onChange={(e) => setFilterText(e.target.value)} placeholder="搜尋商品名稱…" style={{ width: "100%", padding: 8, marginBottom: 10, border: "1px solid #EDE9DC", borderRadius: 8 }} />

      <div style={{ marginBottom: 12, maxHeight: 320, overflowY: "auto" }}>
        {loading ? <div style={{ fontSize: 13, color: "#8A8779" }}>載入中…</div> : filtered.length === 0 ? (
          <div style={{ fontSize: 13, color: "#8A8779" }}>還沒有商品</div>
        ) : (
          filtered.map((p) => {
            const seriesName = seriesList.find((s) => s.id === p.series_id)?.name;
            return (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px dashed #EDE9DC" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {p.image_url && <img src={p.image_url} alt={p.name} style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 6 }} />}
                  <div>
                    <div style={{ fontSize: 14 }}>{p.name}{seriesName && <span style={{ color: "#8A8779" }}> （{seriesName}）</span>}</div>
                    <div style={{ fontSize: 12, color: "#8A8779" }}>
                      NT$ {p.amount} · {p.product_variants.map((v) => v.style_name).filter(Boolean).join("、") || "單一款式"}
                      {p.has_discount_flag && " · v"} {!p.cod_allowed && " · 不開放取付"}
                    </div>
                  </div>
                </div>
                <span style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button className="btn small secondary" onClick={() => editItem(p)}>編輯</button>
                  <button className="btn small danger" onClick={() => deleteItem(p.id)}>刪除</button>
                </span>
              </div>
            );
          })
        )}
      </div>

      <div style={{ borderTop: "1px solid #EDE9DC", paddingTop: 12 }}>
        <div className="id-row"><span className="id-label">商品名稱</span><input type="text" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="id-row">
          <span className="id-label">系列</span>
          <select value={seriesId} onChange={(e) => setSeriesId(e.target.value)} style={{ flex: 1, padding: 8 }}>
            <option value="">（不指定）</option>
            {seriesList.map((s) => <option key={s.id} value={s.id}>{s.name}{s.is_gift_series ? "（贈品/滿贈）" : ""}</option>)}
          </select>
        </div>
        <div className="id-row"><span className="id-label">金額</span><input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        <div className="id-row"><span className="id-label">運費金額</span><input type="number" value={shippingFee} onChange={(e) => setShippingFee(e.target.value)} /></div>
        <div className="id-row"><span className="id-label">款式</span><input type="text" value={stylesText} onChange={(e) => setStylesText(e.target.value)} placeholder="逗號分隔，如：A,B,C，留空＝單一款式" /></div>
        <div className="id-row"><span className="id-label">圖片網址</span><input type="text" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="一般圖床或Google雲端硬碟連結" /></div>
        <div className="id-row">
          <span className="id-label">或上傳圖片</span>
          <input type="file" accept="image/*" disabled={uploading} onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} />
          {uploading && <span style={{ fontSize: 12, color: "#8A8779" }}>上傳中…</span>}
        </div>
        <div className="id-row">
          <span className="id-label">是否滿減(v)</span>
          <input type="checkbox" checked={hasDiscountFlag} onChange={(e) => setHasDiscountFlag(e.target.checked)} />
        </div>
        <div className="id-row">
          <span className="id-label">是否開放取付</span>
          <input type="checkbox" checked={codAllowed} onChange={(e) => setCodAllowed(e.target.checked)} />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={save}>{editingId ? "儲存修改" : "新增商品"}</button>
          {editingId && <button className="btn secondary" onClick={resetForm}>取消編輯</button>}
        </div>
        {msg && <div style={{ fontSize: 13, color: "#dc2626", marginTop: 6 }}>{msg}</div>}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type Product = { id: string; name: string; amount: number; product_variants: { style_name: string | null }[] };

export default function CampaignProductsPage() {
  const params = useParams();
  const campaignId = params.id as string;

  const [inCampaign, setInCampaign] = useState<Product[]>([]);
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [picking, setPicking] = useState("");

  // 快速匯入CSV到這個檔期
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<any>(null);
  const [importing, setImporting] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [inRes, allRes] = await Promise.all([
        fetch(`/api/admin/campaigns/${campaignId}/products`),
        fetch("/api/admin/products"),
      ]);
      const inData = await inRes.json();
      const allData = await allRes.json();
      if (!inRes.ok) throw new Error(inData.error || "載入失敗");
      setInCampaign(inData.products || []);
      setCatalog(allData.products || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [campaignId]);

  const inCampaignIds = new Set(inCampaign.map((p) => p.id));
  const availableToAdd = catalog.filter((p) => !inCampaignIds.has(p.id));

  async function handleAdd() {
    if (!picking) return;
    const res = await fetch(`/api/admin/campaigns/${campaignId}/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: picking }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error);
    setPicking("");
    load();
  }

  async function handleRemove(productId: string) {
    if (!confirm("確定要把這個商品從這個檔期移除嗎？（商品本身不會被刪除，只是這檔期不賣了）")) return;
    await fetch(`/api/admin/campaigns/${campaignId}/products`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId }),
    });
    load();
  }

  async function handleImport() {
    if (!importFile) return setError("請先選擇要匯入的檔案");
    setImporting(true);
    setError("");
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append("file", importFile);
      formData.append("campaignId", campaignId);
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

  return (
    <div className="admin-page" style={{ maxWidth: 800 }}>
      <nav className="admin-nav">
        <Link href="/admin">← 後台首頁</Link>
      </nav>
      <h1>檔期商品</h1>
      <p className="admin-sub">商品是獨立商品庫，這裡是從庫裡挑商品進來這個檔期賣；新建立的商品要到後台首頁的「商品管理」新增</p>

      {error && <div className="admin-error-box">{error}</div>}

      <div className="admin-form-card">
        <div style={{ fontWeight: 500, marginBottom: 8 }}>從商品庫挑選既有商品</div>
        <div style={{ display: "flex", gap: 8 }}>
          <select value={picking} onChange={(e) => setPicking(e.target.value)} style={{ flex: 1 }}>
            <option value="">選擇商品</option>
            {availableToAdd.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}（{p.amount}）
              </option>
            ))}
          </select>
          <button className="btn" onClick={handleAdd}>
            加入這個檔期
          </button>
        </div>
      </div>

      <div className="admin-form-card">
        <div style={{ fontWeight: 500, marginBottom: 8 }}>快速用 CSV/Excel 建立新商品並直接加入這個檔期</div>
        <div className="admin-form-row">
          <label>選擇檔案</label>
          <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => setImportFile(e.target.files?.[0] || null)} />
        </div>
        <button className="btn" onClick={handleImport} disabled={importing}>
          {importing ? "匯入中…" : "開始匯入"}
        </button>
        {importResult && (
          <div style={{ marginTop: 12, fontSize: 13 }}>
            共 {importResult.total} 筆，成功 {importResult.success} 筆，失敗 {importResult.failed} 筆
          </div>
        )}
      </div>

      {loading ? (
        <div className="admin-empty">載入中…</div>
      ) : inCampaign.length === 0 ? (
        <div className="admin-empty">這個檔期還沒有挑任何商品</div>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>商品名稱</th>
              <th>款式</th>
              <th>金額</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {inCampaign.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td style={{ fontSize: 13, color: "var(--muted)" }}>
                  {p.product_variants.map((v) => v.style_name).filter(Boolean).join("、") || "（單一款式）"}
                </td>
                <td>{p.amount}</td>
                <td className="admin-row-actions">
                  <button className="admin-link-btn danger" onClick={() => handleRemove(p.id)}>
                    從此檔期移除
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

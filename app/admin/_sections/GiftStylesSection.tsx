"use client";
import { useEffect, useState } from "react";

type Campaign = { id: string; name: string };
type GiftStyle = { id: string; style_name: string; threshold_amount: number; image_url: string | null };

export default function GiftStylesSection() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [list, setList] = useState<GiftStyle[]>([]);
  const [name, setName] = useState("");
  const [threshold, setThreshold] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/admin/campaigns").then((r) => r.json()).then((d) => setCampaigns(d.campaigns || []));
  }, []);

  async function load(cid: string) {
    setLoading(true);
    const res = await fetch(`/api/admin/campaigns/${cid}/gift-styles`);
    const data = await res.json();
    setList(data.giftStyles || []);
    setLoading(false);
  }

  useEffect(() => {
    if (campaignId) load(campaignId);
    else setList([]);
  }, [campaignId]);

  async function save() {
    setMsg("");
    if (!campaignId) return setMsg("請先選擇檔期");
    if (!name.trim()) return setMsg("請輸入款式名稱");
    const thresholdNum = Number(threshold);
    if (!isFinite(thresholdNum) || thresholdNum <= 0) return setMsg("門檻金額格式不正確");
    const res = await fetch(`/api/admin/campaigns/${campaignId}/gift-styles`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ styleName: name, thresholdAmount: thresholdNum, imageUrl: imageUrl || null }),
    });
    const data = await res.json();
    if (!res.ok) return setMsg(data.error);
    setName(""); setThreshold(""); setImageUrl("");
    load(campaignId);
  }

  async function deleteItem(id: string) {
    if (!confirm("確定要刪除這個款式嗎？")) return;
    await fetch(`/api/admin/campaigns/${campaignId}/gift-styles/${id}`, { method: "DELETE" });
    load(campaignId);
  }

  return (
    <div className="auth-card">
      <h3>滿贈款式管理</h3>
      <p style={{ fontSize: 13, color: "#8A8779" }}>滿贈款式綁定在特定檔期底下，每個款式只需登記一次：名稱＋門檻金額</p>

      <div className="id-row">
        <span className="id-label">選擇檔期</span>
        <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} style={{ flex: 1, padding: 8 }}>
          <option value="">請選擇</option>
          {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {campaignId && (
        <>
          <div style={{ marginTop: 12, marginBottom: 12, maxHeight: 280, overflowY: "auto", borderTop: "1px solid #EDE9DC", paddingTop: 12 }}>
            {loading ? <div style={{ fontSize: 13, color: "#8A8779" }}>載入中…</div> : list.length === 0 ? (
              <div style={{ fontSize: 13, color: "#8A8779" }}>這個檔期還沒有登記滿贈款式</div>
            ) : (
              list.map((s) => (
                <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px dashed #EDE9DC" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {s.image_url && <img src={s.image_url} alt={s.style_name} style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 6 }} />}
                    <div>
                      <div style={{ fontSize: 14 }}>{s.style_name}</div>
                      <div style={{ fontSize: 12, color: "#8A8779" }}>門檻 {s.threshold_amount}</div>
                    </div>
                  </div>
                  <button className="btn small danger" onClick={() => deleteItem(s.id)}>刪除</button>
                </div>
              ))
            )}
          </div>

          <div className="id-row"><span className="id-label">款式名稱</span><input type="text" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="id-row"><span className="id-label">門檻金額</span><input type="number" value={threshold} onChange={(e) => setThreshold(e.target.value)} /></div>
          <div className="id-row"><span className="id-label">圖片網址</span><input type="text" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="選填" /></div>
          <button className="btn" onClick={save}>新增款式</button>
          {msg && <div style={{ fontSize: 13, color: "#dc2626", marginTop: 6 }}>{msg}</div>}
        </>
      )}
    </div>
  );
}

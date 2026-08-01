"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Campaign = {
  id: string;
  name: string;
  opens_at: string;
  closes_at: string;
  isOpen: boolean;
};

export default function CampaignListPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/campaigns")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setError(d.error);
          return;
        }
        setCampaigns(d.campaigns || []);
      })
      .catch((e) => setError(e.message || "連線失敗"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: "40px 16px" }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>訂購檔期</h1>
      <p style={{ color: "#9A9787", fontSize: 14, marginBottom: 24 }}>
        檔期開放時間內可下單，開放時間外仍可瀏覽
      </p>

      {loading ? (
        <div style={{ color: "#9A9787" }}>載入中…</div>
      ) : error ? (
        <div style={{ color: "#C0392B", background: "#FDE8E8", padding: 12, borderRadius: 8 }}>錯誤：{error}</div>
      ) : campaigns.length === 0 ? (
        <div style={{ color: "#9A9787" }}>目前沒有任何檔期</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {campaigns.map((c) => (
            <Link
              key={c.id}
              href={`/campaigns/${c.id}`}
              style={{
                display: "block",
                padding: 16,
                border: "1px solid #E5E1D3",
                borderRadius: 10,
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 500 }}>{c.name}</span>
                <span
                  style={{
                    fontSize: 12,
                    padding: "2px 10px",
                    borderRadius: 4,
                    background: c.isOpen ? "#E6F4EA" : "#F0EEE4",
                    color: c.isOpen ? "#1E7A3D" : "#9A9787",
                  }}
                >
                  {c.isOpen ? "開放下單中" : "非開放時間（僅供瀏覽）"}
                </span>
              </div>
              <div style={{ fontSize: 13, color: "#9A9787", marginTop: 6 }}>
                {new Date(c.opens_at).toLocaleString("zh-TW")} ～ {new Date(c.closes_at).toLocaleString("zh-TW")}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

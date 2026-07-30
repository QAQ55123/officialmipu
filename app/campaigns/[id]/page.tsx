"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CartProvider, useCart } from "@/lib/cartContext";

type Variant = { id: string; style_name: string | null };
type Product = {
  id: string;
  name: string;
  amount: number;
  image_url: string | null;
  product_variants: Variant[];
};
type SeriesGroup = {
  seriesId: string | null;
  seriesName: string;
  isGiftSeries: boolean;
  products: Product[];
};
type Campaign = { id: string; name: string; isOpen: boolean };

function CampaignDetailInner({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [seriesGroups, setSeriesGroups] = useState<SeriesGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { items, addItem } = useCart();

  useEffect(() => {
    fetch(`/api/campaigns/${campaignId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setError(d.error);
          return;
        }
        setCampaign(d.campaign);
        setSeriesGroups(d.seriesGroups || []);
      })
      .finally(() => setLoading(false));
  }, [campaignId]);

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#9A9787" }}>載入中…</div>;
  if (error) return <div style={{ padding: 40, textAlign: "center", color: "#C0392B" }}>{error}</div>;
  if (!campaign) return null;

  const cartCount = items.reduce((s, i) => s + i.qty, 0);

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: "24px 16px 100px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>{campaign.name}</h1>
        {!campaign.isOpen && (
          <span style={{ fontSize: 12, padding: "2px 10px", borderRadius: 4, background: "#F0EEE4", color: "#9A9787" }}>
            非開放時間，僅供瀏覽
          </span>
        )}
      </div>

      {seriesGroups.map((group) => (
        <div key={group.seriesId ?? "none"} style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 16, marginBottom: 12 }}>
            {group.seriesName}
            {group.isGiftSeries && (
              <span style={{ fontSize: 12, color: "#9A9787", marginLeft: 8 }}>（贈品/滿贈系列）</span>
            )}
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {group.products.map((p) => (
              <ProductRow
                key={p.id}
                product={p}
                disabled={!campaign.isOpen}
                onAdd={(variantId, styleName, qty) =>
                  addItem({ productVariantId: variantId, productName: p.name, styleName, unitAmount: p.amount }, qty)
                }
              />
            ))}
          </div>
        </div>
      ))}

      {cartCount > 0 && (
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            background: "#fff",
            borderTop: "1px solid #E5E1D3",
            padding: 14,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>購物車：{cartCount} 件商品</span>
          <button className="btn" onClick={() => router.push("/cart")}>
            前往購物車
          </button>
        </div>
      )}
    </div>
  );
}

function ProductRow({
  product,
  disabled,
  onAdd,
}: {
  product: Product;
  disabled: boolean;
  onAdd: (variantId: string, styleName: string | null, qty: number) => void;
}) {
  const hasStyles = product.product_variants.length > 1 || product.product_variants[0]?.style_name;
  const [selectedVariant, setSelectedVariant] = useState(product.product_variants[0]?.id || "");
  const [qty, setQty] = useState(1);

  const selectedStyleName = product.product_variants.find((v) => v.id === selectedVariant)?.style_name ?? null;

  return (
    <div style={{ display: "flex", gap: 12, padding: 12, border: "1px solid #E5E1D3", borderRadius: 8 }}>
      {product.image_url && (
        <img src={product.image_url} alt={product.name} style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 6 }} />
      )}
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 500, fontSize: 14 }}>{product.name}</div>
        <div style={{ fontSize: 13, color: "#9A9787" }}>NT$ {product.amount}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {hasStyles && (
          <select value={selectedVariant} onChange={(e) => setSelectedVariant(e.target.value)} disabled={disabled}>
            {product.product_variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.style_name || "單一款式"}
              </option>
            ))}
          </select>
        )}
        <input
          type="number"
          min={1}
          value={qty}
          onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
          style={{ width: 50 }}
          disabled={disabled}
        />
        <button
          className="btn"
          disabled={disabled}
          onClick={() => onAdd(selectedVariant, selectedStyleName, qty)}
        >
          加入
        </button>
      </div>
    </div>
  );
}

export default function CampaignDetailPage() {
  const params = useParams();
  const campaignId = params.id as string;
  return (
    <CartProvider campaignId={campaignId}>
      <CampaignDetailInner campaignId={campaignId} />
    </CartProvider>
  );
}

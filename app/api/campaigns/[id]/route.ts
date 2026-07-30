import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

// GET /api/campaigns/:id — 檔期詳細資料＋商品清單（依系列分組）
// 檔期外時間仍可瀏覽（isOpen=false 時前端只是不給下單，不是整頁擋掉）
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = getSupabase();

  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();

  if (campaignError) return NextResponse.json({ error: campaignError.message }, { status: 500 });
  if (!campaign) return NextResponse.json({ error: "找不到這個檔期" }, { status: 404 });

  const now = Date.now();
  const isOpen = now >= new Date(campaign.opens_at).getTime() && now <= new Date(campaign.closes_at).getTime();

  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("*, product_variants(*), series(id, name, is_gift_series)")
    .eq("campaign_id", params.id)
    .order("created_at", { ascending: true });

  if (productsError) return NextResponse.json({ error: productsError.message }, { status: 500 });

  // 依系列分組，方便前台用系列當分類頁籤顯示
  const bySeriesMap = new Map<string, { seriesId: string | null; seriesName: string; isGiftSeries: boolean; products: any[] }>();
  for (const p of products || []) {
    const seriesId = p.series?.id ?? "none";
    const seriesName = p.series?.name ?? "未分類";
    if (!bySeriesMap.has(seriesId)) {
      bySeriesMap.set(seriesId, {
        seriesId: p.series?.id ?? null,
        seriesName,
        isGiftSeries: !!p.series?.is_gift_series,
        products: [],
      });
    }
    bySeriesMap.get(seriesId)!.products.push(p);
  }

  return NextResponse.json({
    campaign: { ...campaign, isOpen },
    seriesGroups: Array.from(bySeriesMap.values()),
  });
}

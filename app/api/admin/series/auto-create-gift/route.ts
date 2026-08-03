import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

/**
 * 2.3節：滿贈分類底下，選檔期自動建立滿贈系列與商品。
 * body: { categoryId, campaignId }
 * 流程：用檔期名稱建立系列（歸到這個滿贈分類底下）→ 抓該檔期「滿贈款式登記」全部資料，
 * 依門檻金額分組 → 每個門檻各自建立一個商品（商品名稱＝門檻金額，款式＝該門檻下每個款式的名稱，
 * 圖片網址原封不動帶入），金額欄位先留0，由店家自己手動填。
 */
export async function POST(req: Request) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const body = await req.json();
  const categoryId = String(body.categoryId || "");
  const campaignId = String(body.campaignId || "");
  if (!categoryId) return NextResponse.json({ error: "缺少分類" }, { status: 400 });
  if (!campaignId) return NextResponse.json({ error: "請選擇檔期" }, { status: 400 });

  const supabase = getSupabaseAdmin();

  const { data: campaign, error: campaignErr } = await supabase.from("campaigns").select("id, name").eq("id", campaignId).maybeSingle();
  if (campaignErr || !campaign) return NextResponse.json({ error: "找不到這個檔期" }, { status: 404 });

  const { data: giftStyles, error: giftStylesErr } = await supabase
    .from("gift_styles")
    .select("style_name, threshold_amount, image_url")
    .eq("campaign_id", campaignId)
    .order("threshold_amount", { ascending: true });
  if (giftStylesErr) return NextResponse.json({ error: giftStylesErr.message }, { status: 500 });
  if (!giftStyles || giftStyles.length === 0) {
    return NextResponse.json({ error: "這個檔期還沒有登記任何滿贈款式，請先到「滿贈款式登記」新增" }, { status: 400 });
  }

  // 建立系列，名稱用檔期名稱
  const { data: existingSeries } = await supabase.from("series").select("sort_order").eq("category_id", categoryId).order("sort_order", { ascending: false }).limit(1);
  const nextSeriesSortOrder = existingSeries && existingSeries.length > 0 ? existingSeries[0].sort_order + 1 : 0;

  const { data: series, error: seriesErr } = await supabase
    .from("series")
    .insert({ name: campaign.name, category_id: categoryId, sort_order: nextSeriesSortOrder, is_visible: true })
    .select()
    .single();
  if (seriesErr) return NextResponse.json({ error: "建立系列失敗：" + seriesErr.message }, { status: 500 });

  // 依門檻金額分組
  const grouped = new Map<number, { style_name: string; image_url: string | null }[]>();
  giftStyles.forEach((g) => {
    const key = Number(g.threshold_amount);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push({ style_name: g.style_name, image_url: g.image_url });
  });

  const productRows: any[] = [];
  let sortOrder = 0;
  for (const [threshold, styles] of grouped) {
    styles.forEach((s) => {
      productRows.push({
        series_id: series.id,
        name: String(threshold),
        style: s.style_name || "",
        price: 0,
        image_url: s.image_url || null,
        has_discount_flag: true,
        cod_allowed: true,
        sort_order: sortOrder++,
      });
    });
  }

  const { error: productsErr } = await supabase.from("products").insert(productRows);
  if (productsErr) return NextResponse.json({ error: "建立商品失敗：" + productsErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, series, productCount: productRows.length });
}

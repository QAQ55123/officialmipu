import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";
import { bracketFor, orderQuotaForPlatform, styleMaxForPlatform, netAmount, parseAdjustmentText } from "@/lib/vendorPlatform";

// GET /api/admin/campaigns/:id/split-order/:batchId — 拆單批次完整資料
export async function GET(req: Request, { params }: { params: { id: string; batchId: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  const [{ data: tiers }, { data: platforms }, { data: platformCapsRaw }, { data: purchaseOrders }] = await Promise.all([
    supabase.from("vendor_gift_tiers").select("*").eq("campaign_id", params.id).order("threshold_amount"),
    supabase.from("vendor_platforms").select("*").eq("campaign_id", params.id),
    supabase
      .from("vendor_platform_tier_caps")
      .select("*, vendor_platforms!inner(campaign_id)")
      .eq("vendor_platforms.campaign_id", params.id),
    supabase
      .from("vendor_purchase_orders")
      .select(
        "*, vendor_purchase_order_items(*, members(username), order_items(product_variant_id, product_variants(style_name, products(name)))), vendor_purchase_order_gifts(*, gift_styles(style_name, threshold_amount))"
      )
      .eq("batch_id", params.batchId),
  ]);

  const tierConfigs = (tiers || []).map((t) => ({ thresholdAmount: t.threshold_amount, discountAmount: t.discount_amount }));
  const platformConfigs: Record<string, { id: string; name: string; orderGiftCap: number; tierCaps: Record<number, number> }> = {};
  for (const p of platforms || []) {
    platformConfigs[p.id] = { id: p.id, name: p.name, orderGiftCap: p.order_gift_cap, tierCaps: {} };
  }
  for (const c of platformCapsRaw || []) {
    if (platformConfigs[c.platform_id]) {
      platformConfigs[c.platform_id].tierCaps[c.threshold_amount] = c.per_style_cap;
    }
  }

  const orders = (purchaseOrders || []).map((po: any) => {
    const subtotal = po.vendor_purchase_order_items.reduce((s: number, it: any) => s + it.unit_amount * it.qty, 0);
    const bracket = bracketFor(subtotal, tierConfigs);
    const platform = platformConfigs[po.platform_id];
    const quota = platform ? orderQuotaForPlatform(subtotal, 100, platform) : 0;
    const adjustment = parseAdjustmentText(po.adjustment_text || "");
    const net = platform ? netAmount(subtotal, bracket?.discountAmount || 0, adjustment) : subtotal;

    const gifts = po.vendor_purchase_order_gifts.map((g: any) => {
      const max = platform
        ? styleMaxForPlatform(subtotal, g.gift_styles.threshold_amount, platform, bracket?.thresholdAmount ?? null)
        : 0;
      return { id: g.id, giftStyleId: g.gift_style_id, styleName: g.gift_styles.style_name, qty: g.qty, max };
    });
    const giftTotal = gifts.reduce((s: number, g: any) => s + g.qty, 0);

    return {
      id: po.id,
      platformId: po.platform_id,
      adjustmentText: po.adjustment_text,
      items: po.vendor_purchase_order_items.map((it: any) => ({
        id: it.id,
        orderItemId: it.order_item_id,
        customerMemberId: it.customer_member_id,
        customerName: it.members?.username ?? "（未知顧客）",
        productName: it.order_items?.product_variants?.products?.name ?? "",
        styleName: it.order_items?.product_variants?.style_name ?? null,
        qty: it.qty,
        unitAmount: it.unit_amount,
        reassignmentNote: it.reassignment_note,
      })),
      gifts,
      subtotal,
      bracket: bracket?.thresholdAmount ?? null,
      discount: bracket?.discountAmount ?? 0,
      quota,
      giftTotal,
      adjustment,
      net,
    };
  });

  // 贈品缺口總覽：顧客保底加總（2.7的 order_gift_selections）vs 目前已配置（含額外採購）
  const { data: giftStyles } = await supabase.from("gift_styles").select("id, style_name").eq("campaign_id", params.id);
  const { data: campaignOrders } = await supabase.from("orders").select("id").eq("campaign_id", params.id);
  const orderIds = (campaignOrders || []).map((o) => o.id);

  let requiredMap: Record<string, number> = {};
  if (orderIds.length > 0) {
    const { data: selections } = await supabase
      .from("order_gift_selections")
      .select("gift_style_id, qty")
      .in("order_id", orderIds);
    for (const s of selections || []) {
      requiredMap[s.gift_style_id] = (requiredMap[s.gift_style_id] || 0) + s.qty;
    }
  }

  const { data: extraPurchases } = await supabase
    .from("vendor_extra_purchases")
    .select("gift_style_id, qty")
    .eq("campaign_id", params.id);

  const gapSummary = (giftStyles || []).map((s) => {
    const required = requiredMap[s.id] || 0;
    const allocatedFromOrders = orders.reduce(
      (sum, po) => sum + po.gifts.filter((g: any) => g.giftStyleId === s.id).reduce((gs: number, g: any) => gs + g.qty, 0),
      0
    );
    const allocatedFromExtra = (extraPurchases || [])
      .filter((e) => e.gift_style_id === s.id)
      .reduce((sum, e) => sum + e.qty, 0);
    const allocated = allocatedFromOrders + allocatedFromExtra;
    return { giftStyleId: s.id, styleName: s.style_name, required, allocated, diff: allocated - required };
  });

  const { data: backorders } = await supabase
    .from("backorders")
    .select("*, members(username), product_variants(style_name, products(name))")
    .eq("campaign_id", params.id)
    .eq("fulfilled", false)
    .order("created_at", { ascending: true });

  return NextResponse.json({
    orders,
    tiers: tierConfigs,
    platforms: Object.values(platformConfigs),
    gapSummary,
    backorders: (backorders || []).map((b: any) => ({
      id: b.id,
      customerName: b.members?.username,
      productName: b.product_variants?.products?.name,
      styleName: b.product_variants?.style_name,
      qty: b.qty,
    })),
  });
}

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

// POST /api/admin/campaigns/:id/cost-sheet/init
// 用這個檔期目前的訂單品項，產生一份初始的成本SHEET列（顧客/商品/款式/數量/原幣單價/匯率/台幣小計公式）
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  const { data: orders, error } = await supabase
    .from("orders")
    .select("id, members(username), order_items(qty, unit_amount_original, product_variants(style_name, products(name)))")
    .eq("campaign_id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const header = ["顧客", "商品", "款式", "數量", "原幣單價", "匯率", "台幣小計(公式)"];
  const rows: string[][] = [header];

  let rowIndex = 2; // 從第2列開始（第1列是標題）
  for (const o of orders || []) {
    for (const oi of (o as any).order_items || []) {
      rows.push([
        (o as any).members?.username ?? "",
        oi.product_variants?.products?.name ?? "",
        oi.product_variants?.style_name ?? "",
        String(oi.qty),
        String(oi.unit_amount_original),
        "", // 匯率留空給使用者填
        `=D${rowIndex}*E${rowIndex}*F${rowIndex}`,
      ]);
      rowIndex++;
    }
  }

  const { error: saveError } = await supabase
    .from("cost_sheets")
    .upsert({ campaign_id: params.id, data: rows, updated_at: new Date().toISOString() });
  if (saveError) return NextResponse.json({ error: saveError.message }, { status: 500 });

  return NextResponse.json({ data: rows });
}

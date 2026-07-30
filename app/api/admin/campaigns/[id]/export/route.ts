import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

// GET /api/admin/campaigns/:id/export — 匯出這個檔期的訂單明細為 Excel
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data: orders, error } = await supabase
    .from("orders")
    .select(
      "id, created_at, txn_method, members(username), order_items(qty, unit_amount_original, unit_amount_twd, product_variants(style_name, products(name)))"
    )
    .eq("campaign_id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows: any[] = [];
  for (const o of orders || []) {
    for (const oi of (o as any).order_items || []) {
      rows.push({
        訂單編號: o.id,
        下單時間: new Date(o.created_at).toLocaleString("zh-TW"),
        顧客: (o as any).members?.username ?? "",
        交易方式: o.txn_method === "bank" ? "匯款" : "取付",
        商品名稱: oi.product_variants?.products?.name ?? "",
        款式: oi.product_variants?.style_name ?? "",
        數量: oi.qty,
        原幣單價: oi.unit_amount_original,
        台幣單價: oi.unit_amount_twd,
        台幣小計: oi.unit_amount_twd * oi.qty,
      });
    }
  }

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "訂單明細");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="orders-${params.id}.xlsx"`,
    },
  });
}

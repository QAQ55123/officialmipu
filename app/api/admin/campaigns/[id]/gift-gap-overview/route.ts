import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";
import { computeGiftGap } from "@/lib/giftGap";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * 3.2節：贈品缺口總覽，逐款式列出「顧客保底加總需要多少」vs「目前所有採購單已配置多少」。
 * 保底加總＝所有這個檔期訂單裡，顧客結帳當下實際選擇的滿贈數量加總（order_gift_selections），
 * 因為那就是系統已經向顧客承諾一定會拿到的數量。
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();

  try {
    // 缺口算法跟「自動分配」共用 lib/giftGap.ts，兩邊算出來一定一樣
    const rows = await computeGiftGap(supabase, params.id);
    const overview = rows.map((r) => ({
      giftStyleId: r.giftStyleId,
      styleName: r.styleName,
      thresholdAmount: r.thresholdAmount,
      promised: r.promised,
      allocated: r.allocated,
      extra: r.extra,
      diff: -r.gap, // 正=餘，負=缺
    }));
    return NextResponse.json({ overview });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

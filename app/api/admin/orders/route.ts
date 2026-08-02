import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession, requireOwnerSession } from "@/lib/adminAuth";
import { syncOrderRealtimeToPlanTab, syncOnePlanCostTab } from "@/lib/planSheetSync";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** 用訂單編號查詢訂單完整內容（僅限最高權限） ?orderNo=xxx */
export async function GET(req: Request) {
  try {
    requireAdminSession(req); // 先確認有登入
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  try {
    requireOwnerSession(req); // 再確認是最高權限，權限不足跟登入過期要分開，不然一般管理者會被誤判成登入過期而登出
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const orderNo = (searchParams.get("orderNo") || "").trim();
  if (!orderNo) return NextResponse.json({ error: "請輸入訂單編號" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: order, error } = await supabase
    .from("orders")
    .select("*, series(name), order_items(*)")
    .eq("order_no", orderNo)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!order) return NextResponse.json({ error: "找不到這張訂單" }, { status: 404 });

  return NextResponse.json({
    order: {
      orderNo: order.order_no,
      seriesId: order.series_id,
      username: order.username,
      profileUrl: order.profile_url,
      seriesName: order.series_name_snapshot || order.series?.name || "（系列已刪除）",
      payment: order.payment,
      paidStatus: order.paid_status,
      paidAmount: Number(order.paid_amount) || 0,
      createdAt: order.created_at,
      items: (order.order_items || []).map((it: any) => ({
        name: it.product_name,
        style: it.style,
        qty: it.qty,
        unitPrice: Number(it.unit_price),
        subtotal: Number(it.subtotal),
        imageUrl: it.image_url,
      })),
      total: (order.order_items || []).reduce((s: number, it: any) => s + Number(it.subtotal), 0),
    },
  });
}

/** 填寫已收金額（僅限最高權限）body: { orderNo, paidAmount }，會一併觸發同步到 Sheet 的付款狀態欄 */
export async function PATCH(req: Request) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  try {
    requireOwnerSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 403 });
  }

  const body = await req.json();
  const orderNo = String(body.orderNo || "").trim();
  const paidAmount = Number(body.paidAmount);
  if (!orderNo) return NextResponse.json({ error: "缺少訂單編號" }, { status: 400 });
  if (!Number.isFinite(paidAmount) || paidAmount < 0) return NextResponse.json({ error: "已收金額格式不正確" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: order } = await supabase.from("orders").select("id, campaign_id, campaigns(name)").eq("order_no", orderNo).maybeSingle();
  if (!order) return NextResponse.json({ error: "找不到這張訂單" }, { status: 404 });

  const { error } = await supabase.from("orders").update({ paid_amount: paidAmount }).eq("id", order.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 同步這筆訂單所屬企劃的 Sheet（讓付款狀態欄跟成本表的「已收」馬上更新）
  // 這裡「不」吞掉錯誤：這是管理者主動的操作，同步失敗要讓管理者知道，不能默默失敗
  const campaignName = (order as any).campaigns?.name;
  let syncWarning = "";
  if (order.campaign_id && campaignName) {
    try {
      await syncOrderRealtimeToPlanTab(order.campaign_id, campaignName);
      await syncOnePlanCostTab(order.campaign_id, campaignName);
    } catch (e: any) {
      syncWarning = "已收金額已存檔，但同步到 Google Sheet 失敗：" + (e?.message || "未知錯誤");
    }
  }

  return NextResponse.json({ ok: true, syncWarning: syncWarning || undefined });
}

/** 刪除訂單（僅限最高權限）body: { orderNo } */
export async function DELETE(req: Request) {
  try {
    requireAdminSession(req); // 先確認有登入
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  try {
    requireOwnerSession(req); // 再確認是最高權限，權限不足跟登入過期要分開，不然一般管理者會被誤判成登入過期而登出
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 403 });
  }

  const body = await req.json();
  const orderNo = String(body.orderNo || "").trim();
  if (!orderNo) return NextResponse.json({ error: "請輸入訂單編號" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: order } = await supabase.from("orders").select("id, campaign_id, campaigns(name)").eq("order_no", orderNo).maybeSingle();
  if (!order) return NextResponse.json({ error: "找不到這張訂單" }, { status: 404 });

  const { error } = await supabase.from("orders").delete().eq("id", order.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 訂單真的刪掉之後，重新同步該企劃的分頁，讓 Sheet 上對應的那幾列也跟著消失
  const campaignName = (order as any).campaigns?.name;
  let syncWarning = "";
  if (order.campaign_id && campaignName) {
    try {
      await syncOrderRealtimeToPlanTab(order.campaign_id, campaignName);
      await syncOnePlanCostTab(order.campaign_id, campaignName);
    } catch (e: any) {
      syncWarning = "訂單已刪除，但同步到 Google Sheet 失敗：" + (e?.message || "未知錯誤");
    }
  }

  return NextResponse.json({ ok: true, syncWarning: syncWarning || undefined });
}

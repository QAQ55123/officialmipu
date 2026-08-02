import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession, requireOwnerSession } from "@/lib/adminAuth";
import { deleteStorageFiles } from "@/lib/storage";
import { syncPlansSheet } from "@/lib/sheetsSync";
import { requireSheetId, deleteSheetTabIfExists } from "@/lib/googleSheets";
import { upsertPlanDeadlineEvent, deletePlanDeadlineEvent } from "@/lib/googleCalendar";

export const dynamic = "force-dynamic";
export const revalidate = 0;


/** 後台用：列出所有企劃（不受前台顯示對象限制），含分類名稱 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("plans")
    .select("*, categories(id, name, parent_id)")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    plans: (data || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      deadline: p.deadline,
      imageUrl: p.image_url,
      codLimit: p.cod_limit,
      allowCodOnRemitLink: !!p.allow_cod_on_remit_link,
      visibleTo: p.visible_to,
      categoryId: p.category_id,
      categoryName: p.categories?.name || null,
      promoImages: p.promo_images || [],
      sortOrder: p.sort_order,
      hideAfterDays: p.hide_after_days,
      fulfillmentStatus: p.fulfillment_status,
    })),
  });
}

export async function POST(req: Request) {
  const body = await req.json();
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ error: "請填寫企劃名稱" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: existing } = await supabase
    .from("plans")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1);
  const nextSortOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0;

  const { data, error } = await supabase
    .from("plans")
    .insert({
      name,
      deadline: body.deadline || null,
      image_url: body.imageUrl || null,
      cod_limit: Number(body.codLimit) || 0,
      allow_cod_on_remit_link: body.allowCodOnRemitLink === true,
      visible_to: body.visibleTo || [],
      category_id: body.categoryId || null,
      promo_images: body.promoImages || [],
      sort_order: nextSortOrder,
      hide_after_days: body.hideAfterDays === "" || body.hideAfterDays == null ? null : Number(body.hideAfterDays),
      fulfillment_status: body.fulfillmentStatus || null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  syncPlansSheet().catch(() => {});

  let calendarWarning = "";
  if (data.deadline) {
    try {
      const eventId = await upsertPlanDeadlineEvent({ planId: data.id, planName: data.name, deadline: data.deadline });
      await supabase.from("plans").update({ calendar_event_id: eventId }).eq("id", data.id);
    } catch (e: any) {
      calendarWarning = "企劃已建立，但同步到 Google 行事曆時發生問題：" + (e?.message || "未知錯誤");
    }
  }

  return NextResponse.json({ ok: true, plan: data, syncWarning: calendarWarning || undefined });
}

export async function PUT(req: Request) {
  const body = await req.json();
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  if (!body.id) return NextResponse.json({ error: "缺少企劃 id" }, { status: 400 });

  const supabase = getSupabaseAdmin();

  // 先抓舊資料，等下比對哪些圖片被換掉/移除了，順便清掉 Storage 裡的舊檔案；也要拿舊的截止時間/行事曆事件ID來判斷怎麼同步
  const { data: oldPlan } = await supabase.from("plans").select("image_url, promo_images, deadline, calendar_event_id, name").eq("id", body.id).single();

  const newDeadline = body.deadline || null;

  const { error } = await supabase
    .from("plans")
    .update({
      name: body.name,
      deadline: newDeadline,
      image_url: body.imageUrl || null,
      cod_limit: Number(body.codLimit) || 0,
      allow_cod_on_remit_link: body.allowCodOnRemitLink === true,
      visible_to: body.visibleTo || [],
      category_id: body.categoryId || null,
      promo_images: body.promoImages || [],
      hide_after_days: body.hideAfterDays === "" || body.hideAfterDays == null ? null : Number(body.hideAfterDays),
      fulfillment_status: body.fulfillmentStatus || null,
    })
    .eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (oldPlan) {
    const newImageUrl = body.imageUrl || null;
    const newPromoImages: string[] = body.promoImages || [];
    const removedUrls = [
      ...(oldPlan.image_url && oldPlan.image_url !== newImageUrl ? [oldPlan.image_url] : []),
      ...((oldPlan.promo_images || []).filter((u: string) => !newPromoImages.includes(u))),
    ];
    if (removedUrls.length > 0) deleteStorageFiles(removedUrls).catch(() => {});
  }

  syncPlansSheet().catch(() => {});

  // 同步行事曆：有截止時間就建立/更新事件；截止時間被清空、但之前有事件的話就刪掉
  let calendarWarning = "";
  try {
    if (newDeadline) {
      const eventId = await upsertPlanDeadlineEvent({
        planId: body.id,
        planName: body.name,
        deadline: newDeadline,
        existingEventId: oldPlan?.calendar_event_id || null,
      });
      if (eventId !== oldPlan?.calendar_event_id) {
        await supabase.from("plans").update({ calendar_event_id: eventId }).eq("id", body.id);
      }
    } else if (oldPlan?.calendar_event_id) {
      await deletePlanDeadlineEvent(oldPlan.calendar_event_id);
      await supabase.from("plans").update({ calendar_event_id: null }).eq("id", body.id);
    }
  } catch (e: any) {
    calendarWarning = "企劃已儲存，但同步到 Google 行事曆時發生問題：" + (e?.message || "未知錯誤");
  }

  return NextResponse.json({ ok: true, syncWarning: calendarWarning || undefined });
}

export async function DELETE(req: Request) {
  const body = await req.json();
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  if (!body.id) return NextResponse.json({ error: "缺少企劃 id" }, { status: 400 });
  const purgeOrders = body.purgeOrders === true;

  if (purgeOrders) {
    try {
      requireOwnerSession(req);
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
  }

  const supabase = getSupabaseAdmin();

  // 刪除前先把這個企劃、以及底下所有商品用到的圖片蒐集起來，等資料庫刪除成功後一併清掉 Storage 檔案
  const { data: plan } = await supabase.from("plans").select("id, name, image_url, promo_images, calendar_event_id").eq("id", body.id).single();
  const { data: products } = await supabase.from("products").select("image_url").eq("plan_id", body.id);
  const urlsToDelete = [
    plan?.image_url,
    ...(plan?.promo_images || []),
    ...((products || []).map((p) => p.image_url)),
  ];

  let purgedOrderCount = 0;
  let sheetTabDeleteWarning = "";

  if (purgeOrders && plan) {
    // 連訂單一起刪除：先刪 order_items，再刪 orders（成本試算表不會動，資料保留）
    const { data: orders } = await supabase.from("orders").select("id").eq("plan_id", plan.id);
    const orderIds = (orders || []).map((o) => o.id);
    purgedOrderCount = orderIds.length;
    if (orderIds.length) {
      const { error: itemsErr } = await supabase.from("order_items").delete().in("order_id", orderIds);
      if (itemsErr) return NextResponse.json({ error: "刪除訂單明細失敗：" + itemsErr.message }, { status: 500 });
      const { error: ordersErr } = await supabase.from("orders").delete().in("id", orderIds);
      if (ordersErr) return NextResponse.json({ error: "刪除訂單失敗：" + ordersErr.message }, { status: 500 });
    }
  }

  // 注意：一般刪除只會連同底下的商品一起刪除（外鍵 cascade），訂單記錄會保留（只是不再連到這個企劃，企劃名稱已經有快照）
  const { error } = await supabase.from("plans").delete().eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  deleteStorageFiles(urlsToDelete).catch(() => {});

  if (plan?.calendar_event_id) {
    deletePlanDeadlineEvent(plan.calendar_event_id).catch(() => {});
  }

  if (purgeOrders && plan?.name) {
    // 刪掉主試算表裡這個企劃的分頁（訂單明細+商品目錄）；成本試算表刻意不動，保留財務歷史紀錄
    try {
      await deleteSheetTabIfExists(requireSheetId(), plan.name);
    } catch (e: any) {
      sheetTabDeleteWarning = "企劃與訂單已刪除，但清除 Google Sheet 分頁時發生問題：" + (e?.message || "未知錯誤");
    }
  }

  syncPlansSheet().catch(() => {});
  return NextResponse.json({ ok: true, purgedOrderCount, syncWarning: sheetTabDeleteWarning || undefined });
}

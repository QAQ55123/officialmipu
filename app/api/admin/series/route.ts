import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession, requireOwnerSession } from "@/lib/adminAuth";
import { deleteStorageFiles } from "@/lib/storage";
import { syncPlansSheet } from "@/lib/sheetsSync";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** 後台用：列出所有系列（不受前台顯示對象限制），含分類名稱 */
export async function GET(req: Request) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("series")
    .select("*, categories(id, name, parent_id)")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    plans: (data || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      imageUrl: p.image_url,
      visibleTo: p.visible_to,
      categoryId: p.category_id,
      categoryName: p.categories?.name || null,
      promoImages: p.promo_images || [],
      sortOrder: p.sort_order,
      isVisible: p.is_visible !== false,
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
  if (!name) return NextResponse.json({ error: "請填寫系列名稱" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: existing } = await supabase
    .from("series")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1);
  const nextSortOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0;

  const { data, error } = await supabase
    .from("series")
    .insert({
      name,
      image_url: body.imageUrl || null,
      visible_to: body.visibleTo || [],
      category_id: body.categoryId || null,
      promo_images: body.promoImages || [],
      sort_order: nextSortOrder,
      is_visible: body.isVisible !== false,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  syncPlansSheet().catch(() => {});

  return NextResponse.json({ ok: true, plan: data });
}

export async function PUT(req: Request) {
  const body = await req.json();
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  if (!body.id) return NextResponse.json({ error: "缺少系列 id" }, { status: 400 });

  const supabase = getSupabaseAdmin();

  // 先抓舊資料，等下比對哪些圖片被換掉/移除了，順便清掉 Storage 裡的舊檔案
  const { data: oldSeries } = await supabase.from("series").select("image_url, promo_images").eq("id", body.id).single();

  const { error } = await supabase
    .from("series")
    .update({
      name: body.name,
      image_url: body.imageUrl || null,
      visible_to: body.visibleTo || [],
      category_id: body.categoryId || null,
      promo_images: body.promoImages || [],
      is_visible: body.isVisible !== false,
    })
    .eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (oldSeries) {
    const newImageUrl = body.imageUrl || null;
    const newPromoImages: string[] = body.promoImages || [];
    const removedUrls = [
      ...(oldSeries.image_url && oldSeries.image_url !== newImageUrl ? [oldSeries.image_url] : []),
      ...((oldSeries.promo_images || []).filter((u: string) => !newPromoImages.includes(u))),
    ];
    if (removedUrls.length > 0) deleteStorageFiles(removedUrls).catch(() => {});
  }

  syncPlansSheet().catch(() => {});

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const body = await req.json();
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  if (!body.id) return NextResponse.json({ error: "缺少系列 id" }, { status: 400 });
  const purgeOrders = body.purgeOrders === true;

  if (purgeOrders) {
    try {
      requireOwnerSession(req);
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
  }

  const supabase = getSupabaseAdmin();

  // 刪除前先把這個系列、以及底下所有商品用到的圖片蒐集起來，等資料庫刪除成功後一併清掉 Storage 檔案
  const { data: series } = await supabase.from("series").select("id, name, image_url, promo_images").eq("id", body.id).single();
  const { data: products } = await supabase.from("products").select("image_url").eq("series_id", body.id);
  const urlsToDelete = [
    series?.image_url,
    ...(series?.promo_images || []),
    ...((products || []).map((p) => p.image_url)),
  ];

  let purgedOrderCount = 0;
  let sheetTabDeleteWarning = "";

  if (purgeOrders && series) {
    // 連訂單一起刪除：先刪 order_items，再刪 orders（成本試算表不會動，資料保留）
    const { data: orders } = await supabase.from("orders").select("id").eq("series_id", series.id);
    const orderIds = (orders || []).map((o) => o.id);
    purgedOrderCount = orderIds.length;
    if (orderIds.length) {
      const { error: itemsErr } = await supabase.from("order_items").delete().in("order_id", orderIds);
      if (itemsErr) return NextResponse.json({ error: "刪除訂單明細失敗：" + itemsErr.message }, { status: 500 });
      const { error: ordersErr } = await supabase.from("orders").delete().in("id", orderIds);
      if (ordersErr) return NextResponse.json({ error: "刪除訂單失敗：" + ordersErr.message }, { status: 500 });
    }
  }

  // 注意：一般刪除只會連同底下的商品一起刪除（外鍵 cascade），訂單記錄會保留（只是不再連到這個系列，系列名稱已經有快照）
  const { error } = await supabase.from("series").delete().eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  deleteStorageFiles(urlsToDelete).catch(() => {});

  // 注意：Google Sheet 分頁現在是綁「檔期」不是「系列」（item 7），刪除系列不會連動刪除任何 Sheet 分頁

  syncPlansSheet().catch(() => {});
  return NextResponse.json({ ok: true, purgedOrderCount, syncWarning: sheetTabDeleteWarning || undefined });
}

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function findMemberId(supabase: ReturnType<typeof getSupabaseAdmin>, username: string) {
  const { data } = await supabase.from("members").select("id").ilike("username", username).maybeSingle();
  return data?.id || null;
}

/** GET ?username=... 回傳這個會員收藏的系列清單（含系列基本資訊，前台可以直接拿來顯示） */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const username = searchParams.get("username") || "";
  if (!username) return NextResponse.json({ favorites: [], seriesIds: [] }, { headers: { "Cache-Control": "no-store" } });

  const supabase = getSupabaseAdmin();
  const memberId = await findMemberId(supabase, username);
  if (!memberId) return NextResponse.json({ favorites: [], seriesIds: [] }, { headers: { "Cache-Control": "no-store" } });

  const { data, error } = await supabase
    .from("favorites")
    .select("series_id, series(id, name, image_url, category_id, categories(name))")
    .eq("member_id", memberId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const favorites = (data || [])
    .filter((f: any) => f.series)
    .map((f: any) => ({
      id: f.series.id,
      name: f.series.name,
      imageUrl: f.series.image_url,
      categoryName: f.series.categories?.name || null,
    }));

  return NextResponse.json(
    { favorites, seriesIds: favorites.map((f) => f.id) },
    { headers: { "Cache-Control": "no-store" } }
  );
}

/** POST { username, seriesId } 加入收藏 */
export async function POST(req: Request) {
  const body = await req.json();
  const username = String(body.username || "");
  const seriesId = String(body.seriesId || "");
  if (!username || !seriesId) return NextResponse.json({ error: "缺少必要參數" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const memberId = await findMemberId(supabase, username);
  if (!memberId) return NextResponse.json({ error: "找不到會員資料，請先完成身分驗證" }, { status: 404 });

  const { error } = await supabase.from("favorites").insert({ member_id: memberId, series_id: seriesId });
  // 已經收藏過（觸發 unique 限制）視為成功，不算錯誤
  if (error && !error.message.includes("duplicate")) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/** DELETE { username, seriesId } 取消收藏 */
export async function DELETE(req: Request) {
  const body = await req.json();
  const username = String(body.username || "");
  const seriesId = String(body.seriesId || "");
  if (!username || !seriesId) return NextResponse.json({ error: "缺少必要參數" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const memberId = await findMemberId(supabase, username);
  if (!memberId) return NextResponse.json({ ok: true });

  const { error } = await supabase.from("favorites").delete().eq("member_id", memberId).eq("series_id", seriesId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

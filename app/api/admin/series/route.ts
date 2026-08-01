import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

// GET /api/admin/series — 系列分類列表
export async function GET(req: Request) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("series")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ series: data });
}

// POST /api/admin/series — 新增系列
export async function POST(req: Request) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const body = await req.json();
  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ error: "請輸入系列名稱" }, { status: 400 });

  const supabase = getSupabaseAdmin();

  // 「贈品/滿贈」特殊系列全站只應該有一個，多建立會造成混亂，先擋掉
  if (body.isGiftSeries) {
    const { data: existing } = await supabase
      .from("series")
      .select("id")
      .eq("is_gift_series", true)
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        { error: "「贈品/滿贈」特殊系列已經存在，不能重複建立" },
        { status: 400 }
      );
    }
  }

  const { data, error } = await supabase
    .from("series")
    .insert({
      name,
      is_gift_series: !!body.isGiftSeries,
      sort_order: body.sortOrder ?? 0,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ series: data });
}

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** 前台用：目前只有 checkout_notice（結帳頁說明欄，可能是空字串） */
export async function GET() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("site_settings").select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const map: Record<string, string> = {};
  for (const row of data || []) map[row.key] = row.value || "";

  return NextResponse.json({
    checkoutNotice: map["checkout_notice"] || "",
  });
}

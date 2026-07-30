import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isExpired, getSiteUrl } from "@/lib/tokens";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token") || "";
  const site = getSiteUrl();

  if (!token) return NextResponse.redirect(`${site}/email-verified?status=invalid`);

  const supabase = getSupabaseAdmin();
  const { data: member } = await supabase.from("members").select("*").eq("verify_token", token).maybeSingle();
  if (!member || isExpired(member.verify_token_expires)) {
    return NextResponse.redirect(`${site}/email-verified?status=invalid`);
  }

  await supabase.from("members").update({ email_verified: true, verify_token: null, verify_token_expires: null }).eq("id", member.id);
  return NextResponse.redirect(`${site}/email-verified?status=success`);
}

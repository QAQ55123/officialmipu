import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;


export async function GET(req: Request) {
  try {
    const session = requireAdminSession(req);
    const supabase = getSupabaseAdmin();
    const { data: admin } = await supabase.from("admins").select("email, email_verified").eq("id", session.adminId).single();
    return NextResponse.json({
      loggedIn: true,
      username: session.username,
      role: session.role,
      email: admin?.email || "",
      emailVerified: admin?.email_verified || false,
    });
  } catch {
    return NextResponse.json({ loggedIn: false });
  }
}

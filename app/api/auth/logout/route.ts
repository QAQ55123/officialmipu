import { NextResponse } from "next/server";
import { clearMemberSessionCookieHeader } from "@/lib/memberAuth";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", clearMemberSessionCookieHeader());
  return res;
}

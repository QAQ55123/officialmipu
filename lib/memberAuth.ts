import crypto from "crypto";

export const MEMBER_SESSION_COOKIE = "mibu_member_session";
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 天，重新整理/關掉瀏覽器都不會登出

function secret() {
  const s = process.env.ADMIN_TOKEN_SECRET; // 沿用同一把簽章密鑰即可，payload 內容不同，互不影響
  if (!s) throw new Error("尚未設定 ADMIN_TOKEN_SECRET");
  return s;
}

export function signMemberSession(memberId: string, username: string): string {
  const payload = JSON.stringify({ memberId, username, exp: Date.now() + SESSION_DURATION_MS });
  const payloadB64 = Buffer.from(payload, "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", secret()).update(payloadB64).digest("base64url");
  return `${payloadB64}.${sig}`;
}

export type MemberSessionPayload = { memberId: string; username: string; exp: number };

export function verifyMemberSession(token: string | undefined | null): MemberSessionPayload | null {
  if (!token) return null;
  const [payloadB64, sig] = token.split(".");
  if (!payloadB64 || !sig) return null;
  const expectedSig = crypto.createHmac("sha256", secret()).update(payloadB64).digest("base64url");
  if (sig.length !== expectedSig.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
    return null;
  }
  try {
    const payload: MemberSessionPayload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function extractToken(req: Request): string | null {
  const cookieHeader = req.headers.get("cookie") || "";
  const match = cookieHeader.match(new RegExp(`${MEMBER_SESSION_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function getMemberSession(req: Request): MemberSessionPayload | null {
  return verifyMemberSession(extractToken(req));
}

export function memberSessionCookieHeader(token: string): string {
  const maxAge = Math.floor(SESSION_DURATION_MS / 1000);
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${MEMBER_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function clearMemberSessionCookieHeader(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${MEMBER_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

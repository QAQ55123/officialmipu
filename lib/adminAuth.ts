import crypto from "crypto";
import bcrypt from "bcryptjs";

export type AdminRole = "owner" | "staff";

export async function hashAdminPw(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyAdminPw(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** 用哪組邀請碼註冊，決定拿到的權限等級：owner（最高）或 staff（一般） */
/** 只判斷是不是 owner 的固定邀請碼；staff 的邀請碼是一次性的，存在資料庫裡，另外在註冊 API 查詢 */
export function isOwnerInviteCode(inviteCode: string): boolean {
  const ownerCode = process.env.ADMIN_INVITE_CODE_OWNER || "";
  return !!ownerCode && inviteCode === ownerCode;
}

export const SESSION_COOKIE = "mibu_admin_session";
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 小時後要求重新登入

function secret() {
  const s = process.env.ADMIN_TOKEN_SECRET;
  if (!s) throw new Error("尚未設定 ADMIN_TOKEN_SECRET");
  return s;
}

/** 簽發登入通行證：內容是 { adminId, username, role, exp }，用 HMAC 簽章防止竄改 */
export function signSession(adminId: string, username: string, role: AdminRole): string {
  const payload = JSON.stringify({ adminId, username, role, exp: Date.now() + SESSION_DURATION_MS });
  const payloadB64 = Buffer.from(payload, "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", secret()).update(payloadB64).digest("base64url");
  return `${payloadB64}.${sig}`;
}

export type SessionPayload = { adminId: string; username: string; role: AdminRole; exp: number };

/** 驗證通行證：簽章不符或過期都會回傳 null */
export function verifySession(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;
  const [payloadB64, sig] = token.split(".");
  if (!payloadB64 || !sig) return null;
  const expectedSig = crypto.createHmac("sha256", secret()).update(payloadB64).digest("base64url");
  if (sig.length !== expectedSig.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
    return null;
  }
  try {
    const payload: SessionPayload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function extractToken(req: Request): string | null {
  const cookieHeader = req.headers.get("cookie") || "";
  const match = cookieHeader.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/** 從 request 的 cookie 拿出 session，沒有或無效就丟錯（一般管理者都能用的功能） */
export function requireAdminSession(req: Request): SessionPayload {
  const session = verifySession(extractToken(req));
  if (!session) throw new Error("尚未登入或登入已過期，請重新登入");
  return session;
}

/** 限 owner 專用的功能（例如會員相關工具）：不是 owner 就丟錯 */
export function requireOwnerSession(req: Request): SessionPayload {
  const session = requireAdminSession(req);
  if (session.role !== "owner") throw new Error("這個功能只有最高權限管理者能使用");
  return session;
}

export function sessionCookieHeader(token: string): string {
  const maxAge = Math.floor(SESSION_DURATION_MS / 1000);
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function clearSessionCookieHeader(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

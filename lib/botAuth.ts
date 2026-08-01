/** 給外部服務（例如 Discord 喊單 Bot）呼叫用的 API 認證。
 *  用一組固定密鑰（環境變數 BOT_API_SECRET）當 Bearer Token，不是會員/管理者的登入 session。
 *  Bot 那邊在 .env 設定同一組 BOT_API_SECRET，呼叫 API 時帶 Authorization: Bearer <secret> 這個標頭。 */
export function requireBotSecret(req: Request) {
  const expected = (process.env.BOT_API_SECRET || "").trim();
  if (!expected) throw new Error("伺服器尚未設定 BOT_API_SECRET，無法使用這支 API");
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token || token !== expected) throw new Error("驗證失敗，請確認 BOT_API_SECRET 是否正確");
}

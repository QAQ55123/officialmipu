/** 後台頁面共用的 API 呼叫工具：401 時導回登入頁，其餘錯誤直接丟出訊息 */
export async function callJson(url: string, method: string, body: any) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json();
  if (r.status === 401) {
    window.location.href = "/admin";
    throw new Error("登入已過期，請重新登入");
  }
  if (!r.ok) throw new Error(d.error || "失敗");
  return d;
}

/** GET 版本，401時一樣導回登入頁 */
export async function fetchJson(url: string) {
  const r = await fetch(url, { cache: "no-store" });
  if (r.status === 401) {
    window.location.href = "/admin";
    throw new Error("登入已過期，請重新登入");
  }
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "失敗");
  return d;
}

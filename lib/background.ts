import { waitUntil } from "@vercel/functions";

/**
 * 回應使用者之後還要繼續跑的工作（例如同步 Google Sheet）。
 * Vercel 在回應送出後可能會把函式凍結，沒做完的工作就被中斷；交給 waitUntil 才會等它跑完。
 * 錯誤只記在伺服器 log，不影響已經回應給使用者的結果。
 */
export function runInBackground(label: string, task: () => Promise<unknown>) {
  const p = task().catch((e) => console.error(`${label}失敗：`, e));
  try {
    waitUntil(p);
  } catch {
    // 不在 Vercel 上（例如本機開發）時，promise 一樣會自己跑完
  }
}

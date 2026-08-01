import { NextResponse } from "next/server";
import { requireOwnerSession } from "@/lib/adminAuth";
import { syncAllOrdersSheet, syncMembersSheet, syncPlansSheet, syncProductsSheet, syncAllOrdersCostSheet } from "@/lib/sheetsSync";

// 企劃一多、又遇到 Google API 配額重試等待，整個完整同步可能要跑比較久，
// 盡量跟 Vercel 要長一點的執行時間上限（免費方案上限較低，這裡設定不影響方案本身的硬上限）
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    requireOwnerSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const failed: string[] = [];

  // 會員／企劃彼此獨立，可以同時做；「商品」這裡其實是順便清掉舊版留下的多餘分頁
  const independent = await Promise.allSettled([
    { label: "會員", fn: syncMembersSheet },
    { label: "企劃", fn: syncPlansSheet },
    { label: "清理舊分頁", fn: syncProductsSheet },
  ].map((t) => t.fn()));
  ["會員", "企劃", "清理舊分頁"].forEach((label, i) => {
    const r = independent[i];
    if (r.status === "rejected") failed.push(`${label}：${(r as PromiseRejectedResult).reason?.message || "同步失敗"}`);
  });

  // 訂單分頁一定要先同步完成，成本表才讀得到正確資料（成本表是直接讀取剛同步好的訂單分頁內容來統計）
  try {
    await syncAllOrdersSheet();
  } catch (e: any) {
    failed.push(`訂單：${e?.message || "同步失敗"}`);
  }

  try {
    await syncAllOrdersCostSheet();
  } catch (e: any) {
    failed.push(`成本表：${e?.message || "同步失敗"}`);
  }

  if (failed.length > 0) {
    return NextResponse.json({ error: failed.join("；") }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

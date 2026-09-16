import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminAuth";
import { computeMyshipExport } from "@/lib/myshipExport";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

/**
 * 產生賣貨便「單規格商品匯入」用的 xlsx。
 * 格式比照賣貨便官方範本：商品名稱只填每組第一列，底下每一列是一個規格（顧客）。
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  try {
    const result = await computeMyshipExport(params.id);

    const header = ["＊商品名稱", "商品圖片(連結)", "＊商品描述(文字)", "＊規格", "＊數量", "＊價格", "優惠價", "＊商品狀態", "單次下單上限", "最低下單數量"];
    const aoa: (string | number)[][] = [header];

    result.groups.forEach((g) => {
      g.rows.forEach((r, i) => {
        aoa.push([
          i === 0 ? g.productName : "", // 商品名稱只填第一列
          "",
          i === 0 ? "紀錄" : "",
          r.account,
          1,
          r.amount,
          "",
          i === 0 ? "新品" : "",
          "",
          "",
        ]);
      });
    });

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "單規格商品匯入");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    const filename = encodeURIComponent(`賣貨便_${result.campaignName}.xlsx`);
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
        "X-Total-Customers": String(result.totalCustomers),
        "X-Over-Limit": encodeURIComponent(result.overLimit.join("、")),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "匯出失敗" }, { status: 500 });
  }
}

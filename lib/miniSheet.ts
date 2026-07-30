/**
 * 自製的簡易試算表公式引擎（不依賴 Handsontable / HyperFormula，避免商業授權問題）
 *
 * 支援：
 * - 基本四則運算 + - * /、括號
 * - 儲存格參照，如 A1、B12
 * - SUM(A1:A5) 範圍加總
 *
 * 不支援 Excel 完整函式庫，只做到「改一個欄位，其他引用它的欄位會自動重算」這個核心需求。
 */

export type SheetData = string[][]; // 每格是原始輸入文字，公式以 = 開頭

function colToIndex(col: string): number {
  let result = 0;
  for (let i = 0; i < col.length; i++) {
    result = result * 26 + (col.charCodeAt(i) - 64);
  }
  return result - 1;
}

function parseCellRef(ref: string): { row: number; col: number } | null {
  const m = ref.match(/^([A-Za-z]+)(\d+)$/);
  if (!m) return null;
  return { col: colToIndex(m[1].toUpperCase()), row: parseInt(m[2], 10) - 1 };
}

/** 評估單一儲存格的值，遞迴解析參照，並偵測循環參照 */
function evaluateCell(
  data: SheetData,
  row: number,
  col: number,
  cache: Map<string, number>,
  visiting: Set<string>
): number {
  const key = `${row},${col}`;
  if (cache.has(key)) return cache.get(key)!;
  if (visiting.has(key)) throw new Error(`循環參照：${key}`);
  visiting.add(key);

  const raw = data[row]?.[col] ?? "";
  let value: number;

  if (typeof raw === "string" && raw.startsWith("=")) {
    value = evaluateExpression(raw.slice(1), data, cache, visiting);
  } else {
    const num = parseFloat(raw);
    value = isFinite(num) ? num : 0;
  }

  visiting.delete(key);
  cache.set(key, value);
  return value;
}

function evaluateExpression(expr: string, data: SheetData, cache: Map<string, number>, visiting: Set<string>): number {
  // 先處理 SUM(A1:A5) 這種範圍函式
  expr = expr.replace(/SUM\(([A-Za-z]+\d+):([A-Za-z]+\d+)\)/gi, (_, startRef, endRef) => {
    const start = parseCellRef(startRef);
    const end = parseCellRef(endRef);
    if (!start || !end) return "0";
    let sum = 0;
    for (let r = Math.min(start.row, end.row); r <= Math.max(start.row, end.row); r++) {
      for (let c = Math.min(start.col, end.col); c <= Math.max(start.col, end.col); c++) {
        sum += evaluateCell(data, r, c, cache, visiting);
      }
    }
    return String(sum);
  });

  // 把個別儲存格參照換成數值
  expr = expr.replace(/([A-Za-z]+\d+)/g, (ref) => {
    const parsed = parseCellRef(ref);
    if (!parsed) return "0";
    return String(evaluateCell(data, parsed.row, parsed.col, cache, visiting));
  });

  // 只允許數字、運算子、括號、小數點、空白，避免任意程式碼注入
  if (!/^[\d\s+\-*/().]*$/.test(expr)) {
    throw new Error("公式包含不支援的字元");
  }
  if (expr.trim() === "") return 0;

  // eslint-disable-next-line no-new-func
  return Function(`"use strict"; return (${expr});`)();
}

/** 計算整張表，回傳每一格算出來的顯示值（公式格顯示計算結果，一般格顯示原始文字） */
export function computeSheet(data: SheetData): string[][] {
  const cache = new Map<string, number>();
  return data.map((row, r) =>
    row.map((cell, c) => {
      if (typeof cell === "string" && cell.startsWith("=")) {
        try {
          const value = evaluateCell(data, r, c, cache, new Set());
          return String(Math.round(value * 100) / 100);
        } catch (e: any) {
          return "#ERR";
        }
      }
      return cell ?? "";
    })
  );
}

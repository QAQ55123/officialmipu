/**
 * Supabase 分批讀取的小工具：
 * - Supabase（PostgREST）一次最多回傳 1000 筆，超過的會被默默截掉，所以一律逐頁讀完。
 * - .in() 帶太多 id 網址會太長，所以每批最多 200 個 id。
 * 逐頁讀要有固定排序，不然換頁時可能重複或漏掉，所以都加上 order("id")。
 */

const IN_BATCH = 200;
const PAGE = 1000;

/** 依 ids 分批 .in 查詢，並逐頁讀完 */
export async function selectIn(supabase: any, table: string, columns: string, column: string, ids: string[]): Promise<any[]> {
  const out: any[] = [];
  const list = Array.from(new Set(ids.filter(Boolean)));
  for (let i = 0; i < list.length; i += IN_BATCH) {
    const chunk = list.slice(i, i + IN_BATCH);
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from(table)
        .select(columns)
        .in(column, chunk)
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`${table}：${error.message}`);
      out.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }
  }
  return out;
}

/** 依單一條件 .eq 查詢，並逐頁讀完 */
export async function selectEq(supabase: any, table: string, columns: string, column: string, value: any): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .eq(column, value)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}：${error.message}`);
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

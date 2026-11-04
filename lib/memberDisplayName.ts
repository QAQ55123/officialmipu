import { escapeLike } from "@/lib/util";

/**
 * 會員名稱不能重複：不分大小寫，也不能跟「別人的帳號」一樣
 * （沒填會員名稱的人匯出賣貨便時會用帳號，兩者撞名的話規格名稱會一樣，分不出是誰）。
 * excludeMemberId：修改自己的名稱時要排除自己。
 * 回傳錯誤訊息；可以使用回傳 null。
 */
export async function displayNameTakenError(supabase: any, name: string, excludeMemberId?: string): Promise<string | null> {
  let q1 = supabase.from("members").select("id").ilike("display_name", escapeLike(name));
  if (excludeMemberId) q1 = q1.neq("id", excludeMemberId);
  const { data: sameName } = await q1.limit(1);
  if (sameName && sameName.length > 0) return "這個會員名稱已經有人使用";

  let q2 = supabase.from("members").select("id").ilike("username", escapeLike(name));
  if (excludeMemberId) q2 = q2.neq("id", excludeMemberId);
  const { data: sameUsername } = await q2.limit(1);
  if (sameUsername && sameUsername.length > 0) return "這個會員名稱跟其他會員的帳號相同，請換一個";

  return null;
}

/** 註冊新帳號時，帳號也不能跟別人的會員名稱一樣（反方向的撞名） */
export async function usernameClashesDisplayName(supabase: any, username: string): Promise<boolean> {
  const { data } = await supabase.from("members").select("id").ilike("display_name", escapeLike(username)).limit(1);
  return !!(data && data.length > 0);
}

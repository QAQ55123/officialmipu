import { google } from "googleapis";

function getAuth() {
  const email = (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "").trim();
  let key = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "").trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1);
  }
  key = key.replace(/\\n/g, "\n");
  if (!email || !key) throw new Error("尚未設定 GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY");
  if (!key.includes("BEGIN PRIVATE KEY")) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY 格式看起來不正確（貼到 Vercel 後台時不需要加前後的雙引號，只要貼金鑰本身）");
  }
  return new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });
}

function requireCalendarId(): string {
  const id = (process.env.GOOGLE_CALENDAR_ID || "").trim();
  if (!id) throw new Error("尚未設定 GOOGLE_CALENDAR_ID");
  return id;
}

async function getCalendar() {
  const auth = getAuth();
  await auth.authorize();
  return google.calendar({ version: "v3", auth });
}

/**
 * 建立或更新企劃截止時間的行事曆事件。
 * 有 existingEventId 就更新那筆事件，沒有的話新增一筆，回傳事件 ID（呼叫端要存回資料庫的 calendar_event_id）。
 */
export async function upsertPlanDeadlineEvent(params: {
  planId: string;
  planName: string;
  deadline: string; // ISO 字串
  existingEventId?: string | null;
}): Promise<string> {
  const calendar = await getCalendar();
  const calendarId = requireCalendarId();

  const start = new Date(params.deadline);
  const end = new Date(start.getTime() + 30 * 60 * 1000); // 30 分鐘的事件區塊

  const eventBody = {
    summary: `【企劃截止】${params.planName}`,
    description: `米舖企劃「${params.planName}」的截止時間，由系統自動同步，請勿手動修改內容（改企劃截止時間請到後台改）。`,
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
  };

  if (params.existingEventId) {
    try {
      const res = await calendar.events.update({ calendarId, eventId: params.existingEventId, requestBody: eventBody });
      return res.data.id || params.existingEventId;
    } catch (e: any) {
      // 事件可能已經被人手動刪除了，退回去新增一筆新的
      if (e?.code !== 404 && e?.response?.status !== 404) throw e;
    }
  }

  const res = await calendar.events.insert({ calendarId, requestBody: eventBody });
  if (!res.data.id) throw new Error("建立行事曆事件失敗，沒有回傳事件 ID");
  return res.data.id;
}

/** 刪除企劃截止時間的行事曆事件（企劃被刪除，或截止時間被清空時呼叫） */
export async function deletePlanDeadlineEvent(existingEventId: string): Promise<void> {
  const calendar = await getCalendar();
  const calendarId = requireCalendarId();
  try {
    await calendar.events.delete({ calendarId, eventId: existingEventId });
  } catch (e: any) {
    // 事件本來就不存在的話，當作成功即可
    if (e?.code !== 404 && e?.response?.status !== 404 && e?.code !== 410 && e?.response?.status !== 410) throw e;
  }
}

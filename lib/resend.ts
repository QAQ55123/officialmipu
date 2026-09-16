import nodemailer from "nodemailer";

let cachedTransporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) throw new Error("尚未設定 GMAIL_USER / GMAIL_APP_PASSWORD");

  cachedTransporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
  return cachedTransporter;
}

/** 寄信：html 是主要內容，text 是純文字版本（有助於降低被判定為垃圾郵件的機率） */
export async function sendEmail(to: string, subject: string, html: string, text?: string) {
  const transporter = getTransporter();
  const from = process.env.EMAIL_FROM || `米舖-官方周邊代購 <${process.env.GMAIL_USER}>`;
  await transporter.sendMail({ from, to, subject, html, text: text || stripHtml(html) });
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function verifyEmailContent(username: string, link: string): { html: string; text: string } {
  const html = `
    <div style="font-family:sans-serif;font-size:15px;color:#2C2C2A;">
      <p>親愛的「${username}」，你好：</p>
      <p>請點下面的連結完成信箱驗證：</p>
      <p><a href="${link}" style="color:#33415C;">點我驗證信箱</a></p>
      <p style="color:#8A8779;font-size:13px;">如果不是你本人操作，請忽略這封信。連結 24 小時內有效。</p>
      <p style="color:#8A8779;font-size:13px;">如果這封信剛好被歸類到垃圾郵件匣，請改標記為「不是垃圾郵件」，方便你以後能正常收到我們的通知。</p>
    </div>`;
  const text =
    `親愛的「${username}」，你好：\n\n` +
    `請點下面的連結完成信箱驗證：\n${link}\n\n` +
    `如果不是你本人操作，請忽略這封信。連結 24 小時內有效。\n\n` +
    `如果這封信剛好被歸類到垃圾郵件匣，請改標記為「不是垃圾郵件」，方便你以後能正常收到我們的通知。`;
  return { html, text };
}

export function resetPasswordContent(username: string, link: string): { html: string; text: string } {
  const html = `
    <div style="font-family:sans-serif;font-size:15px;color:#2C2C2A;">
      <p>親愛的「${username}」，你好：</p>
      <p>我們收到重設密碼的請求，請點下面的連結設定新密碼：</p>
      <p><a href="${link}" style="color:#33415C;">點我重設密碼</a></p>
      <p style="color:#8A8779;font-size:13px;">如果不是你本人操作，請忽略這封信，你的密碼不會被更改。連結 1 小時內有效。</p>
      <p style="color:#8A8779;font-size:13px;">如果這封信剛好被歸類到垃圾郵件匣，請改標記為「不是垃圾郵件」，方便你以後能正常收到我們的通知。</p>
    </div>`;
  const text =
    `親愛的「${username}」，你好：\n\n` +
    `我們收到重設密碼的請求，請點下面的連結設定新密碼：\n${link}\n\n` +
    `如果不是你本人操作，請忽略這封信，你的密碼不會被更改。連結 1 小時內有效。\n\n` +
    `如果這封信剛好被歸類到垃圾郵件匣，請改標記為「不是垃圾郵件」，方便你以後能正常收到我們的通知。`;
  return { html, text };
}

/**
 * 出貨通知信：貨到了，通知顧客去賣貨便下單付款。
 * 這個系統只負責統計誰訂了什麼、貨到了沒，真正的收款出貨是在賣貨便上做的，
 * 所以信裡不寫金額，只放品項清單跟賣場連結（網址本身不顯示，只有「賣場」兩個字是連結）。
 */
export function shipmentNoticeContent(
  campaignName: string,
  items: { name: string; style: string; qty: number; isGift: boolean }[],
  shopUrl: string
): { html: string; text: string } {
  const itemLines = items
    .map((it) => `${it.isGift ? "[滿贈] " : ""}${it.name}${it.style ? `（${it.style}）` : ""} x${it.qty}`)
    .join("\n");

  const itemHtml = items
    .map(
      (it) =>
        `<div style="padding:3px 0;">${it.isGift ? '<span style="display:inline-block;font-size:12px;color:#3C3489;background:#EEEDFE;padding:1px 8px;border-radius:999px;margin-right:6px;">滿贈</span>' : ""}${it.name}${it.style ? `（${it.style}）` : ""} x${it.qty}</div>`
    )
    .join("");

  const html = `
    <div style="font-family:sans-serif;font-size:15px;color:#2C2C2A;line-height:1.7;">
      <p>親愛的顧客您好：</p>
      <p>您在「${campaignName}」訂購的商品已經到貨、開放賣場囉！</p>
      <div style="margin:14px 0;padding:12px 16px;background:#F7F5EF;border-radius:8px;">${itemHtml}</div>
      <p>請前往<a href="${shopUrl}" style="color:#D85A30;">賣場</a>下單，謝謝。</p>
      <p>謝謝您的訂購！</p>
    </div>
  `;

  const text = `親愛的顧客您好：

您在「${campaignName}」訂購的商品已經到貨、開放賣場囉！

${itemLines}

請前往賣場下單，謝謝。
${shopUrl}

謝謝您的訂購！`;

  return { html, text };
}

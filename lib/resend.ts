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
  const from = process.env.EMAIL_FROM || `米舖 <${process.env.GMAIL_USER}>`;
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

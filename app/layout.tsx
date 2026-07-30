import "./globals.css";

export const metadata = {
  title: "檔期制訂購系統",
  description: "檔期制商品訂購系統",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}

import "./globals.css";

export const metadata = {
  title: "米舖訂購系統",
  description: "商品企劃訂購系統",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}

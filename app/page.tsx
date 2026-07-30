export default function Home() {
  return (
    <div style={{ maxWidth: 600, margin: "80px auto", textAlign: "center", padding: 16 }}>
      <h1>檔期制訂購系統</h1>
      <p style={{ color: "#9A9787" }}>瀏覽目前開放的訂購檔期</p>
      <a href="/campaigns" style={{ color: "#33415C", marginRight: 16 }}>
        前往檔期列表 →
      </a>
      <a href="/admin" style={{ color: "#33415C" }}>
        後台管理 →
      </a>
    </div>
  );
}

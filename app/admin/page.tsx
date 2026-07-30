import Link from "next/link";

export default function AdminHome() {
  return (
    <div className="admin-page">
      <h1>後台管理</h1>
      <p className="admin-sub">檔期制訂購系統管理主控台</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
        <Link href="/admin/campaigns" className="admin-form-card" style={{ textDecoration: "none", color: "inherit" }}>
          <h3 style={{ margin: "0 0 6px" }}>檔期管理</h3>
          <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>
            開放時間、8種交易組合匯率、滿贈基礎單位
          </p>
        </Link>
        <Link href="/admin/series" className="admin-form-card" style={{ textDecoration: "none", color: "inherit" }}>
          <h3 style={{ margin: "0 0 6px" }}>系列分類</h3>
          <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>
            商品系列，含特殊「贈品/滿贈」系列
          </p>
        </Link>
        <Link href="/admin/products" className="admin-form-card" style={{ textDecoration: "none", color: "inherit" }}>
          <h3 style={{ margin: "0 0 6px" }}>商品管理</h3>
          <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>
            新增/編輯商品與款式，支援 CSV 批次匯入
          </p>
        </Link>
        <Link href="/admin/announcements" className="admin-form-card" style={{ textDecoration: "none", color: "inherit" }}>
          <h3 style={{ margin: "0 0 6px" }}>公告管理</h3>
          <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>發布/刪除公告</p>
        </Link>
        <Link href="/admin/members" className="admin-form-card" style={{ textDecoration: "none", color: "inherit" }}>
          <h3 style={{ margin: "0 0 6px" }}>會員管理</h3>
          <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>搜尋與查看會員資料</p>
        </Link>
      </div>

      <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 24 }}>
        拆單工具、滿贈款式登記、訂單管理（到貨追蹤/出貨批次）請從「檔期管理」列表裡每個檔期各自的連結進入
      </p>
    </div>
  );
}

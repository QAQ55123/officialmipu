"use client";
import { useEffect, useState } from "react";
import AccountSection from "./_sections/AccountSection";
import SeriesSection from "./_sections/SeriesSection";
import CampaignsSection from "./_sections/CampaignsSection";
import ProductsSection from "./_sections/ProductsSection";
import GiftStylesSection from "./_sections/GiftStylesSection";
import OrdersSection from "./_sections/OrdersSection";
import MembersSection from "./_sections/MembersSection";
import InviteCodesSection from "./_sections/InviteCodesSection";
import AnnouncementsSection from "./_sections/AnnouncementsSection";

type Section = "account" | "series" | "campaigns" | "products" | "giftStyles" | "orders" | "members" | "codes" | "announcements";

export default function AdminPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginMsg, setLoginMsg] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [currentUsername, setCurrentUsername] = useState("");
  const [currentRole, setCurrentRole] = useState<"owner" | "staff" | "">("");
  const [currentEmail, setCurrentEmail] = useState("");
  const [currentEmailVerified, setCurrentEmailVerified] = useState(false);
  const [activeSection, setActiveSection] = useState<Section>("account");

  async function checkSession() {
    const res = await fetch("/api/admin/session");
    const data = await res.json();
    if (data.loggedIn) {
      setCurrentUsername(data.username);
      setCurrentRole(data.role);
      setCurrentEmail(data.email || "");
      setCurrentEmailVerified(!!data.emailVerified);
    }
    setCheckingSession(false);
  }
  useEffect(() => { checkSession(); }, []);

  async function doLogin() {
    setLoginMsg(""); setLoggingIn(true);
    try {
      const res = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "登入失敗");
      await checkSession();
    } catch (e: any) {
      setLoginMsg(e.message);
    } finally {
      setLoggingIn(false);
    }
  }

  async function doLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    setCurrentUsername(""); setCurrentRole("");
  }

  if (checkingSession) return <div style={{ padding: 40, textAlign: "center", color: "#8A8779" }}>載入中…</div>;

  if (!currentUsername) {
    return (
      <div style={{ maxWidth: 380, margin: "80px auto", padding: 20 }}>
        <h2>訂購系統 後台</h2>
        <div className="id-row">
          <span className="id-label">帳號</span>
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doLogin()} />
        </div>
        <div className="id-row">
          <span className="id-label">密碼</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doLogin()} />
        </div>
        <div style={{ color: "#dc2626", fontSize: 13, minHeight: 18, margin: "6px 0" }}>{loginMsg}</div>
        <button className="btn" onClick={doLogin} disabled={loggingIn}>{loggingIn ? "登入中…" : "登入"}</button>
        <p style={{ marginTop: 16, fontSize: 13 }}>
          還沒有帳號？<a href="/admin/register">用邀請碼建立管理者帳號</a>
        </p>
        <p style={{ marginTop: 6, fontSize: 13 }}>
          <a href="/admin/forgot-password">忘記密碼？</a>
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2>訂購系統 後台</h2>
        <div style={{ fontSize: 13, color: "#6B6858", display: "flex", alignItems: "center", gap: 10 }}>
          <span>已登入：{currentUsername}（{currentRole === "owner" ? "最高權限" : "一般管理者"}）</span>
          <button className="btn secondary small" onClick={doLogout}>登出</button>
        </div>
      </div>
      <p style={{ color: "#8A8779", fontSize: 13, marginBottom: 16 }}>登入超過 8 小時會自動要求重新登入。</p>

      <div className="mibu-content-row" style={{ alignItems: "flex-start" }}>
        <aside className="category-sidebar-desktop account-sidebar-active" style={{ position: "static" }}>
          <p className="category-tree-title">後台功能</p>
          <div className={`account-nav-item ${activeSection === "account" ? "active" : ""}`} onClick={() => setActiveSection("account")}>帳號設定</div>
          <div className={`account-nav-item ${activeSection === "series" ? "active" : ""}`} onClick={() => setActiveSection("series")}>系列管理</div>
          <div className={`account-nav-item ${activeSection === "campaigns" ? "active" : ""}`} onClick={() => setActiveSection("campaigns")}>檔期管理</div>
          <div className={`account-nav-item ${activeSection === "products" ? "active" : ""}`} onClick={() => setActiveSection("products")}>商品管理</div>
          <div className={`account-nav-item ${activeSection === "giftStyles" ? "active" : ""}`} onClick={() => setActiveSection("giftStyles")}>滿贈款式管理</div>
          {currentRole === "owner" && (
            <>
              <div className={`account-nav-item ${activeSection === "orders" ? "active" : ""}`} onClick={() => setActiveSection("orders")}>訂單管理</div>
              <div className={`account-nav-item ${activeSection === "members" ? "active" : ""}`} onClick={() => setActiveSection("members")}>會員管理</div>
              <div className={`account-nav-item ${activeSection === "codes" ? "active" : ""}`} onClick={() => setActiveSection("codes")}>邀請碼管理</div>
              <div className={`account-nav-item ${activeSection === "announcements" ? "active" : ""}`} onClick={() => setActiveSection("announcements")}>公告管理</div>
            </>
          )}
        </aside>

        <main style={{ flex: 1, minWidth: 0 }}>
          {activeSection === "account" && (
            <AccountSection username={currentUsername} role={currentRole as "owner" | "staff"} email={currentEmail} emailVerified={currentEmailVerified} onLogout={doLogout} />
          )}
          {activeSection === "series" && <SeriesSection />}
          {activeSection === "campaigns" && <CampaignsSection />}
          {activeSection === "products" && <ProductsSection />}
          {activeSection === "giftStyles" && <GiftStylesSection />}
          {activeSection === "orders" && currentRole === "owner" && <OrdersSection />}
          {activeSection === "members" && currentRole === "owner" && <MembersSection />}
          {activeSection === "codes" && currentRole === "owner" && <InviteCodesSection />}
          {activeSection === "announcements" && currentRole === "owner" && <AnnouncementsSection />}
        </main>
      </div>
    </div>
  );
}

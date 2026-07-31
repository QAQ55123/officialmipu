"use client";

import { useEffect, useState } from "react";
import AccountSection from "./_sections/AccountSection";
import SeriesSection from "./_sections/SeriesSection";
import CampaignsSection from "./_sections/CampaignsSection";
import ProductsSection from "./_sections/ProductsSection";
import OrdersSection from "./_sections/OrdersSection";
import MembersSection from "./_sections/MembersSection";
import InviteCodesSection from "./_sections/InviteCodesSection";
import AnnouncementsSection from "./_sections/AnnouncementsSection";
import SiteSettingsSection from "./_sections/SiteSettingsSection";
import DangerZoneSection from "./_sections/DangerZoneSection";

type Session = {
  loggedIn: boolean;
  username?: string;
  role?: "owner" | "staff";
  email?: string;
  emailVerified?: boolean;
};

const NAV_ITEMS = [
  { key: "account", label: "帳號設定", ownerOnly: false },
  { key: "series", label: "系列管理", ownerOnly: false },
  { key: "campaigns", label: "檔期管理", ownerOnly: false },
  { key: "products", label: "商品管理", ownerOnly: false },
  { key: "orders", label: "訂單管理", ownerOnly: false },
  { key: "members", label: "會員管理", ownerOnly: true },
  { key: "inviteCodes", label: "邀請碼管理", ownerOnly: true },
  { key: "announcements", label: "公告管理", ownerOnly: false },
  { key: "siteSettings", label: "網站設定", ownerOnly: true },
  { key: "dangerZone", label: "危險區", ownerOnly: true },
];

function LoginForm({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "登入失敗");
      onLoggedIn();
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 360, margin: "80px auto", padding: 20 }}>
      <h2>後台登入</h2>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="admin-form-row">
          <label>帳號</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} required />
        </div>
        <div className="admin-form-row">
          <label>密碼</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <div style={{ color: "var(--danger)", fontSize: 13, minHeight: 18 }}>{msg}</div>
        <button className="btn" type="submit" disabled={submitting}>
          {submitting ? "登入中…" : "登入"}
        </button>
      </form>
      <p style={{ marginTop: 16, fontSize: 13, display: "flex", gap: 16 }}>
        <a href="/admin/register">用邀請碼註冊</a>
        <a href="/admin/forgot-password">忘記密碼</a>
      </p>
    </div>
  );
}

export default function AdminDashboard() {
  const [session, setSession] = useState<Session | null>(null);
  const [activeTab, setActiveTab] = useState("account");

  async function loadSession() {
    const res = await fetch("/api/admin/session");
    const data = await res.json();
    setSession(data);
  }

  useEffect(() => {
    loadSession();
  }, []);

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    setSession({ loggedIn: false });
  }

  if (session === null) {
    return <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>載入中…</div>;
  }

  if (!session.loggedIn) {
    return <LoginForm onLoggedIn={loadSession} />;
  }

  const isOwner = session.role === "owner";
  const visibleItems = NAV_ITEMS.filter((item) => !item.ownerOnly || isOwner);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "20px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>後台管理</h2>
        <div style={{ fontSize: 13, color: "var(--muted)", display: "flex", alignItems: "center", gap: 10 }}>
          <span>
            已登入：{session.username}（{isOwner ? "最高權限" : "一般管理者"}）
          </span>
        </div>
      </div>

      <div style={{ display: "flex", marginTop: 20, gap: 20 }}>
        <aside style={{ flex: "0 0 170px", borderRight: "1px solid var(--line)", paddingRight: 12 }}>
          <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 8px" }}>後台功能</p>
          {visibleItems.map((item) => (
            <div
              key={item.key}
              onClick={() => setActiveTab(item.key)}
              style={{
                padding: "9px 8px",
                borderRadius: 8,
                fontSize: 14.5,
                fontWeight: activeTab === item.key ? 600 : 500,
                color: activeTab === item.key ? "var(--primary)" : "inherit",
                cursor: "pointer",
              }}
            >
              {item.label}
            </div>
          ))}
        </aside>

        <main style={{ flex: 1, minWidth: 0 }}>
          {activeTab === "account" && (
            <AccountSection
              username={session.username!}
              role={session.role!}
              email={session.email || ""}
              emailVerified={!!session.emailVerified}
              onLogout={handleLogout}
            />
          )}
          {activeTab === "series" && <SeriesSection />}
          {activeTab === "campaigns" && <CampaignsSection isOwner={isOwner} />}
          {activeTab === "products" && <ProductsSection />}
          {activeTab === "orders" && <OrdersSection isOwner={isOwner} />}
          {activeTab === "members" && isOwner && <MembersSection />}
          {activeTab === "inviteCodes" && isOwner && <InviteCodesSection />}
          {activeTab === "announcements" && <AnnouncementsSection />}
          {activeTab === "siteSettings" && isOwner && <SiteSettingsSection />}
          {activeTab === "dangerZone" && isOwner && <DangerZoneSection />}
        </main>
      </div>
    </div>
  );
}

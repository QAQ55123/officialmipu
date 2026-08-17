"use client";
import { useEffect, useState } from "react";

/**
 * 右下角「回到頂部」的半透明圓球。
 * 頁面捲到一定距離才出現（在最上方時本來就不需要，一直顯示只會擋畫面）。
 * 放在 app/layout.tsx，所以前台、後台、拆單頁面都會有。
 */
export default function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 300);
    onScroll(); // 進頁面時先判斷一次（例如從別頁帶著捲動位置回來）
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="回到頁面最上方"
      style={{
        position: "fixed",
        right: 20,
        bottom: 24,
        width: 48,
        height: 48,
        borderRadius: "50%",
        border: "1px solid rgba(44,44,42,.12)",
        background: "rgba(255,255,255,.72)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        color: "#2C2C2A",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: ".05em",
        cursor: "pointer",
        boxShadow: "0 2px 10px rgba(44,44,42,.12)",
        zIndex: 999,
      }}
    >
      TOP
    </button>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { computeSheet, SheetData } from "@/lib/miniSheet";

const COLS = 10;
const ROWS = 30;

function colLetter(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function emptyGrid(): SheetData {
  return Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => ""));
}

export default function CostSheetPage() {
  const params = useParams();
  const campaignId = params.id as string;

  const [grid, setGrid] = useState<SheetData>(emptyGrid());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/admin/campaigns/${campaignId}/cost-sheet`);
    const data = await res.json();
    if (data.data && data.data.length > 0) {
      const loaded = data.data as SheetData;
      const padded = emptyGrid();
      for (let r = 0; r < loaded.length && r < ROWS; r++) {
        for (let c = 0; c < loaded[r].length && c < COLS; c++) {
          padded[r][c] = loaded[r][c];
        }
      }
      setGrid(padded);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [campaignId]);

  async function save(next: SheetData) {
    setSaving(true);
    await fetch(`/api/admin/campaigns/${campaignId}/cost-sheet`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: next }),
    });
    setSaving(false);
  }

  async function handleInit() {
    if (!confirm("這會用目前檔期的訂單資料重新產生初始表格，覆蓋現有內容，確定嗎？")) return;
    setLoading(true);
    const res = await fetch(`/api/admin/campaigns/${campaignId}/cost-sheet/init`, { method: "POST" });
    const data = await res.json();
    const loaded = data.data as SheetData;
    const padded = emptyGrid();
    for (let r = 0; r < loaded.length && r < ROWS; r++) {
      for (let c = 0; c < loaded[r].length && c < COLS; c++) {
        padded[r][c] = loaded[r][c];
      }
    }
    setGrid(padded);
    setLoading(false);
  }

  function handleCellChange(row: number, col: number, value: string) {
    const next = grid.map((r) => [...r]);
    next[row][col] = value;
    setGrid(next);
  }

  function handleCellBlur() {
    setEditingCell(null);
    save(grid);
  }

  const displayGrid = computeSheet(grid);

  if (loading) return <div className="admin-page">載入中…</div>;

  return (
    <div className="admin-page" style={{ maxWidth: 1100 }}>
      <nav className="admin-nav">
        <Link href="/admin">← 後台首頁</Link>
      </nav>
      <h1>成本SHEET</h1>
      <p className="admin-sub">
        欄位可填公式（如 <code>=D2*E2*F2</code>），改一個欄位，其他有引用到它的欄位會自動重新計算，
        跟 Excel/Google Sheets 一樣的體驗。{saving && <span style={{ color: "var(--muted)" }}>（儲存中…）</span>}
      </p>

      <div className="admin-toolbar">
        <button className="btn" onClick={handleInit}>
          用目前訂單資料重新產生初始表格
        </button>
      </div>

      <div style={{ overflowX: "auto", border: "1px solid #E5E1D3", borderRadius: 8 }}>
        <table style={{ borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ width: 30, background: "#F0EEE4", border: "1px solid #E5E1D3" }}></th>
              {Array.from({ length: COLS }).map((_, c) => (
                <th key={c} style={{ minWidth: 100, background: "#F0EEE4", border: "1px solid #E5E1D3", padding: 4 }}>
                  {colLetter(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map((row, r) => (
              <tr key={r}>
                <td style={{ background: "#F0EEE4", border: "1px solid #E5E1D3", textAlign: "center", color: "var(--muted)" }}>
                  {r + 1}
                </td>
                {row.map((cell, c) => {
                  const isEditing = editingCell?.row === r && editingCell?.col === c;
                  return (
                    <td key={c} style={{ border: "1px solid #E5E1D3", padding: 0 }}>
                      <input
                        value={isEditing ? cell : displayGrid[r][c]}
                        onFocus={() => setEditingCell({ row: r, col: c })}
                        onChange={(e) => handleCellChange(r, c, e.target.value)}
                        onBlur={handleCellBlur}
                        style={{
                          width: "100%",
                          border: "none",
                          padding: "4px 6px",
                          fontSize: 13,
                          background: displayGrid[r][c] === "#ERR" ? "#FDE8E8" : "transparent",
                        }}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

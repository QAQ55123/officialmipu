"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export type CartItem = {
  productVariantId: string;
  productName: string;
  styleName: string | null;
  unitAmount: number;
  qty: number;
};

type CartState = {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "qty">, qty: number) => void;
  updateQty: (productVariantId: string, qty: number) => void;
  removeItem: (productVariantId: string) => void;
  clear: () => void;
};

const CartContext = createContext<CartState | null>(null);

function storageKey(campaignId: string) {
  return `cart:${campaignId}`;
}

export function CartProvider({ campaignId, children }: { campaignId: string; children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    localStorage.setItem("activeCampaignId", campaignId);
    const raw = localStorage.getItem(storageKey(campaignId));
    if (raw) {
      try {
        setItems(JSON.parse(raw));
      } catch {
        setItems([]);
      }
    }
  }, [campaignId]);

  function persist(next: CartItem[]) {
    setItems(next);
    localStorage.setItem(storageKey(campaignId), JSON.stringify(next));
  }

  function addItem(item: Omit<CartItem, "qty">, qty: number) {
    const existing = items.find((i) => i.productVariantId === item.productVariantId);
    if (existing) {
      persist(
        items.map((i) =>
          i.productVariantId === item.productVariantId ? { ...i, qty: i.qty + qty } : i
        )
      );
    } else {
      persist([...items, { ...item, qty }]);
    }
  }

  function updateQty(productVariantId: string, qty: number) {
    if (qty <= 0) {
      removeItem(productVariantId);
      return;
    }
    persist(items.map((i) => (i.productVariantId === productVariantId ? { ...i, qty } : i)));
  }

  function removeItem(productVariantId: string) {
    persist(items.filter((i) => i.productVariantId !== productVariantId));
  }

  function clear() {
    persist([]);
  }

  return (
    <CartContext.Provider value={{ items, addItem, updateQty, removeItem, clear }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart 必須在 CartProvider 底下使用");
  return ctx;
}

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Product } from "@workspace/api-client-react";

export interface CartItem {
  product: Product;
  quantity: number;
  slotId?: number;
  date?: string;
  startTime?: string;
  // For subscription products: chosen plan
  planId?: number;
  planName?: string;
  planPrice?: number;
  planDurationDays?: number;
}

interface CartContextType {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (productId: number, planId?: number) => void;
  updateQuantity: (productId: number, quantity: number, planId?: number) => void;
  clearCart: () => void;
  total: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem("cart");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem("cart", JSON.stringify(items));
  }, [items]);

  const addItem = (newItem: CartItem) => {
    setItems((current) => {
      const existing = current.find(
        (item) => item.product.id === newItem.product.id && item.slotId === newItem.slotId && item.planId === newItem.planId
      );
      if (existing) {
        return current.map((item) =>
          item === existing
            ? { ...item, quantity: item.quantity + newItem.quantity }
            : item
        );
      }
      return [...current, newItem];
    });
  };

  // Cart-line key (productId + planId) — subscription items with different plans coexist.
  const lineKey = (productId: number, planId?: number) => `${productId}:${planId ?? "none"}`;

  const removeItem = (productId: number, planId?: number) => {
    setItems((current) => current.filter((item) => lineKey(item.product.id, item.planId) !== lineKey(productId, planId)));
  };

  const updateQuantity = (productId: number, quantity: number, planId?: number) => {
    if (quantity <= 0) {
      removeItem(productId, planId);
      return;
    }
    setItems((current) =>
      current.map((item) =>
        lineKey(item.product.id, item.planId) === lineKey(productId, planId) ? { ...item, quantity } : item
      )
    );
  };

  const clearCart = () => setItems([]);

  const total = items.reduce(
    (sum, item) => sum + (item.planPrice ?? item.product.price) * item.quantity,
    0
  );

  return (
    <CartContext.Provider
      value={{ items, addItem, removeItem, updateQuantity, clearCart, total }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}

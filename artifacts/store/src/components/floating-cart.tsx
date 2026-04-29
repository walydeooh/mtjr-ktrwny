import { Link } from "wouter";
import { ShoppingCart } from "lucide-react";
import { useCart } from "@/hooks/use-cart";

export function FloatingCart() {
  const { items } = useCart();
  const count = items.reduce((sum, it) => sum + it.quantity, 0);
  const total = items.reduce((sum, it) => sum + (it.product.price * it.quantity), 0);
  if (count === 0) return null;

  return (
    <Link href="/cart">
      <div className="fixed bottom-5 left-5 z-40 flex items-center gap-3 rounded-full bg-primary text-primary-foreground shadow-2xl shadow-primary/30 px-5 py-3 hover:scale-105 transition-transform cursor-pointer animate-in slide-in-from-bottom-5">
        <div className="relative">
          <ShoppingCart className="h-5 w-5" />
          <span className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-white text-primary text-xs flex items-center justify-center font-bold border border-primary/20">
            {count}
          </span>
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-xs opacity-90">السلة</span>
          <span className="font-bold text-sm">{total.toLocaleString("ar-SA")} ر.س</span>
        </div>
      </div>
    </Link>
  );
}

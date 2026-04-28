import { Link, useLocation } from "wouter";
import { ReactNode } from "react";
import { useCart } from "@/hooks/use-cart";
import { ShoppingCart, Store, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function StoreLayout({ children }: { children: ReactNode }) {
  const { items } = useCart();
  const [location, setLocation] = useLocation();

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const q = formData.get("q");
    if (q) {
      setLocation(`/?q=${encodeURIComponent(q as string)}`);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="sticky top-0 z-50 w-full border-b bg-white shadow-sm">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl text-primary shrink-0">
            <Store className="h-6 w-6" />
            <span>متجري</span>
          </Link>

          <form onSubmit={handleSearch} className="flex-1 max-w-xl hidden md:flex relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              name="q" 
              placeholder="ابحث عن المنتجات..." 
              className="w-full pr-10 bg-gray-50 border-transparent focus-visible:ring-1 focus-visible:bg-white"
            />
          </form>

          <div className="flex items-center gap-4 shrink-0">
            <Button variant="ghost" size="icon" asChild className="relative">
              <Link href="/cart">
                <ShoppingCart className="h-5 w-5" />
                <span className="sr-only">السلة</span>
                {items.length > 0 && (
                  <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium">
                    {items.length}
                  </span>
                )}
              </Link>
            </Button>
          </div>
        </div>
      </header>
      <main className="flex-1 container mx-auto px-4 py-8">
        {children}
      </main>
      <footer className="bg-white border-t py-8">
        <div className="container mx-auto px-4 text-center text-muted-foreground text-sm">
          <p>© {new Date().getFullYear()} متجري. جميع الحقوق محفوظة.</p>
        </div>
      </footer>
    </div>
  );
}

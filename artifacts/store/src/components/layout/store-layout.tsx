import { Link, useLocation } from "wouter";
import { ReactNode, useEffect, useState } from "react";
import { useCart } from "@/hooks/use-cart";
import { useCustomerAuth } from "@/hooks/use-customer-auth";
import { ShoppingCart, Store, Search, User, Package, LogOut, Phone, Mail, MapPin, Instagram, Twitter, Share2 } from "lucide-react";
import { FloatingCart } from "@/components/floating-cart";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type StoreInfo = {
  storeName: string;
  storeLogoUrl: string | null;
  themePrimaryColor: string;
  themeSecondaryColor: string;
  contactPhone: string | null;
  contactEmail: string | null;
  contactAddress: string | null;
  socialInstagram: string | null;
  socialTwitter: string | null;
  socialTiktok: string | null;
  socialSnapchat: string | null;
  floatingCartEnabled?: boolean;
  affiliateEnabled?: boolean;
};

function hexToHsl(hex: string): string {
  const m = hex.replace("#", "").match(/.{2}/g);
  if (!m) return "200 90% 50%";
  const [r, g, b] = m.map((x) => parseInt(x, 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
      case g: h = ((b - r) / d + 2); break;
      case b: h = ((r - g) / d + 4); break;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export function StoreLayout({ children }: { children: ReactNode }) {
  const { items } = useCart();
  const { customer, isAuthenticated, logout } = useCustomerAuth();
  const [, setLocation] = useLocation();
  const [info, setInfo] = useState<StoreInfo | null>(null);

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then(setInfo).catch(() => {});
  }, []);

  // Capture affiliate referral code (?ref=) and persist in localStorage
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const ref = url.searchParams.get("ref");
      if (ref) {
        localStorage.setItem("affiliate_code", ref.toUpperCase());
      }
    } catch {}
  }, []);

  // Apply theme colors via CSS variables
  useEffect(() => {
    if (!info) return;
    const root = document.documentElement;
    root.style.setProperty("--primary", hexToHsl(info.themePrimaryColor));
    root.style.setProperty("--secondary", hexToHsl(info.themeSecondaryColor));
  }, [info]);

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const q = formData.get("q");
    if (q) setLocation(`/?q=${encodeURIComponent(q as string)}`);
  };

  const storeName = info?.storeName || "متجري";

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="sticky top-0 z-50 w-full border-b bg-white shadow-sm">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl text-primary shrink-0">
            {info?.storeLogoUrl ? <img src={info.storeLogoUrl} alt={storeName} className="h-8 w-8 object-contain" /> : <Store className="h-6 w-6" />}
            <span>{storeName}</span>
          </Link>

          <form onSubmit={handleSearch} className="flex-1 max-w-xl hidden md:flex relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input name="q" placeholder="ابحث عن المنتجات..." className="w-full pr-10 bg-gray-50 border-transparent focus-visible:ring-1 focus-visible:bg-white" />
          </form>

          <div className="flex items-center gap-2 shrink-0">
            {isAuthenticated ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2">
                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
                      {customer?.name.charAt(0)}
                    </div>
                    <span className="hidden sm:inline max-w-[100px] truncate">{customer?.name}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <div className="flex flex-col">
                      <span className="font-bold">{customer?.name}</span>
                      <span className="text-xs text-muted-foreground" dir="ltr">{customer?.phone}</span>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setLocation("/my-orders")}>
                    <Package className="w-4 h-4 ml-2" /> طلباتي
                  </DropdownMenuItem>
                  {info?.affiliateEnabled !== false && (
                    <DropdownMenuItem onClick={() => setLocation("/affiliate")}>
                      <Share2 className="w-4 h-4 ml-2" /> برنامج المسوّقين
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => { logout(); setLocation("/"); }} className="text-red-600 focus:text-red-600">
                    <LogOut className="w-4 h-4 ml-2" /> تسجيل الخروج
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button variant="ghost" size="sm" asChild>
                <Link href="/login"><User className="h-4 w-4 ml-1" /> دخول</Link>
              </Button>
            )}
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
      <main className="flex-1 container mx-auto px-4 py-8">{children}</main>
      {info?.floatingCartEnabled !== false && <FloatingCart />}

      <footer className="bg-white border-t mt-12">
        <div className="container mx-auto px-4 py-10 grid md:grid-cols-3 gap-8">
          <div>
            <div className="flex items-center gap-2 font-bold text-xl text-primary mb-3">
              {info?.storeLogoUrl ? <img src={info.storeLogoUrl} alt={storeName} className="h-8 w-8 object-contain" /> : <Store className="h-6 w-6" />}
              <span>{storeName}</span>
            </div>
            <p className="text-sm text-muted-foreground">شكراً لاختيارك متجرنا. نحن نسعى دائماً لتقديم أفضل تجربة تسوق.</p>
          </div>
          <div>
            <h3 className="font-semibold mb-3">تواصل معنا</h3>
            <ul className="space-y-2 text-sm">
              {info?.contactPhone && <li className="flex items-center gap-2 text-muted-foreground"><Phone className="h-4 w-4" /><span dir="ltr">{info.contactPhone}</span></li>}
              {info?.contactEmail && <li className="flex items-center gap-2 text-muted-foreground"><Mail className="h-4 w-4" /><a href={`mailto:${info.contactEmail}`} className="hover:text-primary">{info.contactEmail}</a></li>}
              {info?.contactAddress && <li className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-4 w-4" />{info.contactAddress}</li>}
            </ul>
          </div>
          <div>
            <h3 className="font-semibold mb-3">تابعنا</h3>
            <div className="flex gap-3">
              {info?.socialInstagram && <a href={`https://instagram.com/${info.socialInstagram.replace("@", "")}`} target="_blank" rel="noreferrer" className="w-9 h-9 rounded-full bg-muted flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition" aria-label="Instagram"><Instagram className="h-4 w-4" /></a>}
              {info?.socialTwitter && <a href={`https://x.com/${info.socialTwitter.replace("@", "")}`} target="_blank" rel="noreferrer" className="w-9 h-9 rounded-full bg-muted flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition" aria-label="X"><Twitter className="h-4 w-4" /></a>}
              {info?.socialTiktok && <a href={`https://tiktok.com/@${info.socialTiktok.replace("@", "")}`} target="_blank" rel="noreferrer" className="w-9 h-9 rounded-full bg-muted flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition text-xs font-bold" aria-label="TikTok">TT</a>}
              {info?.socialSnapchat && <a href={`https://snapchat.com/add/${info.socialSnapchat}`} target="_blank" rel="noreferrer" className="w-9 h-9 rounded-full bg-muted flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition text-xs font-bold" aria-label="Snapchat">SC</a>}
            </div>
          </div>
        </div>
        <div className="border-t py-4 text-center text-muted-foreground text-sm">
          <p>© {new Date().getFullYear()} {storeName}. جميع الحقوق محفوظة.</p>
        </div>
      </footer>
    </div>
  );
}

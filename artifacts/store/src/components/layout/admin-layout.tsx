import { Link, useLocation } from "wouter";
import { ReactNode, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLogout } from "@workspace/api-client-react";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Users,
  CalendarDays,
  MessageSquare,
  Settings,
  LogOut,
  Store,
  Menu,
  Ticket,
  Megaphone,
  Share2,
  UserCog,
  Palette,
  Tag,
  Image as ImageIcon,
  Banknote,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const navItems = [
  { href: "/admin", label: "الرئيسية", icon: LayoutDashboard },
  { href: "/admin/assistant", label: "المساعد الذكي", icon: Sparkles },
  { href: "/admin/orders", label: "الطلبات", icon: ShoppingCart },
  { href: "/admin/products", label: "المنتجات", icon: Package },
  { href: "/admin/customers", label: "العملاء", icon: Users },
  { href: "/admin/bookings", label: "الحجوزات", icon: CalendarDays },
  { href: "/admin/coupons", label: "الكوبونات", icon: Ticket },
  { href: "/admin/affiliates", label: "المسوّقون", icon: Share2 },
  { href: "/admin/campaigns", label: "الحملات التسويقية", icon: Megaphone },
  { href: "/admin/whatsapp", label: "واتساب الذكي", icon: MessageSquare },
  { href: "/admin/employees", label: "الموظفون", icon: UserCog },
  { href: "/admin/design", label: "تصميم المتجر", icon: Palette },
  { href: "/admin/banners", label: "البانرات", icon: ImageIcon },
  { href: "/admin/categories", label: "التصنيفات", icon: Tag },
  { href: "/admin/bank-accounts", label: "الحسابات البنكية", icon: Banknote },
  { href: "/admin/settings", label: "الإعدادات", icon: Settings },
];

export function AdminLayout({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const [location, setLocation] = useLocation();
  const logoutMutation = useLogout();

  useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/admin-login");
    }
  }, [isLoading, user, setLocation]);

  if (isLoading) return <div className="min-h-screen flex items-center justify-center">جاري التحميل...</div>;

  if (!user) return null;

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        localStorage.removeItem("token");
        setLocation("/admin-login");
      },
    });
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-sidebar text-sidebar-foreground">
      <div className="p-6">
        <Link href="/admin" className="flex items-center gap-3 font-bold text-2xl text-sidebar-primary">
          <Store className="h-8 w-8" />
          <span>متجري</span>
        </Link>
      </div>
      
      <nav className="flex-1 px-4 space-y-1">
        {navItems.map((item) => {
          const isActive = location === item.href || (location.startsWith(item.href) && item.href !== "/admin");
          return (
            <Link key={item.href} href={item.href}>
              <div className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors cursor-pointer ${
                isActive 
                  ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium" 
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}>
                <item.icon className="h-5 w-5" />
                {item.label}
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-sidebar-border">
        <div className="mb-4 px-3 py-2">
          <p className="text-sm font-medium">{user.username}</p>
          <p className="text-xs text-sidebar-foreground/60">مدير المتجر</p>
        </div>
        <Button 
          variant="ghost" 
          className="w-full justify-start text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={handleLogout}
        >
          <LogOut className="h-5 w-5 ml-3" />
          تسجيل الخروج
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-muted/30">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 flex-col fixed inset-y-0 z-50 shadow-xl">
        <SidebarContent />
      </aside>

      {/* Mobile Header & Sidebar */}
      <header className="md:hidden fixed top-0 w-full z-40 bg-sidebar text-sidebar-foreground border-b border-sidebar-border px-4 h-16 flex items-center justify-between shadow-sm">
        <Link href="/admin" className="flex items-center gap-2 font-bold text-xl text-sidebar-primary">
          <Store className="h-6 w-6" />
          <span>متجري</span>
        </Link>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="text-sidebar-foreground hover:bg-sidebar-accent">
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="p-0 bg-sidebar border-none w-72" dir="rtl">
            <SidebarContent />
          </SheetContent>
        </Sheet>
      </header>

      {/* Main Content */}
      <main className="flex-1 md:mr-64 pt-16 md:pt-0">
        <div className="p-6 md:p-8 max-w-6xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}

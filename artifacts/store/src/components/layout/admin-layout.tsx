import { Link, useLocation } from "wouter";
import { ReactNode, useEffect, useState } from "react";
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
  X,
  Ticket,
  Megaphone,
  Share2,
  UserCog,
  Palette,
  Tag,
  Image as ImageIcon,
  Banknote,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";

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
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/admin-login");
    }
  }, [isLoading, user, setLocation]);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [location]);

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
    <div className="flex flex-col h-full bg-sidebar text-sidebar-foreground" dir="rtl">
      {/* Header */}
      <div className="p-5 flex items-center justify-between border-b border-sidebar-border">
        <Link href="/admin" className="flex items-center gap-3 font-bold text-xl text-sidebar-primary">
          <Store className="h-7 w-7" />
          <span>متجري</span>
        </Link>
        <button
          onClick={() => setSidebarOpen(false)}
          className="p-1.5 rounded-lg text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
        {navItems.map((item) => {
          const isActive = location === item.href || (location.startsWith(item.href) && item.href !== "/admin");
          return (
            <Link key={item.href} href={item.href}>
              <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors cursor-pointer text-sm ${
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground font-semibold"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}>
                <item.icon className="h-4.5 w-4.5 shrink-0" />
                {item.label}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-sidebar-border space-y-2">
        <div className="px-3 py-1">
          <p className="text-sm font-semibold">{user.username}</p>
          <p className="text-xs text-sidebar-foreground/50">مدير المتجر</p>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start text-destructive hover:bg-destructive/10 hover:text-destructive text-sm"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4 ml-2" />
          تسجيل الخروج
        </Button>
      </div>
    </div>
  );

  const isDesign = location.startsWith("/admin/design");

  return (
    <div className="min-h-screen bg-muted/30" dir="rtl">
      {/* Top Header Bar */}
      <header className="fixed top-0 right-0 left-0 z-40 h-14 bg-sidebar text-sidebar-foreground border-b border-sidebar-border flex items-center justify-between px-4 shadow-sm">
        {/* Menu toggle button */}
        <button
          onClick={() => setSidebarOpen(prev => !prev)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors text-sm font-medium"
        >
          <Menu className="h-5 w-5" />
          <span className="hidden sm:inline">القائمة</span>
        </button>

        {/* Brand */}
        <Link href="/admin" className="flex items-center gap-2 font-bold text-lg text-sidebar-primary">
          <Store className="h-6 w-6" />
          <span>متجري</span>
        </Link>

        {/* Current page label */}
        <div className="hidden md:flex items-center gap-2 text-sm text-sidebar-foreground/60">
          {navItems.find(n => location === n.href || (location.startsWith(n.href) && n.href !== "/admin"))?.label}
        </div>
      </header>

      {/* Sidebar Overlay (backdrop) */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar Drawer — slides in from the right */}
      <aside
        className={`fixed top-0 right-0 h-full w-64 z-50 shadow-2xl transform transition-transform duration-300 ease-in-out ${
          sidebarOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <SidebarContent />
      </aside>

      {/* Main Content */}
      <main className="pt-14">
        {isDesign ? (
          <div className="p-4 md:p-6 h-[calc(100vh-56px)] overflow-hidden">
            {children}
          </div>
        ) : (
          <div className="p-6 md:p-8 max-w-6xl mx-auto">
            {children}
          </div>
        )}
      </main>
    </div>
  );
}

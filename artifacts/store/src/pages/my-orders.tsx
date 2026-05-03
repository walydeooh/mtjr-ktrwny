import { Link, useLocation } from "wouter";
import { useEffect } from "react";
import { useListMyOrders, getListMyOrdersQueryKey } from "@workspace/api-client-react";
import { useCustomerAuth } from "@/hooks/use-customer-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { arSA } from "date-fns/locale";
import { Package, ChevronLeft, LogOut, Key, Copy, ExternalLink, BookOpen, Repeat, Clock, CheckCircle2, XCircle, CreditCard } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect as useEffectLocal } from "react";

type CustomerSub = {
  id: number;
  productId: number;
  productName: string;
  planId: number | null;
  planName: string;
  durationDays: number;
  orderId: number;
  startedAt: string;
  expiresAt: string;
  status: string;
  remainingDays: number;
  isActive: boolean;
};

function PayNowButton({ orderId, paymentLink }: { orderId: number; paymentLink: string | null | undefined }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (paymentLink) { window.location.href = paymentLink; return; }
    setLoading(true);
    try {
      const r = await fetch(`/api/orders/${orderId}/payment`, { method: "POST" });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error || "تعذّر إنشاء رابط الدفع");
      }
      const data = await r.json();
      if (data.paymentUrl) { window.location.href = data.paymentUrl; return; }
      throw new Error("رابط الدفع غير متوفر");
    } catch (e) {
      toast({ variant: "destructive", title: "خطأ", description: (e as Error).message });
      setLoading(false);
    }
  };

  return (
    <Button size="sm" onClick={handleClick} disabled={loading}>
      <CreditCard className="w-4 h-4 ml-1" />
      {loading ? "جاري التحويل..." : "ادفع الآن"}
    </Button>
  );
}

function MySubscriptions() {
  const [subs, setSubs] = useState<CustomerSub[] | null>(null);
  const [loading, setLoading] = useState(true);
  useEffectLocal(() => {
    const token = localStorage.getItem("customer_token");
    fetch("/api/my-subscriptions", { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => r.ok ? r.json() : [])
      .then((data) => setSubs(Array.isArray(data) ? data : []))
      .catch(() => setSubs([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="space-y-3">{[1,2].map(i => <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />)}</div>;
  if (!subs || subs.length === 0) {
    return (
      <Card>
        <CardContent className="p-10 text-center">
          <Repeat className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground">لا توجد اشتراكات بعد</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      {subs.map((s) => {
        const expiresAt = new Date(s.expiresAt);
        const total = s.durationDays;
        const elapsed = Math.max(0, total - s.remainingDays);
        const pct = total > 0 ? Math.min(100, Math.round((elapsed / total) * 100)) : 0;
        return (
          <Card key={s.id} className={s.isActive ? "border-primary/30" : "opacity-75"}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
                <div className="min-w-0">
                  <h3 className="font-bold text-lg flex items-center gap-2">
                    <Repeat className="w-4 h-4 text-primary" /> {s.productName}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">الخطة: {s.planName} • {s.durationDays} يوم</p>
                </div>
                {s.isActive ? (
                  <Badge variant="default" className="bg-green-600 hover:bg-green-600">
                    <CheckCircle2 className="w-3 h-3 ml-1" /> نشط
                  </Badge>
                ) : (
                  <Badge variant="secondary">
                    <XCircle className="w-3 h-3 ml-1" /> منتهٍ
                  </Badge>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="w-3.5 h-3.5" />
                    {s.isActive ? `متبقي ${s.remainingDays} يوم` : "انتهى الاشتراك"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ينتهي: {format(expiresAt, "PPP", { locale: arSA })}
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full transition-all ${s.isActive ? "bg-primary" : "bg-muted-foreground/40"}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
              <div className="text-xs text-muted-foreground mt-3 pt-3 border-t">
                من طلب #{s.orderId} • بدأ {format(new Date(s.startedAt), "PPP", { locale: arSA })}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  pending: "جديد",
  payment_pending: "بانتظار الدفع",
  paid: "مدفوع",
  processing: "جاري التجهيز",
  shipped: "تم الشحن",
  delivered: "مكتمل",
  cancelled: "ملغي",
};

const PAYMENT_LABEL: Record<string, string> = {
  unpaid: "غير مدفوع",
  pending: "قيد الدفع",
  paid: "مدفوع",
  failed: "فشل الدفع",
};

const PAYMENT_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  paid: "default",
  pending: "secondary",
  unpaid: "outline",
  failed: "destructive",
};

export default function MyOrders() {
  const { customer, isAuthenticated, logout } = useCustomerAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  function copyCode(code: string) {
    navigator.clipboard.writeText(code);
    toast({ title: "تم نسخ الكود" });
  }

  useEffect(() => {
    if (!isAuthenticated) {
      setLocation("/login?redirect=/my-orders");
    }
  }, [isAuthenticated, setLocation]);

  const { data: orders, isLoading } = useListMyOrders({
    query: { queryKey: getListMyOrdersQueryKey(), enabled: isAuthenticated },
  });

  if (!isAuthenticated) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Card className="bg-gradient-to-l from-primary/5 to-transparent border-primary/20">
        <CardContent className="p-6 flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">مرحباً بك،</p>
            <h2 className="text-2xl font-bold">{customer?.name}</h2>
            <p className="text-sm text-muted-foreground mt-1" dir="ltr">{customer?.phone}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => { logout(); setLocation("/"); }}>
            <LogOut className="w-4 h-4 ml-2" /> خروج
          </Button>
        </CardContent>
      </Card>

      <div>
        <h1 className="text-2xl font-bold mb-4 flex items-center gap-2">
          <Repeat className="w-5 h-5 text-primary" /> اشتراكاتي
        </h1>
        <MySubscriptions />
      </div>

      <div>
        <h1 className="text-2xl font-bold mb-4">طلباتي السابقة</h1>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-32 bg-muted animate-pulse rounded-xl" />)}
          </div>
        ) : !orders || orders.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Package className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-lg font-medium mb-2">لا توجد طلبات بعد</p>
              <p className="text-muted-foreground mb-6">ابدأ التسوق من متجرنا الآن</p>
              <Button asChild>
                <Link href="/">تصفّح المنتجات</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {orders.map(order => (
              <Card key={order.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <CardTitle className="text-base">طلب #{order.id}</CardTitle>
                    <div className="flex gap-2 items-center">
                      <Badge variant="secondary">{STATUS_LABEL[order.status] || order.status}</Badge>
                      <Badge variant={PAYMENT_VARIANT[order.paymentStatus] || "outline"}>
                        {PAYMENT_LABEL[order.paymentStatus] || order.paymentStatus}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 mb-4">
                    {order.items.map((item: any, idx: number) => (
                      <div key={idx} className="flex justify-between text-sm">
                        <span>{item.productName} × {item.quantity}</span>
                        <span className="text-muted-foreground">{item.totalPrice} ر.س</span>
                      </div>
                    ))}
                  </div>
                  {(order as any).digitalCodes && (order as any).digitalCodes.length > 0 && (
                    <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4 mb-4 space-y-3">
                      <div className="flex items-center gap-2 font-bold text-primary">
                        <Key className="w-4 h-4" /> الأكواد الرقمية الخاصة بطلبك
                      </div>
                      {(order as any).digitalCodes.map((dc: any, i: number) => (
                        <div key={i} className="bg-background rounded-md p-3 border space-y-2">
                          <div className="text-sm font-medium">{dc.productName}</div>
                          <div className="flex items-center gap-2">
                            <code className="flex-1 font-mono text-base bg-muted rounded px-3 py-2 select-all" dir="ltr">{dc.code}</code>
                            <Button variant="outline" size="icon" onClick={() => copyCode(dc.code)}><Copy className="w-4 h-4" /></Button>
                          </div>
                          {(dc.usageInstructionsText || dc.usageInstructionsMediaUrl || dc.usageInstructionsLinkUrl) && (
                            <div className="border-t pt-2 mt-2 space-y-2">
                              <div className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                                <BookOpen className="w-3 h-3" /> طريقة الاستخدام
                              </div>
                              {dc.usageInstructionsText && <p className="text-sm whitespace-pre-wrap">{dc.usageInstructionsText}</p>}
                              {dc.usageInstructionsMediaUrl && dc.usageInstructionsMediaType === "image" && (
                                <img src={dc.usageInstructionsMediaUrl} alt="" className="rounded-md max-h-48 w-auto" />
                              )}
                              {dc.usageInstructionsMediaUrl && dc.usageInstructionsMediaType === "video" && (
                                <video src={dc.usageInstructionsMediaUrl} controls className="rounded-md max-h-48 w-auto" />
                              )}
                              {dc.usageInstructionsLinkUrl && (
                                <Button asChild size="sm" variant="outline" className="text-xs">
                                  <a href={dc.usageInstructionsLinkUrl} target="_blank" rel="noreferrer">
                                    <ExternalLink className="w-3 h-3 ml-1" /> فتح الرابط
                                  </a>
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                      <p className="text-xs text-muted-foreground">تم إرسال الأكواد أيضاً عبر واتساب على رقمك.</p>
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-3 border-t">
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(order.createdAt), "PPP", { locale: arSA })}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-primary">{order.totalAmount.toLocaleString("ar-SA")} ر.س</span>
                      {order.paymentStatus !== "paid" && (
                        <PayNowButton orderId={order.id} paymentLink={order.paymentLink} />
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

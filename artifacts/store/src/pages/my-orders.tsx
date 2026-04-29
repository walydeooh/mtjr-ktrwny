import { Link, useLocation } from "wouter";
import { useEffect } from "react";
import { useListMyOrders, getListMyOrdersQueryKey } from "@workspace/api-client-react";
import { useCustomerAuth } from "@/hooks/use-customer-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { arSA } from "date-fns/locale";
import { Package, ChevronLeft, LogOut } from "lucide-react";

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
                  <div className="flex items-center justify-between pt-3 border-t">
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(order.createdAt), "PPP", { locale: arSA })}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-primary">{order.totalAmount.toLocaleString("ar-SA")} ر.س</span>
                      {order.paymentLink && order.paymentStatus !== "paid" && (
                        <Button asChild size="sm">
                          <a href={order.paymentLink} target="_blank" rel="noreferrer">
                            ادفع الآن <ChevronLeft className="w-4 h-4 mr-1" />
                          </a>
                        </Button>
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

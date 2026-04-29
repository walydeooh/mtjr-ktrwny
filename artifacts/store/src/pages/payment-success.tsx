import { Link } from "wouter";
import { useEffect } from "react";
import { useGetPaymentStatus, getGetPaymentStatusQueryKey } from "@workspace/api-client-react";
import { useCart } from "@/hooks/use-cart";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Package, Home } from "lucide-react";

export default function PaymentSuccess() {
  const params = new URLSearchParams(window.location.search);
  const orderIdRaw = params.get("orderId") || "0";
  const orderId = parseInt(orderIdRaw, 10);
  const { clearCart } = useCart();

  useEffect(() => {
    clearCart();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: status } = useGetPaymentStatus(orderId, {
    query: { queryKey: getGetPaymentStatusQueryKey(orderId), enabled: !!orderId, refetchInterval: 3000 },
  });

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <Card className="w-full max-w-md shadow-xl border-t-4 border-green-500">
        <CardContent className="p-8 text-center">
          <div className="mx-auto mb-6 w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle2 className="w-12 h-12 text-green-600" strokeWidth={2.5} />
          </div>
          <h1 className="text-3xl font-black mb-3">تم الدفع بنجاح!</h1>
          <p className="text-muted-foreground mb-2">شكراً لشرائك من متجرنا</p>
          {orderId > 0 && (
            <p className="text-sm text-muted-foreground mb-6">رقم الطلب: <span className="font-mono font-bold">#{orderId}</span></p>
          )}
          {status && (
            <div className="bg-muted/50 rounded-lg p-4 mb-6 text-sm">
              <div className="flex justify-between mb-1">
                <span className="text-muted-foreground">المبلغ المدفوع</span>
                <span className="font-bold">{status.totalAmount.toLocaleString("ar-SA")} ر.س</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">حالة الطلب</span>
                <span className="font-bold text-green-600">مؤكد</span>
              </div>
            </div>
          )}
          <div className="space-y-2">
            <Button asChild className="w-full">
              <Link href="/my-orders"><Package className="w-4 h-4 ml-2" /> عرض طلباتي</Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href="/"><Home className="w-4 h-4 ml-2" /> العودة للمتجر</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

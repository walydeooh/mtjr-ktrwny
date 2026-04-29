import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { XCircle, RefreshCcw, Home, Package } from "lucide-react";

export default function PaymentFailed() {
  const params = new URLSearchParams(window.location.search);
  const orderId = params.get("orderId");

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <Card className="w-full max-w-md shadow-xl border-t-4 border-red-500">
        <CardContent className="p-8 text-center">
          <div className="mx-auto mb-6 w-20 h-20 rounded-full bg-red-100 flex items-center justify-center">
            <XCircle className="w-12 h-12 text-red-600" strokeWidth={2.5} />
          </div>
          <h1 className="text-3xl font-black mb-3">فشل الدفع</h1>
          <p className="text-muted-foreground mb-6">
            لم تتم عملية الدفع. لا يزال طلبك محفوظاً ويمكنك إعادة المحاولة من صفحة طلباتي.
          </p>
          {orderId && (
            <p className="text-sm text-muted-foreground mb-6">رقم الطلب: <span className="font-mono font-bold">#{orderId}</span></p>
          )}
          <div className="space-y-2">
            <Button asChild className="w-full">
              <Link href="/my-orders"><Package className="w-4 h-4 ml-2" /> عرض طلباتي وإعادة الدفع</Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href="/cart"><RefreshCcw className="w-4 h-4 ml-2" /> العودة للسلة</Link>
            </Button>
            <Button asChild variant="ghost" className="w-full">
              <Link href="/"><Home className="w-4 h-4 ml-2" /> الرئيسية</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

import { useEffect } from "react";
import { useLocation, Link } from "wouter";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCart } from "@/hooks/use-cart";
import { useCustomerAuth } from "@/hooks/use-customer-auth";
import { useCreateOrder, useCreateOrderPayment } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import { Lock, ShieldCheck, CreditCard } from "lucide-react";

const checkoutSchema = z.object({
  notes: z.string().optional(),
});

export default function Checkout() {
  const { items, total } = useCart();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { customer, isAuthenticated } = useCustomerAuth();
  const createOrder = useCreateOrder();
  const createPayment = useCreateOrderPayment();

  useEffect(() => {
    if (!isAuthenticated) {
      setLocation("/login?redirect=/checkout");
    }
  }, [isAuthenticated, setLocation]);

  useEffect(() => {
    if (items.length === 0) {
      setLocation("/cart");
    }
  }, [items.length, setLocation]);

  const form = useForm<z.infer<typeof checkoutSchema>>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: { notes: "" },
  });

  if (!isAuthenticated || items.length === 0) return null;

  const onSubmit = (values: z.infer<typeof checkoutSchema>) => {
    if (!customer) return;
    createOrder.mutate(
      {
        data: {
          customerName: customer.name,
          customerPhone: customer.phone,
          notes: values.notes,
          items: items.map(item => ({
            productId: item.product.id,
            quantity: item.quantity,
          })),
          source: "web",
        },
      },
      {
        onSuccess: (order) => {
          createPayment.mutate(
            { id: order.id },
            {
              onSuccess: (payment) => {
                toast({ title: "تم إنشاء طلبك", description: "يتم تحويلك لصفحة الدفع..." });
                window.location.href = payment.paymentUrl;
              },
              onError: () => {
                toast({
                  variant: "destructive",
                  title: "خطأ",
                  description: "تم إنشاء الطلب لكن تعذّر إنشاء رابط الدفع. راجع طلباتي.",
                });
                setLocation("/my-orders");
              },
            }
          );
        },
        onError: () => {
          toast({
            variant: "destructive",
            title: "خطأ",
            description: "حدث خطأ أثناء إنشاء الطلب. حاول مرة أخرى.",
          });
        },
      }
    );
  };

  const isPending = createOrder.isPending || createPayment.isPending;

  return (
    <div className="max-w-5xl mx-auto grid lg:grid-cols-2 gap-8">
      <div>
        <h1 className="text-3xl font-black mb-8">إتمام الطلب</h1>

        <Card className="mb-6 border-green-200 bg-green-50/40">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-100 text-green-700 flex items-center justify-center font-bold">
              {customer?.name.charAt(0)}
            </div>
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">جاري الشراء باسم</p>
              <p className="font-bold">{customer?.name}</p>
              <p className="text-xs text-muted-foreground" dir="ltr">{customer?.phone}</p>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/my-orders">طلباتي</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>تفاصيل الطلب</CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ملاحظات إضافية (اختياري)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="أي ملاحظات حول الطلب أو العنوان..."
                          className="resize-none min-h-[100px]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="rounded-lg border bg-muted/30 p-4 flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium">دفع آمن عبر Paylink</p>
                    <p className="text-muted-foreground text-xs mt-1">
                      سيتم تحويلك لبوابة الدفع لإتمام عملية الشراء بأمان عبر مدى أو بطاقات الائتمان.
                    </p>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-14 text-lg gap-2"
                  disabled={isPending}
                >
                  <Lock className="w-5 h-5" />
                  {isPending ? "جاري التحويل لصفحة الدفع..." : `الدفع الآمن - ${total.toLocaleString("ar-SA")} ر.س`}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>

      <div>
        <div className="sticky top-24">
          <Card className="bg-muted/30 border-primary/10">
            <CardHeader>
              <CardTitle>ملخص الطلب</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 max-h-[400px] overflow-auto pr-2">
                {items.map((item) => (
                  <div key={item.product.id} className="flex gap-4">
                    <div className="w-16 h-16 rounded border bg-background overflow-hidden shrink-0">
                      {item.product.imageUrl && (
                        <img
                          src={item.product.imageUrl}
                          alt={item.product.name}
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium text-sm line-clamp-2">{item.product.name}</h4>
                      <p className="text-muted-foreground text-xs mt-1">الكمية: {item.quantity}</p>
                    </div>
                    <div className="font-bold text-sm">
                      {(item.product.price * item.quantity).toLocaleString('ar-SA')} ر.س
                    </div>
                  </div>
                ))}
              </div>

              <Separator className="my-6" />

              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>المجموع الفرعي</span>
                  <span>{total.toLocaleString('ar-SA')} ر.س</span>
                </div>
                <div className="flex justify-between font-black text-lg pt-2">
                  <span>المجموع الإجمالي</span>
                  <span className="text-primary">{total.toLocaleString('ar-SA')} ر.س</span>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t flex items-center gap-2 text-xs text-muted-foreground">
                <CreditCard className="w-4 h-4" />
                <span>دفع آمن مشفّر</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCart } from "@/hooks/use-cart";
import { useCustomerAuth } from "@/hooks/use-customer-auth";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import { Lock, ShieldCheck, CreditCard, Banknote, Tag, X } from "lucide-react";

const checkoutSchema = z.object({ notes: z.string().optional() });

type Settings = {
  bankTransferEnabled: boolean;
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountIban: string | null;
  bankInstructions: string | null;
};

type BankAccount = {
  id: number;
  bankName: string;
  accountName: string;
  accountNumber: string | null;
  iban: string;
  logoUrl: string | null;
};

export default function Checkout() {
  const { items, total, clearCart } = useCart();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { customer, isAuthenticated } = useCustomerAuth();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);

  const [paymentMethod, setPaymentMethod] = useState<"paylink" | "bank_transfer">("paylink");
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<{ code: string; discountAmount: number } | null>(null);
  const [validating, setValidating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) setLocation("/login?redirect=/checkout");
  }, [isAuthenticated, setLocation]);
  useEffect(() => {
    if (items.length === 0) setLocation("/cart");
  }, [items.length, setLocation]);
  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then(setSettings).catch(() => {});
    fetch("/api/bank-accounts").then((r) => r.json()).then((d) => {
      if (Array.isArray(d)) setBankAccounts(d);
    }).catch(() => {});
  }, []);

  const form = useForm<z.infer<typeof checkoutSchema>>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: { notes: "" },
  });

  if (!isAuthenticated || items.length === 0) return null;

  async function applyCoupon() {
    if (!couponInput.trim()) return;
    setValidating(true);
    try {
      const r = await fetch("/api/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: couponInput.trim(), subtotal: total }),
      });
      const data = await r.json();
      if (!r.ok || !data.code) {
        toast({ variant: "destructive", title: "كوبون غير صالح", description: data.error || "تأكد من الكود وحاول مجدداً" });
        return;
      }
      setCoupon({ code: data.code, discountAmount: data.discountAmount });
      toast({ title: "تم تطبيق الكوبون", description: `خصم ${data.discountAmount} ر.س` });
    } catch {
      toast({ variant: "destructive", title: "خطأ في التحقق من الكوبون" });
    } finally {
      setValidating(false);
    }
  }

  function removeCoupon() {
    setCoupon(null);
    setCouponInput("");
  }

  const discount = coupon?.discountAmount || 0;
  const finalTotal = Math.max(0, total - discount);

  async function onSubmit(values: z.infer<typeof checkoutSchema>) {
    if (!customer) return;
    setSubmitting(true);
    try {
      const affiliateCode = localStorage.getItem("affiliate_code");
      const orderRes = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: customer.name,
          customerPhone: customer.phone,
          notes: values.notes,
          items: items.map((item) => ({
            productId: item.product.id,
            quantity: item.quantity,
            ...(item.planId ? { planId: item.planId } : {}),
            ...(item.optionId ? { optionId: item.optionId } : {}),
          })),
          source: "web",
          couponCode: coupon?.code,
          affiliateCode: affiliateCode || undefined,
          paymentMethod,
        }),
      });
      if (!orderRes.ok) {
        const e = await orderRes.json().catch(() => ({}));
        throw new Error(e.error || "تعذّر إنشاء الطلب");
      }
      const order = await orderRes.json();

      if (paymentMethod === "bank_transfer") {
        // Mark order as awaiting bank transfer; customer sees instructions and uploads receipt later
        await fetch(`/api/payments/${order.id}/bank-transfer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        clearCart();
        toast({ title: "تم استلام طلبك", description: "اتبع تعليمات التحويل البنكي" });
        setLocation(`/payment/bank-transfer?orderId=${order.id}`);
        return;
      }

      // Paylink (or free-order auto-confirm when amount = 0)
      const custToken = localStorage.getItem("customer_token");
      const payRes = await fetch(`/api/orders/${order.id}/payment`, {
        method: "POST",
        headers: custToken ? { Authorization: `Bearer ${custToken}` } : {},
      });
      if (!payRes.ok) {
        toast({ variant: "destructive", title: "تعذّر إنشاء رابط الدفع", description: "راجع طلباتي" });
        setLocation("/my-orders");
        return;
      }
      const payment = await payRes.json();
      clearCart();
      if (payment.paid || payment.free) {
        toast({ title: "تم تأكيد طلبك", description: "تم تنفيذ الطلب بنجاح" });
        setLocation(`/payment/success?orderId=${order.id}`);
        return;
      }
      toast({ title: "تم إنشاء طلبك", description: "يتم تحويلك لصفحة الدفع..." });
      window.location.href = payment.paymentUrl;
    } catch (e) {
      toast({ variant: "destructive", title: "خطأ", description: (e as Error).message });
    } finally {
      setSubmitting(false);
    }
  }

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
          <CardHeader><CardTitle>تفاصيل الطلب</CardTitle></CardHeader>
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
                        <Textarea placeholder="أي ملاحظات حول الطلب أو العنوان..." className="resize-none min-h-[100px]" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div>
                  <Label>كود الخصم</Label>
                  {coupon ? (
                    <div className="mt-2 flex items-center justify-between rounded-lg border border-green-200 bg-green-50 p-3">
                      <div className="flex items-center gap-2"><Tag className="h-4 w-4 text-green-700" /><span className="font-mono font-bold">{coupon.code}</span><span className="text-sm text-green-700">-{coupon.discountAmount} ر.س</span></div>
                      <Button type="button" variant="ghost" size="icon" onClick={removeCoupon}><X className="h-4 w-4" /></Button>
                    </div>
                  ) : (
                    <div className="flex gap-2 mt-2">
                      <Input value={couponInput} onChange={(e) => setCouponInput(e.target.value.toUpperCase())} placeholder="ادخل كود الخصم" />
                      <Button type="button" variant="outline" disabled={validating || !couponInput.trim()} onClick={applyCoupon}>{validating ? "..." : "تطبيق"}</Button>
                    </div>
                  )}
                </div>

                <div>
                  <Label>طريقة الدفع</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                    <button type="button" onClick={() => setPaymentMethod("paylink")} className={`p-4 rounded-lg border-2 text-right transition ${paymentMethod === "paylink" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}>
                      <div className="flex items-center gap-2 mb-1"><CreditCard className="h-5 w-5" /><span className="font-semibold">دفع إلكتروني</span></div>
                      <p className="text-xs text-muted-foreground">مدى، فيزا، ماستركارد</p>
                    </button>
                    {(settings?.bankTransferEnabled || bankAccounts.length > 0) && (
                      <button type="button" onClick={() => setPaymentMethod("bank_transfer")} className={`p-4 rounded-lg border-2 text-right transition ${paymentMethod === "bank_transfer" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}>
                        <div className="flex items-center gap-2 mb-1"><Banknote className="h-5 w-5" /><span className="font-semibold">تحويل بنكي</span></div>
                        <p className="text-xs text-muted-foreground">يتم التأكيد خلال 24 ساعة</p>
                      </button>
                    )}
                  </div>
                </div>

                {paymentMethod === "paylink" ? (
                  <div className="rounded-lg border bg-muted/30 p-4 flex items-start gap-3">
                    <ShieldCheck className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium">دفع آمن عبر Paylink</p>
                      <p className="text-muted-foreground text-xs mt-1">سيتم تحويلك لبوابة الدفع لإتمام عملية الشراء بأمان عبر مدى أو بطاقات الائتمان.</p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border bg-muted/30 p-4 text-sm space-y-3">
                    <p className="font-semibold">معلومات التحويل البنكي:</p>
                    {bankAccounts.length > 0 ? (
                      <div className="space-y-3">
                        {bankAccounts.map((b) => (
                          <div key={b.id} className="rounded border bg-background p-3 space-y-1">
                            <div className="flex items-center gap-2 font-bold">
                              {b.logoUrl ? (
                                <img src={b.logoUrl} alt={b.bankName} className="h-6 w-6 object-contain" />
                              ) : (
                                <Banknote className="h-4 w-4 text-primary" />
                              )}
                              <span>{b.bankName}</span>
                            </div>
                            <p><span className="text-muted-foreground">الاسم:</span> {b.accountName}</p>
                            {b.accountNumber && <p><span className="text-muted-foreground">رقم الحساب:</span> <span className="font-mono" dir="ltr">{b.accountNumber}</span></p>}
                            <p><span className="text-muted-foreground">الآيبان:</span> <span className="font-mono" dir="ltr">{b.iban}</span></p>
                          </div>
                        ))}
                        <p className="text-muted-foreground text-xs">يمكنك التحويل لأي حساب من الحسابات أعلاه ثم رفع إيصال التحويل بعد إتمام الطلب.</p>
                      </div>
                    ) : (
                      <>
                        {settings?.bankName && <p><span className="text-muted-foreground">البنك:</span> {settings.bankName}</p>}
                        {settings?.bankAccountName && <p><span className="text-muted-foreground">الاسم:</span> {settings.bankAccountName}</p>}
                        {settings?.bankAccountIban && <p><span className="text-muted-foreground">الآيبان:</span> <span className="font-mono" dir="ltr">{settings.bankAccountIban}</span></p>}
                        {settings?.bankInstructions && <p className="text-muted-foreground pt-1 border-t mt-2">{settings.bankInstructions}</p>}
                      </>
                    )}
                  </div>
                )}

                <Button type="submit" className="w-full h-14 text-lg gap-2" disabled={submitting}>
                  <Lock className="w-5 h-5" />
                  {submitting
                    ? "جاري المعالجة..."
                    : finalTotal <= 0
                      ? "اتمام الشراء (مجاناً)"
                      : `تأكيد الطلب - ${finalTotal.toLocaleString("ar-SA")} ر.س`}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>

      <div>
        <div className="sticky top-24">
          <Card className="bg-muted/30 border-primary/10">
            <CardHeader><CardTitle>ملخص الطلب</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-4 max-h-[400px] overflow-auto pr-2">
                {items.map((item) => (
                  <div key={item.product.id} className="flex gap-4">
                    <div className="w-16 h-16 rounded border bg-background overflow-hidden shrink-0">
                      {item.product.imageUrl && <img src={item.product.imageUrl} alt={item.product.name} className="w-full h-full object-cover" />}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium text-sm line-clamp-2">{item.product.name}</h4>
                      <p className="text-muted-foreground text-xs mt-1">الكمية: {item.quantity}</p>
                    </div>
                    <div className="font-bold text-sm">{((item.optionPrice ?? item.planPrice ?? item.product.price) * item.quantity).toLocaleString("ar-SA")} ر.س</div>
                  </div>
                ))}
              </div>
              <Separator className="my-6" />
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-muted-foreground"><span>المجموع الفرعي</span><span>{total.toLocaleString("ar-SA")} ر.س</span></div>
                {discount > 0 && <div className="flex justify-between text-green-700"><span>الخصم ({coupon?.code})</span><span>-{discount.toLocaleString("ar-SA")} ر.س</span></div>}
                <div className="flex justify-between font-black text-lg pt-2"><span>المجموع الإجمالي</span><span className="text-primary">{finalTotal.toLocaleString("ar-SA")} ر.س</span></div>
              </div>
              <div className="mt-4 pt-4 border-t flex items-center gap-2 text-xs text-muted-foreground">
                <CreditCard className="w-4 h-4" /><span>دفع آمن مشفّر</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

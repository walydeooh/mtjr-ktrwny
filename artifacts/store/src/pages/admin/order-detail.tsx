import { useParams, Link } from "wouter";
import { useGetOrder, useUpdateOrder, useCreateOrderPayment, getGetOrderQueryKey, getListOrdersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { arSA } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowRight, MessageCircle, Copy, Link as LinkIcon, Printer } from "lucide-react";
import { OrderStatusBadge, PaymentStatusBadge } from "./orders";

export default function OrderDetail() {
  const { id } = useParams();
  const orderId = parseInt(id || "0", 10);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: order, isLoading } = useGetOrder(orderId, {
    query: {
      enabled: !!orderId,
      queryKey: getGetOrderQueryKey(orderId),
    }
  });

  const updateOrder = useUpdateOrder();
  const createPayment = useCreateOrderPayment();

  const handleStatusChange = (status: any) => {
    updateOrder.mutate(
      { id: orderId, data: { status } },
      {
        onSuccess: () => {
          toast({ title: "تم التحديث", description: "تم تحديث حالة الطلب بنجاح" });
          queryClient.invalidateQueries({ queryKey: getGetOrderQueryKey(orderId) });
          queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
        }
      }
    );
  };

  const handleCreatePaymentLink = () => {
    createPayment.mutate(
      { id: orderId },
      {
        onSuccess: () => {
          toast({ title: "تم الإنشاء", description: "تم إنشاء رابط الدفع بنجاح" });
          queryClient.invalidateQueries({ queryKey: getGetOrderQueryKey(orderId) });
        },
        onError: () => {
          toast({ variant: "destructive", title: "خطأ", description: "حدث خطأ أثناء إنشاء رابط الدفع. يرجى التحقق من إعدادات بوابة الدفع." });
        }
      }
    );
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "تم النسخ", description: "تم نسخ النص إلى الحافظة" });
  };

  if (isLoading) return <div className="animate-pulse h-96 bg-muted rounded-xl max-w-5xl mx-auto"></div>;
  if (!order) return <div>الطلب غير موجود</div>;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/admin/orders">
              <ArrowRight className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">طلب #{order.id}</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {format(new Date(order.createdAt), "PPP", { locale: arSA })}
            </p>
          </div>
          <div className="mr-4 space-x-2 space-x-reverse">
            <OrderStatusBadge status={order.status} />
            <PaymentStatusBadge status={order.paymentStatus} />
          </div>
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="w-4 h-4 ml-2" />
            طباعة
          </Button>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle>تفاصيل المنتجات</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-12 text-sm font-medium text-muted-foreground pb-2 border-b">
                  <div className="col-span-6">المنتج</div>
                  <div className="col-span-2 text-center">السعر</div>
                  <div className="col-span-2 text-center">الكمية</div>
                  <div className="col-span-2 text-left">المجموع</div>
                </div>
                
                {order.items.map((item) => (
                  <div key={item.id} className="grid grid-cols-12 items-center py-2 border-b last:border-0">
                    <div className="col-span-6 font-medium">{item.productName}</div>
                    <div className="col-span-2 text-center">{item.unitPrice} ر.س</div>
                    <div className="col-span-2 text-center text-muted-foreground">{item.quantity}</div>
                    <div className="col-span-2 text-left font-bold">{item.totalPrice} ر.س</div>
                  </div>
                ))}
                
                <div className="pt-4 flex justify-between items-center text-lg font-black">
                  <span>الإجمالي</span>
                  <span className="text-primary">{order.totalAmount.toLocaleString('ar-SA')} ر.س</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>تحديث حالة الطلب</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col sm:flex-row gap-4 items-end sm:items-center">
              <div className="w-full sm:w-64 space-y-2">
                <label className="text-sm font-medium">الحالة الحالية</label>
                <Select defaultValue={order.status} onValueChange={handleStatusChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">جديد</SelectItem>
                    <SelectItem value="payment_pending">بانتظار الدفع</SelectItem>
                    <SelectItem value="paid">تم الدفع</SelectItem>
                    <SelectItem value="processing">جاري التجهيز</SelectItem>
                    <SelectItem value="shipped">تم الشحن</SelectItem>
                    <SelectItem value="delivered">مكتمل</SelectItem>
                    <SelectItem value="cancelled">ملغي</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>معلومات العميل</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground mb-1">الاسم</p>
                <p className="font-medium">{order.customerName}</p>
              </div>
              <Separator />
              <div>
                <p className="text-sm text-muted-foreground mb-1">رقم الجوال</p>
                <div className="flex items-center justify-between">
                  <p className="font-medium" dir="ltr">{order.customerPhone}</p>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyToClipboard(order.customerPhone)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600" asChild>
                      <a href={`https://wa.me/${order.customerPhone.replace(/\+/g, '')}`} target="_blank" rel="noreferrer">
                        <MessageCircle className="h-4 w-4" />
                      </a>
                    </Button>
                  </div>
                </div>
              </div>
              {order.notes && (
                <>
                  <Separator />
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">ملاحظات الطلب</p>
                    <p className="text-sm bg-muted/50 p-3 rounded-md italic">{order.notes}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>الدفع</CardTitle>
              <CardDescription>
                المصدر: {order.source === 'web' ? 'المتجر' : order.source === 'whatsapp' ? 'واتساب' : 'الإدارة'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm">حالة الدفع</span>
                <PaymentStatusBadge status={order.paymentStatus} />
              </div>
              
              {order.paymentLink ? (
                <div className="mt-4 pt-4 border-t">
                  <p className="text-sm font-medium mb-2">رابط الدفع المخصص:</p>
                  <div className="flex gap-2">
                    <Input readOnly value={order.paymentLink} className="text-xs" dir="ltr" />
                    <Button variant="outline" size="icon" onClick={() => copyToClipboard(order.paymentLink!)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : order.paymentStatus === 'unpaid' || order.paymentStatus === 'pending' ? (
                <Button 
                  className="w-full mt-4" 
                  variant="outline" 
                  onClick={handleCreatePaymentLink}
                  disabled={createPayment.isPending}
                >
                  <LinkIcon className="h-4 w-4 ml-2" />
                  {createPayment.isPending ? "جاري الإنشاء..." : "إنشاء رابط دفع Paylink"}
                </Button>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

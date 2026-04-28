import { useState } from "react";
import { useLocation } from "wouter";
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
import { useCreateOrder } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";

const checkoutSchema = z.object({
  customerName: z.string().min(2, "الاسم يجب أن يكون حرفين على الأقل"),
  customerPhone: z.string().min(9, "رقم الجوال غير صحيح"),
  notes: z.string().optional(),
});

export default function Checkout() {
  const { items, total, clearCart } = useCart();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createOrder = useCreateOrder();

  const form = useForm<z.infer<typeof checkoutSchema>>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      customerName: "",
      customerPhone: "",
      notes: "",
    },
  });

  if (items.length === 0) {
    setLocation("/cart");
    return null;
  }

  const onSubmit = (values: z.infer<typeof checkoutSchema>) => {
    createOrder.mutate(
      {
        data: {
          ...values,
          items: items.map(item => ({
            productId: item.product.id,
            quantity: item.quantity
          })),
          source: "web"
        },
      },
      {
        onSuccess: (order) => {
          clearCart();
          toast({
            title: "تم استلام طلبك",
            description: `رقم الطلب: #${order.id}`,
          });
          setLocation("/");
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

  return (
    <div className="max-w-5xl mx-auto grid lg:grid-cols-2 gap-8">
      <div>
        <h1 className="text-3xl font-black mb-8">إتمام الطلب</h1>
        <Card>
          <CardHeader>
            <CardTitle>معلومات العميل</CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="customerName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>الاسم الكامل</FormLabel>
                      <FormControl>
                        <Input placeholder="أدخل اسمك الكريم" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="customerPhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>رقم الجوال</FormLabel>
                      <FormControl>
                        <Input placeholder="05XXXXXXXX" dir="ltr" className="text-right" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ملاحظات إضافية (اختياري)</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="أي ملاحظات حول الطلب..."
                          className="resize-none"
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button 
                  type="submit" 
                  className="w-full h-14 text-lg" 
                  disabled={createOrder.isPending}
                >
                  {createOrder.isPending ? "جاري المعالجة..." : "تأكيد الطلب والدفع"}
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
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

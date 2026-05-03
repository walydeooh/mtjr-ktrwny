import { useCart } from "@/hooks/use-cart";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Minus, Plus, Trash2, ShoppingCart, ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export default function Cart() {
  const { items, updateQuantity, removeItem, total } = useCart();

  if (items.length === 0) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <div className="bg-muted w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6">
          <ShoppingCart className="h-10 w-10 text-muted-foreground" />
        </div>
        <h2 className="text-2xl font-bold mb-4">السلة فارغة</h2>
        <p className="text-muted-foreground mb-8 text-lg">لم تقم بإضافة أي منتجات للسلة بعد.</p>
        <Button asChild size="lg">
          <Link href="/">تصفح المنتجات</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-3xl font-black mb-8">سلة المشتريات</h1>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          {items.map((item) => {
            const unitPrice = item.optionPrice ?? item.planPrice ?? item.product.price;
            const typeLabel =
              item.product.type === "digital" ? "منتج رقمي" :
              item.product.type === "physical" ? "منتج مادي" :
              item.product.type === "subscription" ? "اشتراك" : "خدمة حجز";
            return (
            <Card key={`${item.product.id}-${item.slotId || 'none'}-${item.planId || 'none'}-${item.optionId || 'none'}`}>
              <CardContent className="p-4 sm:p-6 flex gap-4 sm:gap-6">
                <div className="w-24 h-24 rounded-lg bg-muted flex-shrink-0 border overflow-hidden">
                  {item.product.imageUrl && (
                    <img src={item.product.imageUrl} alt={item.product.name} className="w-full h-full object-cover" />
                  )}
                </div>

                <div className="flex-1 flex flex-col">
                  <div className="flex justify-between gap-4">
                    <div>
                      <h3 className="font-bold text-lg line-clamp-1">{item.product.name}</h3>
                      <p className="text-muted-foreground text-sm">{typeLabel}</p>
                      {item.planName && (
                        <p className="text-primary text-sm mt-1 font-medium bg-primary/10 inline-block px-2 py-0.5 rounded">
                          الخطة: {item.planName} ({item.planDurationDays} يوم)
                        </p>
                      )}
                      {item.optionName && (
                        <p className="text-primary text-sm mt-1 font-medium bg-primary/10 inline-block px-2 py-0.5 rounded">
                          الخيار: {item.optionName}
                        </p>
                      )}
                      {item.date && item.startTime && (
                        <p className="text-primary text-sm mt-1 font-medium bg-primary/10 inline-block px-2 py-0.5 rounded">
                          {item.date} | {item.startTime}
                        </p>
                      )}
                    </div>
                    <div className="font-bold text-lg shrink-0">
                      {(unitPrice * item.quantity).toLocaleString('ar-SA')} ر.س
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-auto pt-4">
                    <div className="flex items-center border rounded-md">
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none rounded-r-md"
                        onClick={() => updateQuantity(item.product.id, item.quantity - 1, item.planId, item.optionId)}>
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-10 text-center text-sm font-medium">{item.quantity}</span>
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none rounded-l-md"
                        onClick={() => updateQuantity(item.product.id, item.quantity + 1, item.planId, item.optionId)}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>

                    <Button variant="ghost" size="sm"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => removeItem(item.product.id, item.planId, item.optionId)}>
                      <Trash2 className="h-4 w-4 ml-2" />
                      حذف
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );})}
        </div>

        <div className="lg:col-span-1">
          <Card className="sticky top-24">
            <CardContent className="p-6">
              <h3 className="text-xl font-bold mb-6">ملخص الطلب</h3>
              
              <div className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">المجموع الفرعي</span>
                  <span className="font-medium">{total.toLocaleString('ar-SA')} ر.س</span>
                </div>
                
                <Separator />
                
                <div className="flex justify-between text-lg font-black">
                  <span>الإجمالي</span>
                  <span className="text-primary">{total.toLocaleString('ar-SA')} ر.س</span>
                </div>
              </div>
              
              <Button asChild size="lg" className="w-full mt-6 h-14 text-lg">
                <Link href="/checkout">
                  إتمام الطلب
                  <ArrowLeft className="w-5 h-5 mr-2" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

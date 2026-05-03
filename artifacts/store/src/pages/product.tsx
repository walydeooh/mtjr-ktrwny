import { useGetProduct, getGetProductQueryKey } from "@workspace/api-client-react";
import { useParams, useLocation } from "wouter";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, Package, ArrowRight, Calendar, Check, Sparkles, ListChecks } from "lucide-react";
import { useCart } from "@/hooks/use-cart";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

type Plan = { id: number; name: string; durationDays: number; price: number };
type Option = { id: number; name: string; price: number };

export default function ProductDetail() {
  const { id } = useParams();
  const productId = parseInt(id || "0", 10);
  const [, setLocation] = useLocation();
  const { addItem } = useCart();
  const { toast } = useToast();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [options, setOptions] = useState<Option[]>([]);
  const [selectedOptionId, setSelectedOptionId] = useState<number | null>(null);

  const { data: product, isLoading, isError } = useGetProduct(productId, {
    query: { enabled: !!productId, queryKey: getGetProductQueryKey(productId) },
  });

  useEffect(() => {
    if (product?.type === "subscription") {
      fetch(`/api/products/${productId}/subscription-plans`)
        .then(r => r.json())
        .then((p: Plan[]) => {
          setPlans(p);
        })
        .catch(() => {});
    }
  }, [product?.type, productId]);

  // Generic options exist for ALL non-subscription products (subscription uses plans instead)
  useEffect(() => {
    if (product && product.type !== "subscription") {
      fetch(`/api/products/${productId}/options`)
        .then(r => r.json())
        .then((o: Option[]) => {
          setOptions(Array.isArray(o) ? o : []);
        })
        .catch(() => {});
    }
  }, [product?.type, productId]);

  if (isLoading) {
    return (
      <div className="grid md:grid-cols-2 gap-8 animate-pulse">
        <div className="aspect-square bg-muted rounded-2xl" />
        <div className="space-y-6">
          <div className="h-8 bg-muted rounded w-3/4" />
          <div className="h-6 bg-muted rounded w-1/4" />
          <div className="h-32 bg-muted rounded w-full" />
          <div className="h-12 bg-muted rounded w-full" />
        </div>
      </div>
    );
  }

  if (isError || !product) {
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold mb-4">المنتج غير موجود</h2>
        <Button onClick={() => setLocation("/")}>العودة للرئيسية</Button>
      </div>
    );
  }

  const isSubscription = product.type === "subscription";
  const selectedPlan = plans.find(p => p.id === selectedPlanId) || null;
  const selectedOption = options.find(o => o.id === selectedOptionId) || null;
  const hasOptions = !isSubscription && options.length > 0;
  const displayPrice = isSubscription && selectedPlan
    ? selectedPlan.price
    : (hasOptions && selectedOption ? selectedOption.price : product.price);

  const handleAddToCart = () => {
    if (isSubscription) {
      if (!selectedPlan) {
        toast({ variant: "destructive", title: "يجب اختيار مدة الاشتراك" });
        return;
      }
      addItem({
        product,
        quantity: 1,
        planId: selectedPlan.id,
        planName: selectedPlan.name,
        planPrice: selectedPlan.price,
        planDurationDays: selectedPlan.durationDays,
      });
      toast({ title: "تمت الإضافة للسلة", description: `${product.name} — ${selectedPlan.name}` });
      return;
    }
    if (hasOptions) {
      if (!selectedOption) {
        toast({ variant: "destructive", title: "يجب اختيار أحد الخيارات" });
        return;
      }
      addItem({
        product,
        quantity: 1,
        optionId: selectedOption.id,
        optionName: selectedOption.name,
        optionPrice: selectedOption.price,
      });
      toast({ title: "تمت الإضافة للسلة", description: `${product.name} — ${selectedOption.name}` });
      return;
    }
    if (product.type === "booking") {
      toast({ title: "تنبيه", description: "يرجى تحديد موعد الحجز من السلة" });
    }
    addItem({ product, quantity: 1 });
    toast({ title: "تمت الإضافة للسلة", description: `تم إضافة ${product.name} إلى السلة بنجاح.` });
  };

  const typeBadge = (() => {
    switch (product.type) {
      case "digital": return { label: "منتج رقمي", variant: "default" as const };
      case "physical": return { label: "منتج مادي", variant: "secondary" as const };
      case "subscription": return { label: "اشتراك", variant: "default" as const };
      default: return { label: "خدمة حجز", variant: "outline" as const };
    }
  })();

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Link href="/" className="inline-flex items-center text-muted-foreground hover:text-primary transition-colors">
        <ArrowRight className="h-4 w-4 ml-1" />
        العودة للمنتجات
      </Link>

      <div className="grid md:grid-cols-2 gap-10">
        <div className="aspect-square rounded-3xl overflow-hidden bg-muted flex items-center justify-center border border-border/50 shadow-sm relative">
          {product.imageUrl ? (
            <img src={product.imageUrl} alt={product.name} className="object-cover w-full h-full" />
          ) : (
            <Package className="h-32 w-32 text-muted-foreground/30" />
          )}
          <div className="absolute top-4 right-4">
            <Badge variant={typeBadge.variant} className="text-sm px-3 py-1 shadow-md">
              {isSubscription && <Sparkles className="w-3 h-3 ml-1 inline" />}
              {typeBadge.label}
            </Badge>
          </div>
        </div>

        <div className="flex flex-col">
          <h1 className="text-4xl font-black text-foreground mb-4">{product.name}</h1>
          <div className="text-3xl font-bold text-primary mb-6">
            {displayPrice.toLocaleString("ar-SA")} ر.س
            {isSubscription && selectedPlan && (
              <span className="text-base font-normal text-muted-foreground mr-2">/ {selectedPlan.name}</span>
            )}
          </div>

          <div className="prose prose-slate dark:prose-invert mb-6 flex-1">
            <h3 className="text-lg font-semibold mb-2">الوصف</h3>
            <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {product.description || "لا يوجد وصف لهذا المنتج."}
            </p>
          </div>

          {/* Generic product options picker — REQUIRED when present */}
          {hasOptions && (
            <div className="mb-6 space-y-3">
              <label className="text-base font-bold flex items-center gap-2">
                <ListChecks className="w-4 h-4 text-primary" />
                اختر أحد الخيارات
                <span className="text-destructive">*</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {options.map(o => {
                  const active = selectedOptionId === o.id;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setSelectedOptionId(o.id)}
                      className={`relative text-right p-4 rounded-xl border-2 transition-all ${
                        active ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-bold min-w-0 flex-1">{o.name}</div>
                        <div className="font-bold text-primary shrink-0">{o.price.toLocaleString("ar-SA")} ر.س</div>
                      </div>
                      {active && (
                        <div className="absolute top-2 left-2 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                          <Check className="w-3 h-3" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Subscription plan picker — REQUIRED */}
          {isSubscription && (
            <div className="mb-6 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-base font-bold flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-primary" />
                  اختر مدة الاشتراك
                  <span className="text-destructive">*</span>
                </label>
              </div>
              {plans.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
                  لا توجد خطط اشتراك متاحة لهذا المنتج حالياً
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {plans.map(p => {
                    const active = selectedPlanId === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedPlanId(p.id)}
                        className={`relative text-right p-4 rounded-xl border-2 transition-all ${
                          active ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/50"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-bold">{p.name}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">{p.durationDays} يوم</div>
                          </div>
                          <div className="text-left shrink-0">
                            <div className="font-bold text-primary">{p.price.toLocaleString("ar-SA")} ر.س</div>
                          </div>
                        </div>
                        {active && (
                          <div className="absolute top-2 left-2 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                            <Check className="w-3 h-3" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="space-y-4 mt-auto pt-6 border-t border-border/50">
            {product.type === "physical" && product.stock !== null && (
              <p className="text-sm text-muted-foreground">
                المخزون المتوفر: <span className="font-bold text-foreground">{product.stock}</span>
              </p>
            )}

            <Button
              size="lg"
              className="w-full text-lg h-14"
              onClick={handleAddToCart}
              disabled={
                (product.type === "physical" && product.stock === 0) ||
                (isSubscription && (plans.length === 0 || !selectedPlanId)) ||
                (hasOptions && !selectedOptionId)
              }
            >
              <ShoppingCart className="w-5 h-5 ml-2" />
              {product.type === "physical" && product.stock === 0
                ? "نفذت الكمية"
                : isSubscription && plans.length === 0
                ? "غير متاح حالياً"
                : "أضف إلى السلة"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useListProducts, getListProductsQueryKey } from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, Package, Tag } from "lucide-react";
import { useCart } from "@/hooks/use-cart";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";

type LegacyBanner = {
  bannerImageUrl: string | null;
  bannerTitle: string | null;
  bannerSubtitle: string | null;
  bannerCtaText: string | null;
  bannerCtaUrl: string | null;
  showCategoriesBar?: boolean;
};
type Banner = {
  id: number;
  title: string | null;
  subtitle: string | null;
  imageUrl: string;
  shape: "rectangle" | "square" | "circle";
  linkType: "url" | "product" | "category" | "none";
  linkUrl: string | null;
  linkProductId: number | null;
  linkCategoryId: number | null;
  active: boolean;
};
type Category = { id: number; name: string; slug: string; imageUrl: string | null; active: boolean };

const SHAPE_CLASS = {
  rectangle: "aspect-[16/9]",
  square: "aspect-square",
  circle: "aspect-square rounded-full",
} as const;

function bannerHref(b: Banner): string {
  if (b.linkType === "url" && b.linkUrl) return b.linkUrl;
  if (b.linkType === "product" && b.linkProductId) return `/product/${b.linkProductId}`;
  if (b.linkType === "category" && b.linkCategoryId) return `/?category=${b.linkCategoryId}`;
  return "#";
}

export default function Home() {
  const [location] = useLocation();
  const searchParams = new URLSearchParams(location.split('?')[1] || '');
  const q = searchParams.get('q') || '';
  const categoryFilter = searchParams.get('category');
  const [legacyBanner, setLegacyBanner] = useState<LegacyBanner | null>(null);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then(setLegacyBanner).catch(() => {});
    fetch("/api/banners").then((r) => r.json()).then((bs: Banner[]) => setBanners(bs.filter((b) => b.active))).catch(() => {});
    fetch("/api/categories").then((r) => r.json()).then((cs: Category[]) => setCategories(cs.filter((c) => c.active))).catch(() => {});
  }, []);

  const { data: products, isLoading } = useListProducts(
    { active: "true" },
    { query: { queryKey: getListProductsQueryKey({ active: "true" }) } }
  );

  const { addItem } = useCart();
  const { toast } = useToast();

  const filteredProducts = products?.filter(p => {
    const matchesQuery = q ? p.name.toLowerCase().includes(q.toLowerCase()) || (p.description && p.description.toLowerCase().includes(q.toLowerCase())) : true;
    const matchesCategory = categoryFilter ? String((p as any).categoryId) === categoryFilter : true;
    return matchesQuery && matchesCategory;
  });

  const handleAddToCart = (e: React.MouseEvent, product: any) => {
    e.preventDefault();
    if (product.type === 'booking') {
      window.location.href = `/product/${product.id}`;
      return;
    }
    addItem({ product, quantity: 1 });
    toast({ title: "تمت الإضافة للسلة", description: `تم إضافة ${product.name} إلى السلة بنجاح.` });
  };

  function discountInfo(p: any) {
    const dt = p.discountType;
    if (!dt || dt === "none" || !p.discountValue || p.discountValue <= 0) return null;
    const value = parseFloat(p.discountValue);
    if (dt === "percent") {
      const newPrice = p.price * (1 - value / 100);
      return { badge: `-${Math.round(value)}%`, newPrice, oldPrice: p.price };
    }
    const newPrice = Math.max(0, p.price - value);
    return { badge: `-${value} ر.س`, newPrice, oldPrice: p.price };
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {[...Array(8)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <div className="h-48 bg-muted rounded-t-lg" />
            <CardContent className="p-4">
              <div className="h-4 bg-muted rounded w-3/4 mb-2" />
              <div className="h-4 bg-muted rounded w-1/2" />
            </CardContent>
            <CardFooter className="p-4 pt-0">
              <div className="h-10 bg-muted rounded w-full" />
            </CardFooter>
          </Card>
        ))}
      </div>
    );
  }

  const showCategoriesBar = legacyBanner?.showCategoriesBar !== false && categories.length > 0;
  const activeCategoryName = categoryFilter ? categories.find((c) => String(c.id) === categoryFilter)?.name : null;

  // Banner rendering: prefer multi-banners if any, else fall back to legacy single banner.
  const renderBanners = () => {
    if (banners.length > 0) {
      const main = banners[0];
      const rest = banners.slice(1);
      return (
        <div className="space-y-4 mb-10">
          {main && (
            <Link href={bannerHref(main)}>
              <div className={`relative overflow-hidden ${SHAPE_CLASS[main.shape]} bg-muted ${main.shape !== "circle" ? "rounded-2xl" : "max-w-md mx-auto"} cursor-pointer hover:opacity-95 transition`}>
                <img src={main.imageUrl} alt={main.title || ""} className="w-full h-full object-cover" />
                {(main.title || main.subtitle) && (
                  <div className="absolute inset-0 bg-gradient-to-l from-black/70 to-transparent flex items-end p-6 md:p-10 text-white">
                    <div>
                      {main.title && <h2 className="text-2xl md:text-4xl font-extrabold">{main.title}</h2>}
                      {main.subtitle && <p className="mt-1 text-base md:text-lg opacity-90">{main.subtitle}</p>}
                    </div>
                  </div>
                )}
              </div>
            </Link>
          )}
          {rest.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {rest.map((b) => (
                <Link key={b.id} href={bannerHref(b)}>
                  <div className={`relative overflow-hidden bg-muted ${SHAPE_CLASS[b.shape]} ${b.shape !== "circle" ? "rounded-xl" : ""} cursor-pointer hover:opacity-95 transition`}>
                    <img src={b.imageUrl} alt={b.title || ""} className="w-full h-full object-cover" />
                    {b.title && (
                      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent p-3 text-white">
                        <p className="font-bold text-sm">{b.title}</p>
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      );
    }
    // Legacy single banner
    return legacyBanner?.bannerImageUrl ? (
      <section
        className="rounded-2xl overflow-hidden mb-10 border relative"
        style={{ backgroundImage: `url(${legacyBanner.bannerImageUrl})`, backgroundSize: "cover", backgroundPosition: "center", minHeight: 320 }}
      >
        <div className="bg-gradient-to-l from-black/70 to-black/30 p-8 md:p-14 text-white" style={{ minHeight: 320 }}>
          <div className="max-w-2xl">
            <h1 className="text-3xl md:text-5xl font-extrabold mb-4">{legacyBanner.bannerTitle || "اكتشف أحدث المنتجات"}</h1>
            {legacyBanner.bannerSubtitle && <p className="text-lg md:text-xl opacity-90 mb-6">{legacyBanner.bannerSubtitle}</p>}
            {legacyBanner.bannerCtaText && (
              <Button asChild size="lg" className="text-base">
                <Link href={legacyBanner.bannerCtaUrl || "/"}>{legacyBanner.bannerCtaText}</Link>
              </Button>
            )}
          </div>
        </div>
      </section>
    ) : (
      <section className="bg-primary/5 rounded-2xl p-8 md:p-12 text-center mb-10 border border-primary/10 relative overflow-hidden">
        <div className="relative z-10">
          <h1 className="text-3xl md:text-5xl font-extrabold text-foreground mb-4">{legacyBanner?.bannerTitle || "اكتشف أحدث المنتجات"}</h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto mb-6">
            {legacyBanner?.bannerSubtitle || "تسوق الآن من مجموعتنا المختارة بعناية من المنتجات الرقمية والمادية وأكثر من ذلك."}
          </p>
        </div>
      </section>
    );
  };

  return (
    <div className="space-y-6">
      {q ? (
        <h1 className="text-2xl font-bold">نتائج البحث عن: "{q}"</h1>
      ) : activeCategoryName ? (
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-2xl font-bold flex items-center gap-2"><Tag className="w-5 h-5 text-primary" /> {activeCategoryName}</h1>
          <Link href="/" className="text-sm text-muted-foreground hover:text-primary">عرض الكل ←</Link>
        </div>
      ) : (
        renderBanners()
      )}

      {showCategoriesBar && !q && (
        <div className="overflow-x-auto -mx-2 px-2 pb-2">
          <div className="flex gap-3 min-w-max">
            <Link href="/" className={`shrink-0 flex flex-col items-center gap-1 p-2 ${!categoryFilter ? "text-primary" : "text-muted-foreground"}`}>
              <div className={`h-16 w-16 rounded-full border-2 ${!categoryFilter ? "border-primary" : "border-muted"} flex items-center justify-center bg-muted/30`}>
                <Tag className="h-6 w-6" />
              </div>
              <span className="text-xs font-medium">الكل</span>
            </Link>
            {categories.map((c) => (
              <Link key={c.id} href={`/?category=${c.id}`} className={`shrink-0 flex flex-col items-center gap-1 p-2 ${categoryFilter === String(c.id) ? "text-primary" : "text-muted-foreground"}`}>
                <div className={`h-16 w-16 rounded-full border-2 overflow-hidden ${categoryFilter === String(c.id) ? "border-primary" : "border-muted"} bg-muted/30 flex items-center justify-center`}>
                  {c.imageUrl ? <img src={c.imageUrl} alt={c.name} className="w-full h-full object-cover" /> : <Tag className="h-6 w-6" />}
                </div>
                <span className="text-xs font-medium max-w-[80px] truncate">{c.name}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {filteredProducts?.length === 0 ? (
        <div className="text-center py-20">
          <Package className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">لا توجد منتجات</h2>
          <p className="text-muted-foreground">{q ? "لم نتمكن من العثور على منتجات مطابقة لبحثك." : "جرّب تصنيف آخر."}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {filteredProducts?.map((product) => {
            const disc = discountInfo(product);
            return (
              <Link key={product.id} href={`/product/${product.id}`}>
                <Card className="h-full flex flex-col hover:shadow-lg transition-all hover:-translate-y-1 hover:border-primary/30 group">
                  <div className="relative aspect-square overflow-hidden bg-muted">
                    {product.imageUrl ? (
                      <img src={product.imageUrl} alt={product.name} className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-300" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-secondary text-secondary-foreground">
                        <Package className="h-12 w-12 opacity-50" />
                      </div>
                    )}
                    {disc && (
                      <div className="absolute top-2 left-2">
                        <Badge className="bg-destructive text-destructive-foreground font-bold text-sm shadow-md">{disc.badge}</Badge>
                      </div>
                    )}
                    <div className="absolute top-2 right-2 flex flex-col gap-1">
                      <Badge variant={product.type === 'digital' ? 'default' : product.type === 'physical' ? 'secondary' : 'outline'}>
                        {product.type === 'digital' ? 'رقمي' : product.type === 'physical' ? 'مادي' : 'حجز'}
                      </Badge>
                    </div>
                  </div>
                  <CardContent className="p-4 flex-1 flex flex-col">
                    <h3 className="font-bold text-lg mb-1 line-clamp-1 group-hover:text-primary transition-colors">{product.name}</h3>
                    <div className="mt-auto flex items-baseline gap-2">
                      <div className="text-2xl font-black text-primary">
                        {(disc?.newPrice ?? product.price).toLocaleString('ar-SA')} ر.س
                      </div>
                      {disc && (
                        <div className="text-sm text-muted-foreground line-through">{disc.oldPrice.toLocaleString('ar-SA')}</div>
                      )}
                    </div>
                  </CardContent>
                  <CardFooter className="p-4 pt-0">
                    <Button className="w-full" onClick={(e) => handleAddToCart(e, product)} variant={product.type === 'booking' ? "outline" : "default"}>
                      {product.type === 'booking' ? 'عرض المواعيد' : (
                        <>
                          <ShoppingCart className="w-4 h-4 ml-2" />
                          أضف للسلة
                        </>
                      )}
                    </Button>
                  </CardFooter>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

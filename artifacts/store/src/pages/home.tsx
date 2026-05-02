import { useEffect, useState } from "react";
import { useListProducts, getListProductsQueryKey } from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, Package, Tag } from "lucide-react";
import { useCart } from "@/hooks/use-cart";
import { useToast } from "@/hooks/use-toast";

type HomeSection = {
  id: number;
  type: string;
  title: string;
  sortOrder: number;
  active: boolean;
  config: Record<string, unknown>;
};

type Banner = {
  id: number; title: string | null; subtitle: string | null; imageUrl: string;
  shape: "rectangle" | "square" | "circle"; linkType: string;
  linkUrl: string | null; linkProductId: number | null; linkCategoryId: number | null; active: boolean;
};

type Category = { id: number; name: string; slug: string; imageUrl: string | null; active: boolean };

function bannerHref(b: Banner): string {
  if (b.linkType === "url" && b.linkUrl) return b.linkUrl;
  if (b.linkType === "product" && b.linkProductId) return `/product/${b.linkProductId}`;
  if (b.linkType === "category" && b.linkCategoryId) return `/?category=${b.linkCategoryId}`;
  return "#";
}

const SHAPE_CLASS = { rectangle: "aspect-[16/9]", square: "aspect-square", circle: "aspect-square rounded-full" } as const;

export default function Home() {
  const [location] = useLocation();
  const sp = new URLSearchParams(location.split("?")[1] || "");
  const q = sp.get("q") || "";
  const categoryFilter = sp.get("category");

  const [sections, setSections] = useState<HomeSection[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [settings, setSettings] = useState<Record<string, unknown>>({});

  const { data: allProducts, isLoading } = useListProducts(
    { active: "true" },
    { query: { queryKey: getListProductsQueryKey({ active: "true" }) } }
  );
  const products = Array.isArray(allProducts) ? allProducts : [];

  const { addItem } = useCart();
  const { toast } = useToast();

  useEffect(() => {
    fetch("/api/design/sections").then(r => r.json()).then((d: unknown) => Array.isArray(d) ? setSections(d) : null).catch(() => {});
    fetch("/api/banners").then(r => r.json()).then((d: unknown) => Array.isArray(d) ? setBanners(d.filter((b: Banner) => b.active)) : null).catch(() => {});
    fetch("/api/categories").then(r => r.json()).then((d: unknown) => Array.isArray(d) ? setCategories(d.filter((c: Category) => c.active)) : null).catch(() => {});
    fetch("/api/settings").then(r => r.json()).then((d: unknown) => typeof d === "object" && d ? setSettings(d as Record<string, unknown>) : null).catch(() => {});
  }, []);

  const filteredProducts = products.filter(p => {
    const matchQ = q ? p.name.toLowerCase().includes(q.toLowerCase()) || (p.description?.toLowerCase().includes(q.toLowerCase()) ?? false) : true;
    const matchCat = categoryFilter ? String((p as Record<string, unknown>).categoryId) === categoryFilter : true;
    return matchQ && matchCat;
  });

  function discountInfo(p: (typeof products)[number]) {
    const dt = (p as Record<string, unknown>).discountType as string;
    const dv = (p as Record<string, unknown>).discountValue;
    if (!dt || dt === "none" || !dv) return null;
    const val = parseFloat(String(dv));
    if (val <= 0) return null;
    if (dt === "percent") return { badge: `-${Math.round(val)}%`, newPrice: p.price * (1 - val / 100), oldPrice: p.price };
    return { badge: `-${val} ر.س`, newPrice: Math.max(0, p.price - val), oldPrice: p.price };
  }

  const handleAddToCart = (e: React.MouseEvent, product: typeof products[number]) => {
    e.preventDefault();
    if ((product as Record<string, unknown>).type === "booking") { window.location.href = `/product/${product.id}`; return; }
    addItem({ product, quantity: 1 });
    toast({ title: "تمت الإضافة للسلة", description: `${product.name} أُضيف للسلة` });
  };

  if (q || categoryFilter) {
    return (
      <div className="space-y-6">
        {q ? <h1 className="text-2xl font-bold">نتائج البحث عن: "{q}"</h1> : (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h1 className="text-2xl font-bold flex items-center gap-2"><Tag className="w-5 h-5 text-primary" />{categories.find(c => String(c.id) === categoryFilter)?.name}</h1>
            <Link href="/" className="text-sm text-muted-foreground hover:text-primary">عرض الكل ←</Link>
          </div>
        )}
        <ProductGrid products={filteredProducts} isLoading={isLoading} onAddToCart={handleAddToCart} discountInfo={discountInfo} />
      </div>
    );
  }

  if (sections.length === 0) {
    return <FallbackHome products={filteredProducts} isLoading={isLoading} banners={banners} categories={categories} settings={settings} onAddToCart={handleAddToCart} discountInfo={discountInfo} />;
  }

  return (
    <div className="space-y-8">
      {sections.filter(s => s.active).map(s => (
        <SectionRenderer
          key={s.id}
          section={s}
          products={filteredProducts}
          isLoading={isLoading}
          banners={banners}
          categories={categories}
          settings={settings}
          onAddToCart={handleAddToCart}
          discountInfo={discountInfo}
        />
      ))}
    </div>
  );
}

function SectionRenderer({ section, products, isLoading, banners, categories, settings, onAddToCart, discountInfo }: {
  section: HomeSection;
  products: ReturnType<typeof useListProducts>["data"] extends (infer T)[] | undefined ? NonNullable<T>[] : never;
  isLoading: boolean;
  banners: Banner[];
  categories: Category[];
  settings: Record<string, unknown>;
  onAddToCart: (e: React.MouseEvent, p: ReturnType<typeof useListProducts>["data"] extends (infer T)[] | undefined ? NonNullable<T> : never) => void;
  discountInfo: (p: ReturnType<typeof useListProducts>["data"] extends (infer T)[] | undefined ? NonNullable<T> : never) => { badge: string; newPrice: number; oldPrice: number } | null;
}) {
  const cfg = section.config;

  if (section.type === "marquee") {
    return (
      <div className="overflow-hidden rounded-lg" style={{ backgroundColor: String(cfg.bgColor || "#1d4ed8") }}>
        <div className="py-2 whitespace-nowrap animate-[marquee_20s_linear_infinite]">
          <span className="text-sm font-medium px-8" style={{ color: String(cfg.textColor || "#ffffff") }}>
            {Array(6).fill(String(cfg.text || "أهلاً بكم في متجرنا 🎉")).join("   •   ")}
          </span>
        </div>
      </div>
    );
  }

  if (section.type === "hero_banner") {
    const imgUrl = cfg.imageUrl as string | undefined;
    const title = (cfg.title as string) || (settings.bannerTitle as string) || "اكتشف أحدث المنتجات";
    const subtitle = (cfg.subtitle as string) || (settings.bannerSubtitle as string) || "";
    const ctaText = (cfg.ctaText as string) || (settings.bannerCtaText as string) || "";
    const ctaUrl = (cfg.ctaUrl as string) || (settings.bannerCtaUrl as string) || "/";
    const opacity = Number(cfg.overlayOpacity ?? 50) / 100;
    const align = String(cfg.textAlign || "right");
    const textAlignClass = align === "center" ? "items-center text-center" : align === "left" ? "items-end text-left" : "items-start text-right";

    if (!imgUrl) return (
      <section className="bg-primary/5 rounded-2xl p-8 md:p-12 text-center border border-primary/10 overflow-hidden relative">
        <h1 className="text-3xl md:text-5xl font-extrabold mb-4">{title}</h1>
        {subtitle && <p className="text-muted-foreground text-lg max-w-2xl mx-auto mb-6">{subtitle}</p>}
        {ctaText && <Button asChild size="lg"><Link href={ctaUrl}>{ctaText}</Link></Button>}
      </section>
    );

    return (
      <section className="rounded-2xl overflow-hidden relative" style={{ backgroundImage: `url(${imgUrl})`, backgroundSize: "cover", backgroundPosition: "center", minHeight: 320 }}>
        <div className="inset-0 absolute" style={{ backgroundColor: `rgba(0,0,0,${opacity})` }} />
        <div className={`relative z-10 p-8 md:p-14 text-white flex flex-col ${textAlignClass}`} style={{ minHeight: 320 }}>
          <div className="max-w-2xl">
            <h1 className="text-3xl md:text-5xl font-extrabold mb-4">{title}</h1>
            {subtitle && <p className="text-lg md:text-xl opacity-90 mb-6">{subtitle}</p>}
            {ctaText && <Button size="lg" asChild className="text-base"><Link href={ctaUrl}>{ctaText}</Link></Button>}
          </div>
        </div>
      </section>
    );
  }

  if (section.type === "categories_bar") {
    if (categories.length === 0) return null;
    const showImages = cfg.showImages !== false;
    return (
      <div className="space-y-3">
        {cfg.sectionTitle && <h2 className="text-xl font-bold">{String(cfg.sectionTitle)}</h2>}
        <div className="overflow-x-auto -mx-2 px-2 pb-2">
          <div className="flex gap-3 min-w-max">
            <Link href="/" className="shrink-0 flex flex-col items-center gap-1 p-2 text-primary">
              <div className="h-16 w-16 rounded-full border-2 border-primary flex items-center justify-center bg-muted/30">
                <Tag className="h-6 w-6" />
              </div>
              <span className="text-xs font-medium">الكل</span>
            </Link>
            {categories.map(c => (
              <Link key={c.id} href={`/?category=${c.id}`} className="shrink-0 flex flex-col items-center gap-1 p-2 text-muted-foreground hover:text-primary transition-colors">
                <div className="h-16 w-16 rounded-full border-2 border-muted overflow-hidden bg-muted/30 flex items-center justify-center">
                  {showImages && c.imageUrl ? <img src={c.imageUrl} alt={c.name} className="w-full h-full object-cover" /> : <Tag className="h-6 w-6" />}
                </div>
                <span className="text-xs font-medium max-w-[80px] truncate">{c.name}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (section.type === "products_grid") {
    const limit = Number(cfg.limit || 8);
    const columns = Number(cfg.columns || 4);
    const catId = cfg.categoryId ? String(cfg.categoryId) : null;
    const filtered = catId ? products.filter(p => String((p as Record<string, unknown>).categoryId) === catId).slice(0, limit) : products.slice(0, limit);
    const colClass = columns === 2 ? "grid-cols-2" : columns === 3 ? "grid-cols-1 sm:grid-cols-2 md:grid-cols-3" : "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4";
    return (
      <div className="space-y-4">
        {cfg.sectionTitle && <h2 className="text-xl font-bold">{String(cfg.sectionTitle)}</h2>}
        <ProductGrid products={filtered} isLoading={isLoading} onAddToCart={onAddToCart} discountInfo={discountInfo} colClass={colClass} />
      </div>
    );
  }

  if (section.type === "banners_grid") {
    if (banners.length === 0) return null;
    const layout = String(cfg.layout || "2");
    const cols = layout === "1" ? "grid-cols-1" : layout === "3" ? "grid-cols-2 md:grid-cols-3" : "grid-cols-2";
    const [main, ...rest] = banners;
    return (
      <div className="space-y-3">
        {main && (
          <Link href={bannerHref(main)}>
            <div className={`relative overflow-hidden ${SHAPE_CLASS[main.shape]} bg-muted rounded-2xl cursor-pointer hover:opacity-95 transition`}>
              <img src={main.imageUrl} alt={main.title || ""} className="w-full h-full object-cover" />
              {(main.title || main.subtitle) && (
                <div className="absolute inset-0 bg-gradient-to-l from-black/70 to-transparent flex items-end p-6 md:p-10 text-white">
                  <div>
                    {main.title && <h2 className="text-2xl md:text-4xl font-extrabold">{main.title}</h2>}
                    {main.subtitle && <p className="mt-1 text-base opacity-90">{main.subtitle}</p>}
                  </div>
                </div>
              )}
            </div>
          </Link>
        )}
        {rest.length > 0 && (
          <div className={`grid ${cols} gap-3`}>
            {rest.map(b => (
              <Link key={b.id} href={bannerHref(b)}>
                <div className={`relative overflow-hidden bg-muted ${SHAPE_CLASS[b.shape]} rounded-xl cursor-pointer hover:opacity-95 transition`}>
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

  if (section.type === "icons_grid") {
    const items = (cfg.items as Array<{ id: string; imageUrl: string; label: string; linkType: string; linkValue: string }>) || [];
    if (items.length === 0) return null;
    const shape = String(cfg.shape || "circle");
    const shapeClass = shape === "circle" ? "rounded-full" : "rounded-2xl";

    const getHref = (item: { linkType: string; linkValue: string }) => {
      if (item.linkType === "category" && item.linkValue) return `/?category=${item.linkValue}`;
      if (item.linkType === "product" && item.linkValue) return `/product/${item.linkValue}`;
      return item.linkValue || "#";
    };

    return (
      <div className="space-y-3">
        {cfg.sectionTitle && <h2 className="text-xl font-bold">{String(cfg.sectionTitle)}</h2>}
        <div className="overflow-x-auto -mx-2 px-2 pb-2">
          <div className="flex gap-4 min-w-max">
            {items.map(item => (
              <Link
                key={item.id}
                href={getHref(item)}
                className="shrink-0 flex flex-col items-center gap-2 group"
              >
                <div
                  className={`w-16 h-16 ${shapeClass} overflow-hidden bg-muted border-2 border-border group-hover:border-primary transition-colors flex items-center justify-center`}
                >
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.label} className="w-full h-full object-cover" />
                  ) : (
                    <Tag className="w-7 h-7 text-muted-foreground" />
                  )}
                </div>
                {item.label && (
                  <span className="text-xs font-medium max-w-[72px] truncate text-center text-muted-foreground group-hover:text-primary transition-colors">
                    {item.label}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (section.type === "custom_text") {
    const align = String(cfg.textAlign || "right");
    return (
      <div
        className="rounded-2xl p-6 md:p-10"
        style={{ backgroundColor: String(cfg.bgColor || "transparent"), textAlign: align as "right" | "center" | "left" }}
        dangerouslySetInnerHTML={{ __html: String(cfg.content || "") }}
      />
    );
  }

  return null;
}

type Product = NonNullable<ReturnType<typeof useListProducts>["data"]>[number];

function ProductGrid({ products, isLoading, onAddToCart, discountInfo, colClass = "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4" }: {
  products: Product[];
  isLoading: boolean;
  onAddToCart: (e: React.MouseEvent, p: Product) => void;
  discountInfo: (p: Product) => { badge: string; newPrice: number; oldPrice: number } | null;
  colClass?: string;
}) {
  if (isLoading) {
    return (
      <div className={`grid ${colClass} gap-6`}>
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <div className="h-48 bg-muted rounded-t-lg" />
            <CardContent className="p-4">
              <div className="h-4 bg-muted rounded w-3/4 mb-2" />
              <div className="h-4 bg-muted rounded w-1/2" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }
  if (products.length === 0) {
    return (
      <div className="text-center py-16">
        <Package className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">لا توجد منتجات</h2>
        <p className="text-muted-foreground">لم يتم إضافة منتجات بعد.</p>
      </div>
    );
  }
  return (
    <div className={`grid ${colClass} gap-6`}>
      {products.map(product => {
        const disc = discountInfo(product);
        const pType = String((product as Record<string, unknown>).type || "");
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
                <div className="absolute top-2 right-2">
                  <Badge variant={pType === "digital" ? "default" : pType === "physical" ? "secondary" : "outline"}>
                    {pType === "digital" ? "رقمي" : pType === "physical" ? "مادي" : "حجز"}
                  </Badge>
                </div>
              </div>
              <CardContent className="p-4 flex-1 flex flex-col">
                <h3 className="font-bold text-lg mb-1 line-clamp-1 group-hover:text-primary transition-colors">{product.name}</h3>
                <div className="mt-auto flex items-baseline gap-2">
                  <div className="text-2xl font-black text-primary">
                    {(disc?.newPrice ?? product.price).toLocaleString("ar-SA")} ر.س
                  </div>
                  {disc && <div className="text-sm text-muted-foreground line-through">{disc.oldPrice.toLocaleString("ar-SA")}</div>}
                </div>
              </CardContent>
              <CardFooter className="p-4 pt-0">
                <Button className="w-full" onClick={e => onAddToCart(e, product)} variant={pType === "booking" ? "outline" : "default"}>
                  {pType === "booking" ? "عرض المواعيد" : (<><ShoppingCart className="w-4 h-4 ml-2" />أضف للسلة</>)}
                </Button>
              </CardFooter>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}

function FallbackHome({ products, isLoading, banners, categories, settings, onAddToCart, discountInfo }: {
  products: Product[];
  isLoading: boolean;
  banners: Banner[];
  categories: Category[];
  settings: Record<string, unknown>;
  onAddToCart: (e: React.MouseEvent, p: Product) => void;
  discountInfo: (p: Product) => { badge: string; newPrice: number; oldPrice: number } | null;
}) {
  return (
    <div className="space-y-8">
      {banners.length > 0 ? (
        <div className="space-y-3">
          {banners[0] && (
            <Link href={bannerHref(banners[0])}>
              <div className={`relative overflow-hidden ${SHAPE_CLASS[banners[0].shape]} bg-muted rounded-2xl cursor-pointer hover:opacity-95 transition`}>
                <img src={banners[0].imageUrl} alt={banners[0].title || ""} className="w-full h-full object-cover" />
              </div>
            </Link>
          )}
        </div>
      ) : (
        <section className="bg-primary/5 rounded-2xl p-8 md:p-12 text-center border border-primary/10">
          <h1 className="text-3xl md:text-5xl font-extrabold mb-4">{String(settings.bannerTitle || "اكتشف أحدث المنتجات")}</h1>
          {settings.bannerSubtitle && <p className="text-muted-foreground text-lg mb-6">{String(settings.bannerSubtitle)}</p>}
          {settings.bannerCtaText && <Button asChild size="lg"><Link href={String(settings.bannerCtaUrl || "/")}>{String(settings.bannerCtaText)}</Link></Button>}
        </section>
      )}
      {categories.length > 0 && (
        <div className="overflow-x-auto -mx-2 px-2 pb-2">
          <div className="flex gap-3 min-w-max">
            {categories.map(c => (
              <Link key={c.id} href={`/?category=${c.id}`} className="shrink-0 flex flex-col items-center gap-1 p-2 text-muted-foreground hover:text-primary">
                <div className="h-16 w-16 rounded-full border-2 border-muted overflow-hidden bg-muted/30 flex items-center justify-center">
                  {c.imageUrl ? <img src={c.imageUrl} alt={c.name} className="w-full h-full object-cover" /> : <Tag className="h-6 w-6" />}
                </div>
                <span className="text-xs font-medium max-w-[80px] truncate">{c.name}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
      <ProductGrid products={products} isLoading={isLoading} onAddToCart={onAddToCart} discountInfo={discountInfo} />
    </div>
  );
}

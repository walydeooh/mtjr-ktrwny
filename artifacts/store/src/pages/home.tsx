import { useListProducts, getListProductsQueryKey } from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, Package } from "lucide-react";
import { useCart } from "@/hooks/use-cart";
import { useToast } from "@/hooks/use-toast";

export default function Home() {
  const [location] = useLocation();
  const searchParams = new URLSearchParams(location.split('?')[1] || '');
  const q = searchParams.get('q') || '';

  const { data: products, isLoading } = useListProducts(
    { active: "true" },
    { query: { queryKey: getListProductsQueryKey({ active: "true" }) } }
  );

  const { addItem } = useCart();
  const { toast } = useToast();

  const filteredProducts = products?.filter(p => 
    q ? p.name.toLowerCase().includes(q.toLowerCase()) || (p.description && p.description.toLowerCase().includes(q.toLowerCase())) : true
  );

  const handleAddToCart = (e: React.MouseEvent, product: any) => {
    e.preventDefault(); // Prevent navigating to product detail
    
    if (product.type === 'booking') {
      // Direct to product page for booking
      window.location.href = `/product/${product.id}`;
      return;
    }
    
    addItem({ product, quantity: 1 });
    toast({
      title: "تمت الإضافة للسلة",
      description: `تم إضافة ${product.name} إلى السلة بنجاح.`,
    });
  };

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

  return (
    <div className="space-y-8">
      {q && (
        <h1 className="text-2xl font-bold">
          نتائج البحث عن: "{q}"
        </h1>
      )}
      
      {!q && (
        <section className="bg-primary/5 rounded-2xl p-8 md:p-12 text-center mb-12 border border-primary/10 relative overflow-hidden">
          <div className="relative z-10">
            <h1 className="text-3xl md:text-5xl font-extrabold text-foreground mb-4">
              اكتشف أحدث المنتجات
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto mb-8">
              تسوق الآن من مجموعتنا المختارة بعناية من المنتجات الرقمية والمادية وأكثر من ذلك.
            </p>
          </div>
        </section>
      )}

      {filteredProducts?.length === 0 ? (
        <div className="text-center py-20">
          <Package className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">لا توجد منتجات</h2>
          <p className="text-muted-foreground">لم نتمكن من العثور على منتجات مطابقة لبحثك.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {filteredProducts?.map((product) => (
            <Link key={product.id} href={`/product/${product.id}`}>
              <Card className="h-full flex flex-col hover:shadow-lg transition-all hover:-translate-y-1 hover:border-primary/30 group">
                <div className="relative aspect-square overflow-hidden bg-muted">
                  {product.imageUrl ? (
                    <img 
                      src={product.imageUrl} 
                      alt={product.name} 
                      className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-secondary text-secondary-foreground">
                      <Package className="h-12 w-12 opacity-50" />
                    </div>
                  )}
                  <div className="absolute top-2 right-2 flex flex-col gap-1">
                    <Badge variant={
                      product.type === 'digital' ? 'default' : 
                      product.type === 'physical' ? 'secondary' : 'outline'
                    }>
                      {product.type === 'digital' ? 'رقمي' : 
                       product.type === 'physical' ? 'مادي' : 'حجز'}
                    </Badge>
                  </div>
                </div>
                <CardContent className="p-4 flex-1 flex flex-col">
                  <h3 className="font-bold text-lg mb-1 line-clamp-1 group-hover:text-primary transition-colors">{product.name}</h3>
                  <div className="text-2xl font-black text-primary mt-auto">
                    {product.price.toLocaleString('ar-SA')} ر.س
                  </div>
                </CardContent>
                <CardFooter className="p-4 pt-0">
                  <Button 
                    className="w-full" 
                    onClick={(e) => handleAddToCart(e, product)}
                    variant={product.type === 'booking' ? "outline" : "default"}
                  >
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
          ))}
        </div>
      )}
    </div>
  );
}

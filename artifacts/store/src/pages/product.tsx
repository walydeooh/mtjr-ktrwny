import { useGetProduct, getGetProductQueryKey } from "@workspace/api-client-react";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, Package, ArrowRight } from "lucide-react";
import { useCart } from "@/hooks/use-cart";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

export default function ProductDetail() {
  const { id } = useParams();
  const productId = parseInt(id || "0", 10);
  const [, setLocation] = useLocation();
  const { addItem } = useCart();
  const { toast } = useToast();

  const { data: product, isLoading, isError } = useGetProduct(productId, {
    query: {
      enabled: !!productId,
      queryKey: getGetProductQueryKey(productId),
    }
  });

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

  const handleAddToCart = () => {
    if (product.type === 'booking') {
      // We would need a slot selector here, simplifying for now to require going to checkout
      // or handle booking logic
      toast({
        title: "تنبيه",
        description: "يرجى تحديد موعد الحجز من السلة",
      });
    }

    addItem({ product, quantity: 1 });
    toast({
      title: "تمت الإضافة للسلة",
      description: `تم إضافة ${product.name} إلى السلة بنجاح.`,
    });
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Link href="/" className="inline-flex items-center text-muted-foreground hover:text-primary transition-colors">
        <ArrowRight className="h-4 w-4 ml-1" />
        العودة للمنتجات
      </Link>
      
      <div className="grid md:grid-cols-2 gap-10">
        <div className="aspect-square rounded-3xl overflow-hidden bg-muted flex items-center justify-center border border-border/50 shadow-sm relative">
          {product.imageUrl ? (
            <img 
              src={product.imageUrl} 
              alt={product.name} 
              className="object-cover w-full h-full"
            />
          ) : (
            <Package className="h-32 w-32 text-muted-foreground/30" />
          )}
          <div className="absolute top-4 right-4">
            <Badge variant={
              product.type === 'digital' ? 'default' : 
              product.type === 'physical' ? 'secondary' : 'outline'
            } className="text-sm px-3 py-1 shadow-md">
              {product.type === 'digital' ? 'منتج رقمي' : 
               product.type === 'physical' ? 'منتج مادي' : 'خدمة حجز'}
            </Badge>
          </div>
        </div>

        <div className="flex flex-col">
          <h1 className="text-4xl font-black text-foreground mb-4">{product.name}</h1>
          <div className="text-3xl font-bold text-primary mb-6">
            {product.price.toLocaleString('ar-SA')} ر.س
          </div>
          
          <div className="prose prose-slate dark:prose-invert mb-8 flex-1">
            <h3 className="text-lg font-semibold mb-2">الوصف</h3>
            <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {product.description || "لا يوجد وصف لهذا المنتج."}
            </p>
          </div>

          <div className="space-y-4 mt-auto pt-6 border-t border-border/50">
            {product.type === 'physical' && product.stock !== null && (
              <p className="text-sm text-muted-foreground">
                المخزون المتوفر: <span className="font-bold text-foreground">{product.stock}</span>
              </p>
            )}
            
            <Button 
              size="lg" 
              className="w-full text-lg h-14" 
              onClick={handleAddToCart}
              disabled={product.type === 'physical' && product.stock === 0}
            >
              <ShoppingCart className="w-5 h-5 ml-2" />
              {product.type === 'physical' && product.stock === 0 ? 'نفذت الكمية' : 'أضف إلى السلة'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

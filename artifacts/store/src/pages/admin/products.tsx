import { useState } from "react";
import { Link } from "wouter";
import { useListProducts, useDeleteProduct, getListProductsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Search, Edit, Trash2, Package, Globe, Loader2,
  CheckCircle2, Eye, EyeOff, Sparkles,
} from "lucide-react";

const token = () => localStorage.getItem("token");

async function apiPatch(path: string, body: unknown) {
  const r = await fetch(`/api${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...(token() ? { Authorization: `Bearer ${token()}` } : {}) },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("فشل");
  return r.json();
}

type ImportResult = {
  imported: number;
  message: string;
  products: { id: number; name: string; imageUrl: string | null; price: number }[];
};

type ImportStep = "idle" | "loading" | "done" | "error";

export default function Products() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const deleteProduct = useDeleteProduct();

  // ── Import dialog state ─────────────────────────────────────────────────
  const [importOpen, setImportOpen] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [maxProducts, setMaxProducts] = useState("20");
  const [importStep, setImportStep] = useState<ImportStep>("idle");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState("");

  // @ts-ignore
  const { data: products, isLoading } = useListProducts(
    { type: typeFilter !== "all" ? typeFilter as never : undefined },
    { query: { queryKey: getListProductsQueryKey({ type: typeFilter !== "all" ? typeFilter : undefined }) } }
  );

  const handleDelete = (id: number) => {
    deleteProduct.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "تم الحذف", description: "تم حذف المنتج بنجاح" });
          queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
        },
        onError: () => toast({ variant: "destructive", title: "خطأ", description: "حدث خطأ أثناء حذف المنتج" }),
      }
    );
  };

  const handleToggleActive = async (id: number, current: boolean) => {
    try {
      await apiPatch(`/products/${id}`, { active: !current });
      queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
      toast({ title: !current ? "تم عرض المنتج" : "تم إخفاء المنتج" });
    } catch {
      toast({ variant: "destructive", title: "خطأ", description: "تعذّر تغيير حالة المنتج" });
    }
  };

  const handleImport = async () => {
    if (!importUrl.trim()) return;
    setImportStep("loading");
    setImportResult(null);
    setImportError("");
    try {
      const r = await fetch("/api/products/import-from-site", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token() ? { Authorization: `Bearer ${token()}` } : {}) },
        body: JSON.stringify({ url: importUrl.trim(), maxProducts: Number(maxProducts) }),
      });
      const data = await r.json() as ImportResult & { error?: string };
      if (!r.ok) throw new Error(data.error || "خطأ في الاستيراد");
      setImportResult(data);
      setImportStep("done");
      queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
    } catch (e) {
      setImportError((e as Error).message);
      setImportStep("error");
    }
  };

  const resetImport = () => {
    setImportStep("idle");
    setImportUrl("");
    setImportResult(null);
    setImportError("");
  };

  const filteredProducts = products?.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.category && p.category.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row justify-between gap-4 items-start sm:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">المنتجات</h1>
          <p className="text-muted-foreground mt-1">إدارة منتجات متجرك ومخزونها</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => { resetImport(); setImportOpen(true); }}>
            <Globe className="w-4 h-4 ml-2" />
            استيراد من موقع
          </Button>
          <Button asChild>
            <Link href="/admin/products/new">
              <Plus className="w-4 h-4 ml-2" />
              إضافة منتج جديد
            </Link>
          </Button>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-col sm:flex-row gap-4 items-center bg-card p-4 rounded-lg border shadow-sm">
        <div className="relative w-full sm:w-96">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="ابحث عن منتج..." value={search} onChange={e => setSearch(e.target.value)} className="pl-3 pr-10" />
        </div>
        <div className="w-full sm:w-48">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger><SelectValue placeholder="تصفية حسب النوع" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">جميع الأنواع</SelectItem>
              <SelectItem value="digital">منتج رقمي</SelectItem>
              <SelectItem value="physical">منتج مادي</SelectItem>
              <SelectItem value="booking">حجز/خدمة</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>المنتج</TableHead>
              <TableHead>السعر</TableHead>
              <TableHead>النوع</TableHead>
              <TableHead>المخزون</TableHead>
              <TableHead>الحالة</TableHead>
              <TableHead className="text-left">الإجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  <div className="animate-pulse flex flex-col items-center gap-4">
                    <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                    <div className="text-muted-foreground">جاري تحميل المنتجات...</div>
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredProducts?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12">
                  <Package className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
                  <p className="text-lg font-medium">لا توجد منتجات</p>
                  <p className="text-muted-foreground text-sm mt-1">لم يتم العثور على منتجات تطابق بحثك</p>
                </TableCell>
              </TableRow>
            ) : (
              filteredProducts?.map(product => (
                <TableRow key={product.id} className={!product.active ? "opacity-60" : ""}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded border bg-muted flex items-center justify-center overflow-hidden shrink-0">
                        {product.imageUrl ? (
                          <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                        ) : (
                          <Package className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                      <div>
                        <div className="font-medium line-clamp-1">{product.name}</div>
                        {(product as Record<string, unknown>).sourceUrl && (
                          <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Globe className="w-3 h-3" />
                            مستورد بالذكاء الاصطناعي
                          </div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">{product.price.toLocaleString("ar-SA")} ر.س</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-normal">
                      {product.type === "digital" ? "رقمي" : product.type === "physical" ? "مادي" : "حجز"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {product.type === "physical" ? (
                      <span className={product.stock === 0 ? "text-destructive font-medium" : ""}>{product.stock}</span>
                    ) : "-"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={product.active ? "default" : "outline"}
                      className={product.active ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "text-muted-foreground"}
                    >
                      {product.active ? "نشط" : "مخفي"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-left">
                    <div className="flex items-center justify-end gap-1">
                      {/* Quick toggle active/hidden */}
                      <Button
                        variant="ghost" size="icon"
                        title={product.active ? "إخفاء" : "عرض في المتجر"}
                        onClick={() => handleToggleActive(product.id, product.active)}
                        className={product.active ? "text-muted-foreground hover:text-foreground" : "text-amber-500 hover:text-amber-600"}
                      >
                        {product.active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      <Button variant="ghost" size="icon" asChild>
                        <Link href={`/admin/products/${product.id}/edit`}>
                          <Edit className="h-4 w-4" />
                        </Link>
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>هل أنت متأكد من حذف هذا المنتج؟</AlertDialogTitle>
                            <AlertDialogDescription>
                              هذا الإجراء لا يمكن التراجع عنه. سيتم حذف المنتج "{product.name}" نهائياً.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>إلغاء</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(product.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >حذف</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* ── Import Dialog ── */}
      <Dialog open={importOpen} onOpenChange={open => { setImportOpen(open); if (!open) resetImport(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-blue-500" />
              استيراد منتجات بالذكاء الاصطناعي
            </DialogTitle>
            <DialogDescription>
              أدخل رابط أي متجر إلكتروني وسيقوم الذكاء الاصطناعي باستخراج المنتجات تلقائياً.
              المنتجات المستوردة تكون مخفية حتى تقوم بعرضها.
            </DialogDescription>
          </DialogHeader>

          {/* Idle / Error state — show form */}
          {(importStep === "idle" || importStep === "error") && (
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">رابط الموقع</label>
                <Input
                  value={importUrl}
                  onChange={e => setImportUrl(e.target.value)}
                  placeholder="https://store.example.com"
                  type="url"
                  dir="ltr"
                />
                <p className="text-xs text-muted-foreground">
                  مثال: رابط المتجر الرئيسي أو صفحة المنتجات
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">الحد الأقصى للمنتجات</label>
                <Select value={maxProducts} onValueChange={setMaxProducts}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5 منتجات</SelectItem>
                    <SelectItem value="10">10 منتجات</SelectItem>
                    <SelectItem value="20">20 منتج</SelectItem>
                    <SelectItem value="30">30 منتج</SelectItem>
                    <SelectItem value="50">50 منتج</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {importStep === "error" && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
                  {importError}
                </div>
              )}
              <Button
                onClick={handleImport}
                disabled={!importUrl.trim()}
                className="w-full"
              >
                <Globe className="w-4 h-4 ml-2" />
                بدء الاستيراد
              </Button>
            </div>
          )}

          {/* Loading state */}
          {importStep === "loading" && (
            <div className="py-10 flex flex-col items-center gap-4 text-center">
              <div className="relative">
                <div className="w-16 h-16 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
                <Globe className="w-6 h-6 absolute inset-0 m-auto text-primary" />
              </div>
              <div className="space-y-1">
                <p className="font-semibold">جاري تحميل الموقع وتحليله...</p>
                <p className="text-sm text-muted-foreground">
                  قد يستغرق هذا 20-60 ثانية حسب حجم الموقع
                </p>
              </div>
              <div className="flex flex-col gap-2 text-xs text-muted-foreground w-full max-w-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                  تحميل صفحة الموقع
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                  تحليل المنتجات بالذكاء الاصطناعي
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  إضافة المنتجات للمتجر
                </div>
              </div>
            </div>
          )}

          {/* Done state */}
          {importStep === "done" && importResult && (
            <div className="space-y-4 pt-2">
              <div className="flex items-center gap-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-4 py-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <div>
                  <p className="font-semibold text-emerald-700 dark:text-emerald-400">
                    تم استيراد {importResult.imported} منتج بنجاح
                  </p>
                  <p className="text-sm text-emerald-600 dark:text-emerald-500">
                    جميعها مخفية — اضغط أيقونة العين لعرض أي منتج
                  </p>
                </div>
              </div>

              {importResult.products.length > 0 && (
                <div className="max-h-52 overflow-y-auto rounded-lg border divide-y">
                  {importResult.products.map(p => (
                    <div key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                      <div className="w-8 h-8 rounded bg-muted shrink-0 overflow-hidden flex items-center justify-center">
                        {p.imageUrl ? (
                          <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
                        ) : (
                          <Package className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{p.price.toLocaleString("ar-SA")} ر.س</p>
                      </div>
                      <Badge variant="outline" className="text-xs shrink-0">مخفي</Badge>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" onClick={resetImport} className="flex-1">استيراد موقع آخر</Button>
                <Button onClick={() => setImportOpen(false)} className="flex-1">إغلاق</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { 
  useGetProduct, 
  useCreateProduct, 
  useUpdateProduct,
  useListProductCodes,
  useAddProductCode,
  useBulkAddProductCodes,
  useGetProductAvailability,
  useAddAvailabilitySlot,
  getGetProductQueryKey,
  getListProductsQueryKey,
  getListProductCodesQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { MediaPicker } from "@/components/ui/media-picker";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { ArrowRight, Plus, Trash2, Key, Calendar, Sparkles, Tag, BookOpen } from "lucide-react";
import { Link } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const productSchema = z.object({
  name: z.string().min(2, "اسم المنتج مطلوب"),
  description: z.string().optional(),
  price: z.coerce.number().min(0, "السعر يجب أن يكون رقماً موجباً"),
  imageUrl: z.string().url("رابط الصورة غير صحيح").optional().or(z.literal("")),
  type: z.enum(["digital", "physical", "booking"]),
  category: z.string().optional(),
  categoryId: z.coerce.number().optional().nullable(),
  stock: z.coerce.number().min(0).optional().nullable(),
  active: z.boolean().default(true),
  discountType: z.enum(["none", "percent", "fixed"]).default("none"),
  discountValue: z.coerce.number().min(0).optional().nullable(),
  usageInstructionsText: z.string().optional().nullable(),
  usageInstructionsMediaUrl: z.string().optional().nullable(),
  usageInstructionsMediaType: z.enum(["image", "video"]).optional().nullable(),
  usageInstructionsLinkUrl: z.string().optional().nullable(),
});

type ProductFormValues = z.infer<typeof productSchema>;

export default function ProductForm() {
  const { id } = useParams();
  const isEditing = id !== undefined && id !== "new";
  const productId = parseInt(id || "0", 10);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: product, isLoading: isProductLoading } = useGetProduct(productId, {
    query: {
      enabled: isEditing,
      queryKey: getGetProductQueryKey(productId),
    }
  });

  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: "",
      description: "",
      price: 0,
      imageUrl: "",
      type: "physical",
      category: "",
      categoryId: null,
      stock: 0,
      active: true,
      discountType: "none",
      discountValue: 0,
      usageInstructionsText: "",
      usageInstructionsMediaUrl: "",
      usageInstructionsMediaType: null,
      usageInstructionsLinkUrl: "",
    },
  });

  const [categories, setCategories] = useState<Array<{ id: number; name: string }>>([]);
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    fetch("/api/categories").then(r => r.json()).then(setCategories).catch(() => {});
  }, []);

  async function handleImportFromUrl() {
    if (!importUrl.trim()) return;
    setImporting(true);
    try {
      const token = localStorage.getItem("token");
      const r = await fetch("/api/products/import-from-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ url: importUrl }),
      });
      if (!r.ok) {
        let serverMsg = "فشل الاستيراد";
        try {
          const errBody = await r.json();
          if (errBody?.error) serverMsg = errBody.error;
        } catch {}
        throw new Error(serverMsg);
      }
      const data = await r.json();
      if (data.name) form.setValue("name", data.name);
      if (data.description) form.setValue("description", data.description);
      if (data.imageUrl) form.setValue("imageUrl", data.imageUrl);
      if (data.price) form.setValue("price", parseFloat(data.price));
      toast({ title: "تم الاستيراد", description: "تم تعبئة الحقول من الرابط. راجع البيانات قبل الحفظ." });
      setImportUrl("");
    } catch (e) {
      toast({ variant: "destructive", title: "خطأ", description: (e as Error).message });
    } finally {
      setImporting(false);
    }
  }

  const watchType = form.watch("type");

  useEffect(() => {
    if (isEditing && product) {
      const p = product as any;
      form.reset({
        name: product.name,
        description: product.description || "",
        price: product.price,
        imageUrl: product.imageUrl || "",
        type: product.type,
        category: product.category || "",
        categoryId: p.categoryId ?? null,
        stock: product.stock,
        active: product.active,
        discountType: (p.discountType as "none" | "percent" | "fixed") || "none",
        discountValue: p.discountValue ? parseFloat(p.discountValue) : 0,
        usageInstructionsText: p.usageInstructionsText || "",
        usageInstructionsMediaUrl: p.usageInstructionsMediaUrl || "",
        usageInstructionsMediaType: p.usageInstructionsMediaType || null,
        usageInstructionsLinkUrl: p.usageInstructionsLinkUrl || "",
      });
    }
  }, [isEditing, product, form]);

  const onSubmit = (values: ProductFormValues) => {
    const cleaned = {
      ...values,
      description: values.description?.trim() || null,
      imageUrl: values.imageUrl?.trim() || null,
      category: values.category?.trim() || null,
      categoryId: values.categoryId || null,
      stock: values.type === "physical" ? (values.stock ?? 0) : null,
      discountType: values.discountType || "none",
      discountValue: values.discountType !== "none" ? (values.discountValue || 0) : 0,
      usageInstructionsText: values.usageInstructionsText?.trim() || null,
      usageInstructionsMediaUrl: values.usageInstructionsMediaUrl?.trim() || null,
      usageInstructionsMediaType: values.usageInstructionsMediaType || null,
      usageInstructionsLinkUrl: values.usageInstructionsLinkUrl?.trim() || null,
    };
    if (isEditing) {
      updateProduct.mutate(
        { id: productId, data: cleaned as any },
        {
          onSuccess: () => {
            toast({ title: "تم التحديث", description: "تم تحديث المنتج بنجاح" });
            queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetProductQueryKey(productId) });
            setLocation("/admin/products");
          },
          onError: () => toast({ variant: "destructive", title: "خطأ", description: "حدث خطأ أثناء تحديث المنتج" })
        }
      );
    } else {
      createProduct.mutate(
        { data: cleaned as any },
        {
          onSuccess: (data) => {
            toast({ title: "تمت الإضافة", description: "تم إضافة المنتج بنجاح" });
            queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
            setLocation(`/admin/products/${data.id}/edit`);
          },
          onError: () => toast({ variant: "destructive", title: "خطأ", description: "حدث خطأ أثناء إضافة المنتج" })
        }
      );
    }
  };

  // Sub-components for specific product types (Codes & Slots)
  const ProductCodes = () => {
    const [code, setCode] = useState("");
    const [bulkText, setBulkText] = useState("");
    const [showBulk, setShowBulk] = useState(false);
    const { data: codes } = useListProductCodes(productId, {
      query: { enabled: isEditing, queryKey: getListProductCodesQueryKey(productId) }
    });
    const addCode = useAddProductCode();
    const bulkAdd = useBulkAddProductCodes();

    const handleAddCode = () => {
      if (!code.trim()) return;
      addCode.mutate(
        { id: productId, data: { code } },
        {
          onSuccess: () => {
            toast({ title: "تمت الإضافة", description: "تم إضافة الكود بنجاح" });
            setCode("");
            queryClient.invalidateQueries({ queryKey: getListProductCodesQueryKey(productId) });
          }
        }
      );
    };

    const parsedBulk = bulkText.split("\n").map(s => s.trim()).filter(Boolean);
    const handleBulkAdd = () => {
      if (parsedBulk.length === 0) return;
      bulkAdd.mutate(
        { id: productId, data: { codes: parsedBulk } },
        {
          onSuccess: (res) => {
            toast({
              title: "تمت الإضافة",
              description: `أُضيف ${res.added ?? parsedBulk.length} كود${res.skipped ? ` (تخطّينا ${res.skipped} مكرر/فارغ)` : ""}`,
            });
            setBulkText("");
            setShowBulk(false);
            queryClient.invalidateQueries({ queryKey: getListProductCodesQueryKey(productId) });
          },
          onError: () => {
            toast({ title: "فشل الإضافة", description: "تعذّر إضافة الأكواد، حاول مجدداً", variant: "destructive" });
          }
        }
      );
    };

    return (
      <div className="space-y-4">
        <div className="flex gap-2">
          <Input 
            placeholder="أدخل كود رقمي جديد..." 
            value={code} 
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddCode())}
          />
          <Button onClick={handleAddCode} type="button" disabled={!code.trim() || addCode.isPending}>
            إضافة
          </Button>
        </div>

        {!showBulk ? (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => setShowBulk(true)}
          >
            إضافة مجموعة أكواد دفعة واحدة
          </Button>
        ) : (
          <div className="border rounded-md p-3 space-y-2 bg-muted/30">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">إضافة دفعة أكواد</label>
              <Button type="button" variant="ghost" size="sm" onClick={() => { setShowBulk(false); setBulkText(""); }}>
                إلغاء
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              ضع كل كود في سطر مستقل. سيتم تجاهل الأسطر الفارغة والمكررات تلقائياً.
            </p>
            <Textarea
              placeholder={"الصق الأكواد هنا، كل كود في سطر:\nCODE-1\nCODE-2\nCODE-3"}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              rows={8}
              className="font-mono"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {parsedBulk.length} كود جاهز للإضافة
              </span>
              <Button
                type="button"
                onClick={handleBulkAdd}
                disabled={parsedBulk.length === 0 || bulkAdd.isPending}
              >
                {bulkAdd.isPending ? "جارٍ الإضافة..." : `إضافة ${parsedBulk.length} كود`}
              </Button>
            </div>
          </div>
        )}

        <div className="border rounded-md divide-y">
          {codes?.map(c => (
            <div key={c.id} className="p-3 flex justify-between items-center">
              <span className="font-mono">{c.code}</span>
              <Badge variant={c.used ? "destructive" : "default"}>{c.used ? "مستخدم" : "متاح"}</Badge>
            </div>
          ))}
          {codes?.length === 0 && (
            <div className="p-6 text-center text-muted-foreground">لا توجد أكواد رقمية مضافة</div>
          )}
        </div>
      </div>
    );
  };

  const BookingSlots = () => {
    const [date, setDate] = useState("");
    const [startTime, setStartTime] = useState("");
    const [endTime, setEndTime] = useState("");
    const [maxBookings, setMaxBookings] = useState(1);
    
    // We only want availability for the specific product here but generated hook requires params
    // the backend may or may not support filtering by product ID in getProductAvailability
    // Let's use it assuming we just need to see the slots
    const addSlot = useAddAvailabilitySlot();

    const handleAddSlot = () => {
      if (!date || !startTime || !endTime) return;
      addSlot.mutate(
        { id: productId, data: { date, startTime, endTime, maxBookings } },
        {
          onSuccess: () => {
            toast({ title: "تمت الإضافة", description: "تم إضافة الموعد بنجاح" });
            // Should invalidate availability slots query here
          }
        }
      );
    };

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <div className="space-y-2 col-span-2 md:col-span-1">
            <label className="text-sm font-medium">التاريخ</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">من</label>
            <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">إلى</label>
            <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">الحد الأقصى</label>
            <Input type="number" min="1" value={maxBookings} onChange={(e) => setMaxBookings(parseInt(e.target.value))} />
          </div>
          <Button onClick={handleAddSlot} type="button" className="col-span-2 md:col-span-1">
            إضافة
          </Button>
        </div>
        <div className="p-6 text-center border rounded-md text-muted-foreground mt-4 bg-muted/20">
          يمكنك إضافة وتعديل المواعيد من صفحة الحجوزات أو تقويم المواعيد.
        </div>
      </div>
    );
  };

  if (isEditing && isProductLoading) {
    return <div className="animate-pulse h-96 bg-muted rounded-xl"></div>;
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-16">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admin/products">
            <ArrowRight className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{isEditing ? "تعديل المنتج" : "إضافة منتج جديد"}</h1>
        </div>
      </div>

      <Tabs defaultValue="general">
        <TabsList className="mb-4">
          <TabsTrigger value="general">المعلومات الأساسية</TabsTrigger>
          {isEditing && watchType === "digital" && <TabsTrigger value="codes"><Key className="w-4 h-4 mr-2" /> الأكواد الرقمية</TabsTrigger>}
          {isEditing && watchType === "booking" && <TabsTrigger value="slots"><Calendar className="w-4 h-4 mr-2" /> المواعيد المتاحة</TabsTrigger>}
        </TabsList>

        <TabsContent value="general">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <div className="grid md:grid-cols-3 gap-8">
                <div className="md:col-span-2 space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>تفاصيل المنتج</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>اسم المنتج</FormLabel>
                            <FormControl>
                              <Input placeholder="مثال: اشتراك نتفلكس، تيشيرت أسود..." {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="description"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>الوصف</FormLabel>
                            <FormControl>
                              <Textarea 
                                placeholder="اكتب وصفاً مفصلاً للمنتج..." 
                                className="min-h-[120px] resize-y" 
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>التسعير والمخزون</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid sm:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="price"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>السعر (ر.س)</FormLabel>
                              <FormControl>
                                <Input type="number" step="0.01" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        {watchType === "physical" && (
                          <FormField
                            control={form.control}
                            name="stock"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>المخزون المتوفر</FormLabel>
                                <FormControl>
                                  <Input type="number" {...field} value={field.value || ""} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>حالة المنتج</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <FormField
                        control={form.control}
                        name="active"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                            <div className="space-y-0.5">
                              <FormLabel className="text-base">تفعيل المنتج</FormLabel>
                              <FormDescription>
                                إظهار المنتج للعملاء في المتجر
                              </FormDescription>
                            </div>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="type"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>نوع المنتج</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isEditing}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="اختر نوع المنتج" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="physical">منتج مادي (يتطلب شحن)</SelectItem>
                                <SelectItem value="digital">منتج رقمي (أكواد)</SelectItem>
                                <SelectItem value="booking">حجز/خدمة (مواعيد)</SelectItem>
                              </SelectContent>
                            </Select>
                            {isEditing && <FormDescription>لا يمكن تغيير نوع المنتج بعد إنشائه</FormDescription>}
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="categoryId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="flex items-center gap-2"><Tag className="w-4 h-4" /> التصنيف</FormLabel>
                            <Select
                              value={field.value ? String(field.value) : "none"}
                              onValueChange={(v) => field.onChange(v === "none" ? null : parseInt(v, 10))}
                            >
                              <FormControl>
                                <SelectTrigger><SelectValue placeholder="بدون تصنيف" /></SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="none">بدون تصنيف</SelectItem>
                                {categories.map((c) => (
                                  <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormDescription>
                              <Link href="/admin/categories" className="text-primary hover:underline text-xs">إدارة التصنيفات</Link>
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>الخصم</CardTitle>
                      <CardDescription>إظهار سعر مخفّض مع شارة على بطاقة المنتج</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <FormField
                        control={form.control}
                        name="discountType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>نوع الخصم</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || "none"}>
                              <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                              <SelectContent>
                                <SelectItem value="none">بدون خصم</SelectItem>
                                <SelectItem value="percent">نسبة %</SelectItem>
                                <SelectItem value="fixed">قيمة ثابتة (ر.س)</SelectItem>
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )}
                      />
                      {form.watch("discountType") !== "none" && (
                        <FormField
                          control={form.control}
                          name="discountValue"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>قيمة الخصم</FormLabel>
                              <FormControl>
                                <Input type="number" step="0.01" {...field} value={field.value ?? ""} />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>الصورة الرئيسية</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <FormField
                        control={form.control}
                        name="imageUrl"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>صورة المنتج</FormLabel>
                            <FormControl>
                              <MediaPicker value={field.value || ""} onChange={field.onChange} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>

                  {!isEditing && (
                    <Card className="border-primary/30 bg-primary/5">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                          <Sparkles className="w-4 h-4 text-primary" /> استيراد من رابط
                        </CardTitle>
                        <CardDescription>الصق رابط منتج من أي متجر، وسنقوم بتعبئة الحقول تلقائياً.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <Input
                          value={importUrl}
                          onChange={(e) => setImportUrl(e.target.value)}
                          placeholder="https://example.com/product/..."
                          dir="ltr"
                          className="text-right"
                        />
                        <Button type="button" onClick={handleImportFromUrl} disabled={!importUrl.trim() || importing} className="w-full">
                          {importing ? "جاري الاستيراد..." : "استيراد البيانات"}
                        </Button>
                      </CardContent>
                    </Card>
                  )}

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <BookOpen className="w-4 h-4" /> تعليمات الاستخدام
                      </CardTitle>
                      <CardDescription>تظهر للعميل بعد شراء المنتج</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <FormField
                        control={form.control}
                        name="usageInstructionsText"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>نص التعليمات</FormLabel>
                            <FormControl>
                              <Textarea {...field} value={field.value || ""} rows={4} placeholder="مثال: قم بفتح التطبيق ثم أدخل الكود..." />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <FormField
                          control={form.control}
                          name="usageInstructionsMediaType"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>نوع الوسائط</FormLabel>
                              <Select onValueChange={(v) => field.onChange(v === "none" ? null : v)} value={field.value || "none"}>
                                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                <SelectContent>
                                  <SelectItem value="none">بدون</SelectItem>
                                  <SelectItem value="image">صورة</SelectItem>
                                  <SelectItem value="video">فيديو</SelectItem>
                                </SelectContent>
                              </Select>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="usageInstructionsMediaUrl"
                          render={({ field }) => {
                            const mediaType = form.watch("usageInstructionsMediaType");
                            return (
                              <FormItem>
                                <FormLabel>الوسائط</FormLabel>
                                <FormControl>
                                  <MediaPicker
                                    value={field.value || ""}
                                    onChange={field.onChange}
                                    accept={mediaType === "video" ? "video/*" : "image/*"}
                                    previewKind={mediaType === "video" ? "video" : "image"}
                                  />
                                </FormControl>
                              </FormItem>
                            );
                          }}
                        />
                      </div>
                      <FormField
                        control={form.control}
                        name="usageInstructionsLinkUrl"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>رابط مرجعي (اختياري)</FormLabel>
                            <FormControl><Input {...field} value={field.value || ""} dir="ltr" className="text-right" placeholder="https://..." /></FormControl>
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>
                </div>
              </div>

              <div className="flex items-center gap-4 justify-end">
                <Button variant="outline" asChild>
                  <Link href="/admin/products">إلغاء</Link>
                </Button>
                <Button type="submit" disabled={createProduct.isPending || updateProduct.isPending}>
                  {createProduct.isPending || updateProduct.isPending ? "جاري الحفظ..." : "حفظ المنتج"}
                </Button>
              </div>
            </form>
          </Form>
        </TabsContent>

        {isEditing && watchType === "digital" && (
          <TabsContent value="codes">
            <Card>
              <CardHeader>
                <CardTitle>إدارة الأكواد الرقمية</CardTitle>
                <CardDescription>أضف الأكواد التي سيتم تسليمها للعميل تلقائياً عند الشراء</CardDescription>
              </CardHeader>
              <CardContent>
                <ProductCodes />
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {isEditing && watchType === "booking" && (
          <TabsContent value="slots">
            <Card>
              <CardHeader>
                <CardTitle>إدارة المواعيد</CardTitle>
                <CardDescription>حدد الأوقات المتاحة للحجز من قبل العملاء</CardDescription>
              </CardHeader>
              <CardContent>
                <BookingSlots />
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

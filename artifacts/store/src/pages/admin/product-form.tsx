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
import { ArrowRight, Plus, Trash2, Key, Calendar } from "lucide-react";
import { Link } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const productSchema = z.object({
  name: z.string().min(2, "اسم المنتج مطلوب"),
  description: z.string().optional(),
  price: z.coerce.number().min(0, "السعر يجب أن يكون رقماً موجباً"),
  imageUrl: z.string().url("رابط الصورة غير صحيح").optional().or(z.literal("")),
  type: z.enum(["digital", "physical", "booking"]),
  category: z.string().optional(),
  stock: z.coerce.number().min(0).optional().nullable(),
  active: z.boolean().default(true),
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
      stock: 0,
      active: true,
    },
  });

  const watchType = form.watch("type");

  useEffect(() => {
    if (isEditing && product) {
      form.reset({
        name: product.name,
        description: product.description || "",
        price: product.price,
        imageUrl: product.imageUrl || "",
        type: product.type,
        category: product.category || "",
        stock: product.stock,
        active: product.active,
      });
    }
  }, [isEditing, product, form]);

  const onSubmit = (values: ProductFormValues) => {
    const cleaned = {
      ...values,
      description: values.description?.trim() || null,
      imageUrl: values.imageUrl?.trim() || null,
      category: values.category?.trim() || null,
      stock: values.type === "physical" ? (values.stock ?? 0) : null,
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
    const { data: codes } = useListProductCodes(productId, {
      query: { enabled: isEditing, queryKey: getListProductCodesQueryKey(productId) }
    });
    const addCode = useAddProductCode();

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
                        name="category"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>التصنيف</FormLabel>
                            <FormControl>
                              <Input placeholder="مثال: إلكترونيات، ملابس..." {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
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
                            <FormLabel>رابط الصورة</FormLabel>
                            <FormControl>
                              <Input placeholder="https://..." dir="ltr" className="text-right" {...field} />
                            </FormControl>
                            <FormMessage />
                            {field.value && (
                              <div className="mt-4 aspect-square rounded-md overflow-hidden border">
                                <img src={field.value} alt="Preview" className="w-full h-full object-cover" />
                              </div>
                            )}
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

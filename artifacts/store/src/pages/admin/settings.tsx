import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { 
  useGetSettings, 
  useUpdateSettings, 
  getGetSettingsQueryKey 
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Save, Store, Globe, CreditCard, Bot, MessageSquare } from "lucide-react";

const settingsSchema = z.object({
  storeName: z.string().min(2, "اسم المتجر مطلوب"),
  storeDescription: z.string().optional().nullable(),
  storeLogoUrl: z.string().url("يجب أن يكون رابط صحيح").optional().nullable().or(z.literal("")),
  storeCurrency: z.string().min(1, "العملة مطلوبة"),
  customDomain: z.string().optional().nullable(),
  paylinkApiKey: z.string().optional().nullable(),
  paylinkSecretKey: z.string().optional().nullable(),
  aiEnabled: z.boolean(),
  whatsappAutoReply: z.boolean(),
});

type SettingsFormValues = z.infer<typeof settingsSchema>;

export default function SettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useGetSettings({
    query: { queryKey: getGetSettingsQueryKey() }
  });

  const updateSettings = useUpdateSettings();

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      storeName: "",
      storeDescription: "",
      storeLogoUrl: "",
      storeCurrency: "SAR",
      customDomain: "",
      paylinkApiKey: "",
      paylinkSecretKey: "",
      aiEnabled: true,
      whatsappAutoReply: true,
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        storeName: settings.storeName,
        storeDescription: settings.storeDescription,
        storeLogoUrl: settings.storeLogoUrl,
        storeCurrency: settings.storeCurrency,
        customDomain: settings.customDomain,
        paylinkApiKey: settings.paylinkApiKey ? "••••••••••••••••" : "", // Mask real key
        paylinkSecretKey: settings.paylinkSecretKey ? "••••••••••••••••" : "", // Mask real key
        aiEnabled: settings.aiEnabled,
        whatsappAutoReply: settings.whatsappAutoReply,
      });
    }
  }, [settings, form]);

  const onSubmit = (values: SettingsFormValues) => {
    // Only send keys if they were changed from the masked value
    const payload = { ...values };
    if (payload.paylinkApiKey === "••••••••••••••••") delete payload.paylinkApiKey;
    if (payload.paylinkSecretKey === "••••••••••••••••") delete payload.paylinkSecretKey;

    updateSettings.mutate(
      { data: payload },
      {
        onSuccess: () => {
          toast({ title: "تم الحفظ", description: "تم حفظ إعدادات المتجر بنجاح" });
          queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
        },
        onError: () => {
          toast({ variant: "destructive", title: "خطأ", description: "حدث خطأ أثناء حفظ الإعدادات" });
        }
      }
    );
  };

  if (isLoading) return <div className="animate-pulse h-screen bg-muted rounded-xl"></div>;

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-16">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">إعدادات المتجر</h1>
        <p className="text-muted-foreground mt-1">إدارة معلومات المتجر وبوابات الدفع والذكاء الاصطناعي</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Store className="w-5 h-5 text-primary" />
                <CardTitle>المعلومات الأساسية</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="storeName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>اسم المتجر</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="storeCurrency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>العملة الافتراضية</FormLabel>
                      <FormControl>
                        <Input {...field} dir="ltr" className="text-right" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="storeDescription"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>وصف المتجر (SEO)</FormLabel>
                    <FormControl>
                      <Textarea {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="storeLogoUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>رابط شعار المتجر</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || ""} dir="ltr" className="text-right" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-primary" />
                <CardTitle>النطاق المخصص</CardTitle>
              </div>
              <CardDescription>اربط متجرك بنطاق خاص (مثال: store.com)</CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="customDomain"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>النطاق</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || ""} dir="ltr" placeholder="www.yourdomain.com" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-primary" />
                <CardTitle>بوابة الدفع Paylink</CardTitle>
              </div>
              <CardDescription>إعدادات الربط مع بوابات الدفع الإلكتروني</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="paylinkApiKey"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>API Key</FormLabel>
                    <FormControl>
                      <Input type="password" {...field} value={field.value || ""} dir="ltr" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="paylinkSecretKey"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Secret Key</FormLabel>
                    <FormControl>
                      <Input type="password" {...field} value={field.value || ""} dir="ltr" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-primary" />
                <CardTitle>الذكاء الاصطناعي والمحادثة</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="aiEnabled"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base flex items-center gap-2">
                        تفعيل مساعد الذكاء الاصطناعي
                        <Badge variant="secondary" className="text-[10px]">Beta</Badge>
                      </FormLabel>
                      <FormDescription>
                        السماح للمساعد الذكي بالإجابة على أسئلة العملاء حول المنتجات
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="whatsappAutoReply"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-green-600" />
                        الرد الآلي على واتساب
                      </FormLabel>
                      <FormDescription>
                        تفعيل رسائل الرد التلقائي وإدارة الطلبات عبر واتساب
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button type="submit" size="lg" disabled={updateSettings.isPending}>
              <Save className="w-4 h-4 ml-2" />
              {updateSettings.isPending ? "جاري الحفظ..." : "حفظ الإعدادات"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

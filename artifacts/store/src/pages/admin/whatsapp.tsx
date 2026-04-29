import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { arSA } from "date-fns/locale";
import { 
  useGetWhatsappStatus,
  useGetWhatsappQr,
  useDisconnectWhatsapp,
  useListWhatsappMessages,
  useSendWhatsappMessage,
  useListAutoReplies,
  useCreateAutoReply,
  useUpdateAutoReply,
  useDeleteAutoReply,
  getGetWhatsappStatusQueryKey,
  getGetWhatsappQrQueryKey,
  getListWhatsappMessagesQueryKey,
  getListAutoRepliesQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { MessageSquare, Smartphone, RefreshCw, LogOut, Send, Bot, CheckCircle2, Zap, Settings, Trash2 } from "lucide-react";

const autoReplySchema = z.object({
  trigger: z.string().min(1, "كلمة/عبارة التفعيل مطلوبة"),
  response: z.string().min(1, "نص الرد مطلوب"),
  isAi: z.boolean().default(false),
  active: z.boolean().default(true),
});

type AutoReplyFormValues = z.infer<typeof autoReplySchema>;

export default function Whatsapp() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [chatPhone, setChatPhone] = useState("");
  const [message, setMessage] = useState("");

  const { data: status, isLoading: isStatusLoading } = useGetWhatsappStatus({
    query: {
      queryKey: getGetWhatsappStatusQueryKey(),
      refetchInterval: (query) => (query.state.data as { connected?: boolean } | undefined)?.connected ? false : 3000,
    }
  });

  const { data: qrData, isLoading: isQrLoading, refetch: refetchQr } = useGetWhatsappQr({
    query: {
      queryKey: getGetWhatsappQrQueryKey(),
      enabled: !status?.connected,
      refetchInterval: 3000,
    }
  });
  const qr = qrData as { qr?: string | null; status: string } | undefined;

  const disconnectWhatsapp = useDisconnectWhatsapp();
  
  const handleDisconnect = () => {
    disconnectWhatsapp.mutate(undefined, {
      onSuccess: () => {
        toast({ title: "تم قطع الاتصال", description: "تم قطع اتصال واتساب بنجاح" });
        queryClient.invalidateQueries({ queryKey: getGetWhatsappStatusQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetWhatsappQrQueryKey() });
      },
      onError: () => {
        toast({ variant: "destructive", title: "خطأ", description: "حدث خطأ أثناء قطع الاتصال" });
      }
    });
  };

  const { data: messages } = useListWhatsappMessages(
    { phone: chatPhone || undefined },
    {
      query: {
        queryKey: getListWhatsappMessagesQueryKey({ phone: chatPhone || undefined }),
        enabled: status?.connected === true,
        refetchInterval: 10000,
      }
    }
  );

  const sendMessage = useSendWhatsappMessage();

  const handleSendMessage = () => {
    if (!chatPhone || !message.trim()) return;
    
    sendMessage.mutate(
      { data: { phone: chatPhone, message } },
      {
        onSuccess: () => {
          setMessage("");
          queryClient.invalidateQueries({ queryKey: getListWhatsappMessagesQueryKey({ phone: chatPhone }) });
        },
        onError: () => {
          toast({ variant: "destructive", title: "خطأ", description: "حدث خطأ أثناء إرسال الرسالة" });
        }
      }
    );
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <MessageSquare className="w-8 h-8 text-green-500" />
          واتساب الذكي
        </h1>
        <p className="text-muted-foreground mt-1">إدارة اتصال واتساب، المحادثات، والردود الآلية المدعومة بالذكاء الاصطناعي</p>
      </div>

      {!status?.connected ? (
        <Card className="max-w-md mx-auto mt-10 shadow-lg border-green-500/20">
          <CardHeader className="text-center pb-2">
            <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Smartphone className="w-8 h-8 text-green-500" />
            </div>
            <CardTitle className="text-2xl">ربط واتساب</CardTitle>
            <CardDescription>
              قم بمسح رمز QR من تطبيق واتساب لربط متجرك
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center p-6 pt-0">
            <div className="bg-white p-4 rounded-xl shadow-inner border w-64 h-64 flex items-center justify-center relative mt-4">
              {isQrLoading && !qr?.qr ? (
                <div className="flex flex-col items-center justify-center text-muted-foreground">
                  <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mb-4"></div>
                  <p>جاري توليد الرمز...</p>
                </div>
              ) : qr?.qr ? (
                <img src={qr.qr} alt="WhatsApp QR Code" className="w-full h-full object-contain" />
              ) : (
                <div className="text-center text-muted-foreground">
                  <p>الرمز غير متاح حالياً</p>
                </div>
              )}
            </div>
            
            <div className="mt-8 space-y-4 w-full">
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center font-bold text-foreground">1</div>
                <p>افتح تطبيق واتساب على هاتفك</p>
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center font-bold text-foreground">2</div>
                <p>اذهب إلى الإعدادات {'>'} الأجهزة المرتبطة</p>
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center font-bold text-foreground">3</div>
                <p>اضغط على "ربط جهاز" ووجه الكاميرا للرمز</p>
              </div>
            </div>
          </CardContent>
          <CardFooter className="bg-muted/30 border-t flex justify-center py-4">
            <Button variant="outline" onClick={() => refetchQr()} disabled={isQrLoading}>
              <RefreshCw className={`w-4 h-4 ml-2 ${isQrLoading ? 'animate-spin' : ''}`} />
              تحديث الرمز
            </Button>
          </CardFooter>
        </Card>
      ) : (
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-6">
            <Card className="border-green-500/20 overflow-hidden relative">
              <div className="absolute top-0 right-0 w-full h-1 bg-green-500"></div>
              <CardHeader className="pb-4">
                <CardTitle className="flex justify-between items-center text-lg">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                    متصل بنجاح
                  </div>
                  <Badge variant="outline" className="bg-green-500/10 text-green-700 border-green-500/20">نشط</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">الرقم المتصل</p>
                  <p className="font-bold text-lg" dir="ltr">{status.phone || "+966 50 000 0000"}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">الاسم</p>
                  <p className="font-medium">{status.name || "متجري"}</p>
                </div>
                {status.batteryLevel !== undefined && status.batteryLevel !== null && (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground flex justify-between">
                      <span>مستوى البطارية</span>
                      <span className={status.batteryLevel < 20 ? 'text-red-500' : 'text-green-500'}>{status.batteryLevel}%</span>
                    </p>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${status.batteryLevel < 20 ? 'bg-red-500' : 'bg-green-500'}`} 
                        style={{ width: `${status.batteryLevel}%` }}
                      ></div>
                    </div>
                  </div>
                )}
                <Button 
                  variant="destructive" 
                  className="w-full mt-4" 
                  onClick={handleDisconnect}
                  disabled={disconnectWhatsapp.isPending}
                >
                  <LogOut className="w-4 h-4 ml-2" />
                  {disconnectWhatsapp.isPending ? "جاري قطع الاتصال..." : "قطع الاتصال"}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">سجل المحادثات</CardTitle>
                <CardDescription>اكتب رقم الجوال للبحث عن رسائل</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Input 
                    placeholder="رقم الجوال للبحث..." 
                    dir="ltr"
                    className="text-right"
                    value={chatPhone}
                    onChange={(e) => setChatPhone(e.target.value)}
                  />
                  <Button variant="outline" size="icon">
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2">
            <Tabs defaultValue="chat" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="chat">
                  <MessageSquare className="w-4 h-4 ml-2" />
                  المحادثات المباشرة
                </TabsTrigger>
                <TabsTrigger value="auto-replies">
                  <Bot className="w-4 h-4 ml-2" />
                  الردود الآلية والذكاء الاصطناعي
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="chat" className="mt-4">
                <Card className="flex flex-col h-[600px] border shadow-sm">
                  <CardHeader className="py-3 px-4 border-b bg-muted/30">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        {chatPhone ? (
                          <span dir="ltr">{chatPhone}</span>
                        ) : (
                          "أدخل رقم لعرض المحادثة"
                        )}
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 p-0 overflow-hidden flex flex-col">
                    <ScrollArea className="flex-1 p-4 bg-slate-50 dark:bg-slate-900/50">
                      {messages?.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-muted-foreground/60 py-20">
                          <MessageSquare className="w-12 h-12 mb-4" />
                          <p>لا توجد رسائل سابقة مع هذا الرقم</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {messages?.map((msg) => (
                            <div 
                              key={msg.id} 
                              className={`flex flex-col ${msg.fromMe ? 'items-start' : 'items-end'}`}
                            >
                              <div 
                                className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                                  msg.fromMe 
                                    ? 'bg-green-100 text-green-900 dark:bg-green-900/30 dark:text-green-100 rounded-tr-sm' 
                                    : 'bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-100 border rounded-tl-sm'
                                } shadow-sm`}
                              >
                                {msg.body}
                              </div>
                              <span className="text-[10px] text-muted-foreground mt-1 mx-1">
                                {format(new Date(msg.timestamp), "HH:mm")}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                    <div className="p-3 bg-white dark:bg-slate-950 border-t flex gap-2">
                      <Input 
                        placeholder="اكتب رسالة..." 
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                        disabled={!chatPhone}
                        className="bg-muted/50 border-transparent focus-visible:ring-1 focus-visible:bg-white"
                      />
                      <Button 
                        size="icon" 
                        onClick={handleSendMessage}
                        disabled={!chatPhone || !message.trim() || sendMessage.isPending}
                        className="bg-green-600 hover:bg-green-700 text-white shrink-0"
                      >
                        <Send className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
              
              <TabsContent value="auto-replies" className="mt-4 space-y-4">
                <AutoRepliesManager />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      )}
    </div>
  );
}

function AutoRepliesManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<number | null>(null);

  const { data: autoReplies, isLoading } = useListAutoReplies({
    query: { queryKey: getListAutoRepliesQueryKey() }
  });

  const createAutoReply = useCreateAutoReply();
  const updateAutoReply = useUpdateAutoReply();
  const deleteAutoReply = useDeleteAutoReply();

  const form = useForm<AutoReplyFormValues>({
    resolver: zodResolver(autoReplySchema),
    defaultValues: {
      trigger: "",
      response: "",
      isAi: false,
      active: true,
    },
  });

  const onSubmit = (values: AutoReplyFormValues) => {
    if (editingId) {
      updateAutoReply.mutate(
        { id: editingId, data: values },
        {
          onSuccess: () => {
            toast({ title: "تم التحديث", description: "تم تحديث الرد الآلي بنجاح" });
            setEditingId(null);
            form.reset({ trigger: "", response: "", isAi: false, active: true });
            queryClient.invalidateQueries({ queryKey: getListAutoRepliesQueryKey() });
          }
        }
      );
    } else {
      createAutoReply.mutate(
        { data: values },
        {
          onSuccess: () => {
            toast({ title: "تمت الإضافة", description: "تم إضافة الرد الآلي بنجاح" });
            form.reset({ trigger: "", response: "", isAi: false, active: true });
            queryClient.invalidateQueries({ queryKey: getListAutoRepliesQueryKey() });
          }
        }
      );
    }
  };

  const handleEdit = (reply: any) => {
    setEditingId(reply.id);
    form.reset({
      trigger: reply.trigger,
      response: reply.response,
      isAi: reply.isAi,
      active: reply.active,
    });
    // Scroll to form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = (id: number) => {
    deleteAutoReply.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "تم الحذف", description: "تم حذف الرد الآلي بنجاح" });
          queryClient.invalidateQueries({ queryKey: getListAutoRepliesQueryKey() });
        }
      }
    );
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    form.reset({ trigger: "", response: "", isAi: false, active: true });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-500" />
            {editingId ? "تعديل الرد الآلي" : "قاعدة رد آلي جديدة"}
          </CardTitle>
          <CardDescription>أضف قواعد للرد التلقائي على العملاء عند إرسالهم كلمات معينة</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="trigger"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>كلمة التفعيل (Trigger)</FormLabel>
                      <FormControl>
                        <Input placeholder="مثال: أسعار، عنوان، دوام..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="isAi"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm h-[72px] mt-8">
                      <div className="space-y-0.5">
                        <FormLabel className="text-sm font-medium flex items-center gap-2">
                          <Bot className="w-4 h-4 text-primary" />
                          الرد باستخدام الذكاء الاصطناعي
                        </FormLabel>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="response"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {form.watch("isAi") 
                        ? "تعليمات للذكاء الاصطناعي حول كيفية الرد" 
                        : "نص الرد الدقيق"}
                    </FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder={form.watch("isAi") 
                          ? "مثال: اشرح للعميل أن ساعات الدوام من 9 ص لـ 10 م وأننا نغلق الجمعة بأسلوب ودود..." 
                          : "مرحباً! ساعات العمل لدينا من 9 صباحاً إلى 10 مساءً، يوم الجمعة عطلة."} 
                        className="resize-y" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="flex justify-end gap-2 pt-2">
                {editingId && (
                  <Button type="button" variant="outline" onClick={handleCancelEdit}>
                    إلغاء التعديل
                  </Button>
                )}
                <Button type="submit" disabled={createAutoReply.isPending || updateAutoReply.isPending}>
                  {editingId ? "حفظ التعديلات" : "إضافة القاعدة"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h3 className="text-lg font-bold">القواعد الحالية</h3>
        
        {isLoading ? (
          <div className="animate-pulse space-y-4">
            <div className="h-24 bg-muted rounded-lg w-full"></div>
            <div className="h-24 bg-muted rounded-lg w-full"></div>
          </div>
        ) : autoReplies?.length === 0 ? (
          <div className="bg-muted/30 border border-dashed rounded-lg p-8 text-center text-muted-foreground">
            لا توجد ردود آلية معدة مسبقاً
          </div>
        ) : (
          <div className="grid gap-4">
            {autoReplies?.map((reply) => (
              <Card key={reply.id} className={!reply.active ? "opacity-60" : ""}>
                <CardContent className="p-4 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="font-bold px-2 py-0.5 text-sm border">
                        {reply.trigger}
                      </Badge>
                      {reply.isAi && (
                        <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">
                          <Bot className="w-3 h-3 ml-1" />
                          ذكاء اصطناعي
                        </Badge>
                      )}
                      {!reply.active && <Badge variant="destructive">غير نشط</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {reply.response}
                    </p>
                  </div>
                  
                  <div className="flex gap-2 w-full sm:w-auto">
                    <Button variant="outline" size="sm" onClick={() => handleEdit(reply)}>
                      تعديل
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-destructive hover:bg-destructive/10"
                      onClick={() => handleDelete(reply.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

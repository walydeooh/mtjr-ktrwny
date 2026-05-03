import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useCustomerAuth } from "@/hooks/use-customer-auth";
import { useRequestCustomerOtp, useVerifyCustomerOtp, type Customer } from "@workspace/api-client-react";
import { Store, Phone, Lock, ArrowLeft, Mail, User } from "lucide-react";

type AuthResponse = { token: string; customer: Customer };

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || "حدث خطأ غير متوقع");
  }
  return r.json();
}

export default function CustomerLogin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { setSession } = useCustomerAuth();
  const requestOtp = useRequestCustomerOtp();
  const verifyOtp = useVerifyCustomerOtp();

  const params = new URLSearchParams(window.location.search);
  const redirect = params.get("redirect") || "/";

  // ---------------- WhatsApp OTP ----------------
  const [otpStep, setOtpStep] = useState<"info" | "code">("info");
  const [otpName, setOtpName] = useState("");
  const [otpPhone, setOtpPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");

  const handleRequestOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (otpName.trim().length < 2 || otpPhone.trim().length < 9) {
      toast({ variant: "destructive", title: "بيانات غير مكتملة", description: "أدخل اسمك ورقم جوالك بشكل صحيح" });
      return;
    }
    requestOtp.mutate(
      { data: { name: otpName.trim(), phone: otpPhone.trim() } },
      {
        onSuccess: () => {
          toast({ title: "تم إرسال الرمز", description: "تم إرسال رمز التحقق إلى رقمك على واتساب" });
          setOtpStep("code");
        },
        onError: (err: unknown) => {
          const e = err as { response?: { data?: { error?: string } }; data?: { error?: string }; message?: string };
          const msg = e?.response?.data?.error || e?.data?.error || e?.message || "تعذّر إرسال رمز التحقق";
          toast({ variant: "destructive", title: "خطأ", description: msg });
        },
      }
    );
  };

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (otpCode.trim().length !== 6) {
      toast({ variant: "destructive", title: "رمز غير صحيح", description: "يجب أن يتكون من 6 أرقام" });
      return;
    }
    verifyOtp.mutate(
      { data: { phone: otpPhone.trim(), code: otpCode.trim() } },
      {
        onSuccess: (data) => {
          setSession(data.token, data.customer);
          toast({ title: `أهلاً بك ${data.customer.name}`, description: "تم تسجيل الدخول بنجاح" });
          setLocation(redirect);
        },
        onError: () => toast({ variant: "destructive", title: "رمز غير صحيح", description: "تأكد من الرمز أو اطلب رمزاً جديداً" }),
      }
    );
  };

  // ---------------- Email + password login ----------------
  const [emailLogin, setEmailLogin] = useState({ email: "", password: "" });
  const [emailLoading, setEmailLoading] = useState(false);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailLoading(true);
    try {
      const data = await postJson<AuthResponse>("/api/customer-auth/login", emailLogin);
      setSession(data.token, data.customer);
      toast({ title: `أهلاً بك ${data.customer.name}`, description: "تم تسجيل الدخول بنجاح" });
      setLocation(redirect);
    } catch (err) {
      toast({ variant: "destructive", title: "تعذّر تسجيل الدخول", description: (err as Error).message });
    } finally {
      setEmailLoading(false);
    }
  };

  // ---------------- Register (name + phone + email + password) ----------------
  const [reg, setReg] = useState({ name: "", phone: "", email: "", password: "" });
  const [regLoading, setRegLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reg.name.trim().length < 2 || reg.phone.trim().length < 9 || !reg.email.includes("@") || reg.password.length < 6) {
      toast({ variant: "destructive", title: "بيانات غير صحيحة", description: "تأكد من الاسم، الجوال، البريد، وأن كلمة المرور 6 أحرف فأكثر" });
      return;
    }
    setRegLoading(true);
    try {
      const data = await postJson<AuthResponse>("/api/customer-auth/register", reg);
      setSession(data.token, data.customer);
      toast({ title: `أهلاً بك ${data.customer.name}`, description: "تم إنشاء حسابك بنجاح" });
      setLocation(redirect);
    } catch (err) {
      toast({ variant: "destructive", title: "تعذّر إنشاء الحساب", description: (err as Error).message });
    } finally {
      setRegLoading(false);
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md shadow-lg border-t-4 border-primary">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Store className="w-7 h-7 text-primary" />
          </div>
          <CardTitle className="text-2xl">تسجيل الدخول</CardTitle>
          <CardDescription>اختر طريقة الدخول المفضّلة لديك</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="otp" className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-4">
              <TabsTrigger value="otp">واتساب</TabsTrigger>
              <TabsTrigger value="email">بريد + كلمة مرور</TabsTrigger>
              <TabsTrigger value="register">إنشاء حساب</TabsTrigger>
            </TabsList>

            {/* --- WhatsApp OTP --- */}
            <TabsContent value="otp">
              {otpStep === "info" ? (
                <form onSubmit={handleRequestOtp} className="space-y-4">
                  <p className="text-sm text-muted-foreground">سنرسل لك رمز تحقق على رقم جوالك عبر واتساب</p>
                  <div className="space-y-2">
                    <Label htmlFor="otp-name">الاسم الكامل</Label>
                    <Input id="otp-name" placeholder="اسمك الكريم" value={otpName} onChange={(e) => setOtpName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="otp-phone">رقم الجوال</Label>
                    <div className="relative">
                      <Phone className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input id="otp-phone" placeholder="05XXXXXXXX" dir="ltr" className="text-right pr-10" value={otpPhone} onChange={(e) => setOtpPhone(e.target.value)} />
                    </div>
                  </div>
                  <Button type="submit" className="w-full h-12" disabled={requestOtp.isPending}>
                    {requestOtp.isPending ? "جاري الإرسال..." : "إرسال رمز التحقق"}
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleVerify} className="space-y-4">
                  <p className="text-sm text-muted-foreground">أدخل الرمز المرسل إلى {otpPhone}</p>
                  <div className="space-y-2">
                    <Label htmlFor="otp-code">رمز التحقق (6 أرقام)</Label>
                    <div className="relative">
                      <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="otp-code"
                        inputMode="numeric"
                        placeholder="000000"
                        dir="ltr"
                        className="text-center text-2xl tracking-[0.5em] pr-10 font-mono"
                        maxLength={6}
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                        autoFocus
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full h-12" disabled={verifyOtp.isPending}>
                    {verifyOtp.isPending ? "جاري التحقق..." : "تأكيد الدخول"}
                  </Button>
                  <Button type="button" variant="ghost" className="w-full" onClick={() => { setOtpStep("info"); setOtpCode(""); }}>
                    <ArrowLeft className="w-4 h-4 ml-2" /> تعديل الرقم
                  </Button>
                </form>
              )}
            </TabsContent>

            {/* --- Email + password login --- */}
            <TabsContent value="email">
              <form onSubmit={handleEmailLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="el-email">البريد الإلكتروني</Label>
                  <div className="relative">
                    <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input id="el-email" type="email" placeholder="you@example.com" dir="ltr" className="text-right pr-10" value={emailLogin.email} onChange={(e) => setEmailLogin({ ...emailLogin, email: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="el-pass">كلمة المرور</Label>
                  <div className="relative">
                    <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input id="el-pass" type="password" placeholder="••••••••" dir="ltr" className="text-right pr-10" value={emailLogin.password} onChange={(e) => setEmailLogin({ ...emailLogin, password: e.target.value })} />
                  </div>
                </div>
                <Button type="submit" className="w-full h-12 gap-2" disabled={emailLoading}>
                  <Mail className="w-4 h-4" />
                  {emailLoading ? "جاري الدخول..." : "تسجيل الدخول بالبريد وكلمة المرور"}
                </Button>
              </form>
            </TabsContent>

            {/* --- Register --- */}
            <TabsContent value="register">
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reg-name">الاسم</Label>
                  <div className="relative">
                    <User className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input id="reg-name" placeholder="اسمك الكامل" className="pr-10" value={reg.name} onChange={(e) => setReg({ ...reg, name: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-phone">رقم الجوال</Label>
                  <div className="relative">
                    <Phone className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input id="reg-phone" placeholder="05XXXXXXXX" dir="ltr" className="text-right pr-10" value={reg.phone} onChange={(e) => setReg({ ...reg, phone: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-email">البريد الإلكتروني</Label>
                  <div className="relative">
                    <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input id="reg-email" type="email" placeholder="you@example.com" dir="ltr" className="text-right pr-10" value={reg.email} onChange={(e) => setReg({ ...reg, email: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-pass">كلمة المرور (6 أحرف فأكثر)</Label>
                  <div className="relative">
                    <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input id="reg-pass" type="password" placeholder="••••••••" dir="ltr" className="text-right pr-10" value={reg.password} onChange={(e) => setReg({ ...reg, password: e.target.value })} />
                  </div>
                </div>
                <Button type="submit" className="w-full h-12" disabled={regLoading}>
                  {regLoading ? "جاري إنشاء الحساب..." : "إنشاء حساب جديد"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

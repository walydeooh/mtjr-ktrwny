import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useCustomerAuth } from "@/hooks/use-customer-auth";
import { useRequestCustomerOtp, useVerifyCustomerOtp } from "@workspace/api-client-react";
import { Store, Phone, Lock, ArrowLeft } from "lucide-react";

export default function CustomerLogin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { setSession } = useCustomerAuth();
  const requestOtp = useRequestCustomerOtp();
  const verifyOtp = useVerifyCustomerOtp();

  const [step, setStep] = useState<"info" | "code">("info");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");

  const params = new URLSearchParams(window.location.search);
  const redirect = params.get("redirect") || "/";

  const handleRequestOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2 || phone.trim().length < 9) {
      toast({ variant: "destructive", title: "بيانات غير مكتملة", description: "أدخل اسمك ورقم جوالك بشكل صحيح" });
      return;
    }
    requestOtp.mutate(
      { data: { name: name.trim(), phone: phone.trim() } },
      {
        onSuccess: () => {
          toast({ title: "تم إرسال الرمز", description: "تم إرسال رمز التحقق إلى رقمك على واتساب" });
          setStep("code");
        },
        onError: () => toast({ variant: "destructive", title: "خطأ", description: "تعذّر إرسال رمز التحقق. تأكد من ربط واتساب المتجر." }),
      }
    );
  };

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim().length !== 6) {
      toast({ variant: "destructive", title: "رمز غير صحيح", description: "يجب أن يتكون من 6 أرقام" });
      return;
    }
    verifyOtp.mutate(
      { data: { phone: phone.trim(), code: code.trim() } },
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

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <Card className="w-full max-w-md shadow-lg border-t-4 border-primary">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Store className="w-7 h-7 text-primary" />
          </div>
          <CardTitle className="text-2xl">{step === "info" ? "تسجيل الدخول" : "أدخل رمز التحقق"}</CardTitle>
          <CardDescription>
            {step === "info"
              ? "سنرسل لك رمز تحقق على رقم جوالك عبر واتساب"
              : `أدخل الرمز المرسل إلى ${phone}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === "info" ? (
            <form onSubmit={handleRequestOtp} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">الاسم الكامل</Label>
                <Input id="name" placeholder="اسمك الكريم" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">رقم الجوال</Label>
                <div className="relative">
                  <Phone className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input id="phone" placeholder="05XXXXXXXX" dir="ltr" className="text-right pr-10" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
              </div>
              <Button type="submit" className="w-full h-12" disabled={requestOtp.isPending}>
                {requestOtp.isPending ? "جاري الإرسال..." : "إرسال رمز التحقق"}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerify} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="code">رمز التحقق (6 أرقام)</Label>
                <div className="relative">
                  <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="code"
                    inputMode="numeric"
                    placeholder="000000"
                    dir="ltr"
                    className="text-center text-2xl tracking-[0.5em] pr-10 font-mono"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    autoFocus
                  />
                </div>
              </div>
              <Button type="submit" className="w-full h-12" disabled={verifyOtp.isPending}>
                {verifyOtp.isPending ? "جاري التحقق..." : "تأكيد الدخول"}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => { setStep("info"); setCode(""); }}>
                <ArrowLeft className="w-4 h-4 ml-2" /> تعديل الرقم
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

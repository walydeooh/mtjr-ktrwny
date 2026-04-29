import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useCustomerAuth } from "@/hooks/use-customer-auth";
import { Share2, CheckCircle2, Clock, XCircle, ArrowLeft } from "lucide-react";

type Application = {
  id: number;
  status: "pending" | "approved" | "rejected";
  name: string;
  phone: string;
  createdAt: string;
};

async function api(path: string, init?: RequestInit) {
  const token = localStorage.getItem("customer_token");
  const r = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init?.headers || {}) },
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || "خطأ");
  return r.json();
}

export default function AffiliatePage() {
  const { customer, isAuthenticated } = useCustomerAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(true);
  const [existing, setExisting] = useState<Application | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    iban: "",
    ibanName: "",
    notes: "",
  });

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then((s) => setEnabled(s.affiliateEnabled !== false)).catch(() => {});
  }, []);

  useEffect(() => {
    if (customer) setForm((f) => ({ ...f, name: f.name || customer.name, phone: f.phone || customer.phone }));
  }, [customer]);

  useEffect(() => {
    if (!isAuthenticated) return;
    api("/affiliate-applications/me").then(setExisting).catch(() => {});
    api("/affiliate-applications/me/dashboard").then((d) => {
      if (d?.approved) setLocation("/affiliate/dashboard");
    }).catch(() => {});
  }, [isAuthenticated, setLocation]);

  async function submit() {
    if (!isAuthenticated) {
      setLocation("/login?redirect=/affiliate");
      return;
    }
    try {
      await api("/affiliate-applications", { method: "POST", body: JSON.stringify({
        name: form.name,
        phone: form.phone,
        email: form.email || null,
        iban: form.iban,
        ibanName: form.ibanName,
        notes: form.notes || null,
      })});
      toast({ title: "تم إرسال طلبك", description: "سنراجعه ونعود إليك خلال 24-48 ساعة." });
      setSubmitted(true);
    } catch (e) { toast({ variant: "destructive", title: "خطأ", description: (e as Error).message }); }
  }

  if (!enabled) {
    return (
      <Card className="max-w-2xl mx-auto mt-12">
        <CardContent className="p-12 text-center">
          <p className="text-muted-foreground">برنامج المسوّقين غير مُفعّل حالياً.</p>
        </CardContent>
      </Card>
    );
  }

  if (existing && (existing.status === "pending" || submitted)) {
    return (
      <Card className="max-w-2xl mx-auto mt-12">
        <CardContent className="p-12 text-center">
          <Clock className="w-16 h-16 mx-auto text-amber-500 mb-4" />
          <h2 className="text-2xl font-bold mb-2">طلبك قيد المراجعة</h2>
          <p className="text-muted-foreground">سنتواصل معك خلال 24-48 ساعة على الرقم {existing?.phone || form.phone}.</p>
        </CardContent>
      </Card>
    );
  }

  if (existing && existing.status === "rejected") {
    return (
      <Card className="max-w-2xl mx-auto mt-12">
        <CardContent className="p-12 text-center">
          <XCircle className="w-16 h-16 mx-auto text-destructive mb-4" />
          <h2 className="text-2xl font-bold mb-2">تم رفض طلبك</h2>
          <p className="text-muted-foreground">للمزيد من المعلومات يمكنك التواصل مع إدارة المتجر.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Card className="bg-gradient-to-l from-primary/10 to-transparent border-primary/20">
        <CardHeader>
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0">
              <Share2 className="w-7 h-7" />
            </div>
            <div>
              <CardTitle className="text-2xl">انضم لبرنامج المسوّقين</CardTitle>
              <CardDescription className="mt-2 text-base">
                اربح عمولة من كل عملية شراء تتم عبر رابطك المخصص. كلما زادت مبيعاتك، زاد دخلك.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-3 gap-4 text-sm">
            <div className="rounded-lg bg-background p-3 border">
              <CheckCircle2 className="w-5 h-5 text-primary mb-2" />
              <p className="font-semibold mb-1">رابط مخصص</p>
              <p className="text-muted-foreground text-xs">شارك رابطك مع متابعينك</p>
            </div>
            <div className="rounded-lg bg-background p-3 border">
              <CheckCircle2 className="w-5 h-5 text-primary mb-2" />
              <p className="font-semibold mb-1">عمولة على كل طلب</p>
              <p className="text-muted-foreground text-xs">نسبة من قيمة الطلبات المؤكدة</p>
            </div>
            <div className="rounded-lg bg-background p-3 border">
              <CheckCircle2 className="w-5 h-5 text-primary mb-2" />
              <p className="font-semibold mb-1">دفعات منتظمة</p>
              <p className="text-muted-foreground text-xs">حوالة بنكية على آيبانك</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>قدّم طلبك الآن</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {!isAuthenticated && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-900 p-3 text-sm">
              يجب <Link href="/login?redirect=/affiliate" className="font-bold underline">تسجيل الدخول</Link> أولاً لتقديم الطلب.
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-3">
            <div><Label>الاسم *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>الجوال *</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} dir="ltr" className="text-right" /></div>
          </div>
          <div><Label>البريد الإلكتروني (اختياري)</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} dir="ltr" className="text-right" /></div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div><Label>الآيبان (IBAN) لاستلام العمولات *</Label><Input value={form.iban} onChange={(e) => setForm({ ...form, iban: e.target.value })} placeholder="SA00..." dir="ltr" className="text-right font-mono" /></div>
            <div><Label>اسم صاحب الآيبان *</Label><Input value={form.ibanName} onChange={(e) => setForm({ ...form, ibanName: e.target.value })} /></div>
          </div>
          <div><Label>كيف ستسوّق المتجر؟ (اختياري)</Label><Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="مثال: عبر حساباتي في انستغرام وتويتر، عدد المتابعين..." /></div>
          <div className="flex justify-end pt-2">
            <Button size="lg" onClick={submit} disabled={!form.name || !form.phone || !form.iban || !form.ibanName}>
              إرسال الطلب
              <ArrowLeft className="w-4 h-4 mr-2" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

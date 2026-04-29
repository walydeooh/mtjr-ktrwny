import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Palette, Phone, Banknote } from "lucide-react";
import { Switch } from "@/components/ui/switch";

type Settings = {
  storeName: string;
  storeDescription: string | null;
  storeLogoUrl: string | null;
  themePrimaryColor: string;
  themeSecondaryColor: string;
  bannerImageUrl: string | null;
  bannerTitle: string | null;
  bannerSubtitle: string | null;
  bannerCtaText: string | null;
  bannerCtaUrl: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  contactAddress: string | null;
  socialInstagram: string | null;
  socialTwitter: string | null;
  socialTiktok: string | null;
  socialSnapchat: string | null;
  bankTransferEnabled: boolean;
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountIban: string | null;
  bankInstructions: string | null;
};

async function api(path: string, init?: RequestInit) {
  const token = localStorage.getItem("token");
  const r = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init?.headers || {}) },
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || "خطأ");
  return r.json();
}

export default function Design() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const { toast } = useToast();

  async function load() {
    try { setSettings(await api("/settings")); }
    catch (e) { toast({ variant: "destructive", title: "خطأ", description: (e as Error).message }); }
  }
  useEffect(() => { void load(); }, []);

  function set<K extends keyof Settings>(k: K, v: Settings[K]) {
    if (!settings) return;
    setSettings({ ...settings, [k]: v });
  }

  async function save() {
    if (!settings) return;
    try {
      await api("/settings", { method: "PATCH", body: JSON.stringify(settings) });
      toast({ title: "تم الحفظ", description: "سيتم تطبيق التصميم الجديد فوراً" });
    } catch (e) { toast({ variant: "destructive", title: "خطأ", description: (e as Error).message }); }
  }

  if (!settings) return <div className="text-center py-12">جاري التحميل...</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Palette className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">تصميم المتجر</h1>
          <p className="text-muted-foreground mt-1">خصّص ألوان متجرك والبانر الترويجي</p>
        </div>
      </div>

      <Card className="p-6 space-y-4">
        <h2 className="text-xl font-semibold">الألوان</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>اللون الأساسي</Label>
            <div className="flex gap-2">
              <Input type="color" value={settings.themePrimaryColor} onChange={(e) => set("themePrimaryColor", e.target.value)} className="w-16 h-10 p-1" />
              <Input value={settings.themePrimaryColor} onChange={(e) => set("themePrimaryColor", e.target.value)} className="font-mono" />
            </div>
          </div>
          <div>
            <Label>اللون الثانوي</Label>
            <div className="flex gap-2">
              <Input type="color" value={settings.themeSecondaryColor} onChange={(e) => set("themeSecondaryColor", e.target.value)} className="w-16 h-10 p-1" />
              <Input value={settings.themeSecondaryColor} onChange={(e) => set("themeSecondaryColor", e.target.value)} className="font-mono" />
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="text-xl font-semibold">البانر الترويجي (الصفحة الرئيسية)</h2>
        <div>
          <Label>صورة البانر (URL)</Label>
          <Input value={settings.bannerImageUrl || ""} onChange={(e) => set("bannerImageUrl", e.target.value || null)} placeholder="https://..." />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>العنوان</Label>
            <Input value={settings.bannerTitle || ""} onChange={(e) => set("bannerTitle", e.target.value || null)} placeholder="اكتشف منتجاتنا الجديدة" />
          </div>
          <div>
            <Label>العنوان الفرعي</Label>
            <Input value={settings.bannerSubtitle || ""} onChange={(e) => set("bannerSubtitle", e.target.value || null)} placeholder="عروض حصرية لفترة محدودة" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>نص الزر</Label>
            <Input value={settings.bannerCtaText || ""} onChange={(e) => set("bannerCtaText", e.target.value || null)} placeholder="تسوّق الآن" />
          </div>
          <div>
            <Label>رابط الزر</Label>
            <Input value={settings.bannerCtaUrl || ""} onChange={(e) => set("bannerCtaUrl", e.target.value || null)} placeholder="/" />
          </div>
        </div>
        {settings.bannerImageUrl && (
          <div className="rounded-lg overflow-hidden border" style={{ backgroundImage: `url(${settings.bannerImageUrl})`, backgroundSize: "cover", backgroundPosition: "center", minHeight: 240 }}>
            <div className="w-full h-full bg-black/50 p-8 flex flex-col justify-center text-white" style={{ minHeight: 240 }}>
              {settings.bannerTitle && <h3 className="text-3xl font-bold mb-2">{settings.bannerTitle}</h3>}
              {settings.bannerSubtitle && <p className="text-lg opacity-90">{settings.bannerSubtitle}</p>}
              {settings.bannerCtaText && <Button className="mt-4 w-fit" style={{ backgroundColor: settings.themePrimaryColor }}>{settings.bannerCtaText}</Button>}
            </div>
          </div>
        )}
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="text-xl font-semibold">شعار ووصف المتجر</h2>
        <div>
          <Label>اسم المتجر</Label>
          <Input value={settings.storeName} onChange={(e) => set("storeName", e.target.value)} />
        </div>
        <div>
          <Label>وصف المتجر</Label>
          <Textarea rows={3} value={settings.storeDescription || ""} onChange={(e) => set("storeDescription", e.target.value || null)} />
        </div>
        <div>
          <Label>رابط الشعار</Label>
          <Input value={settings.storeLogoUrl || ""} onChange={(e) => set("storeLogoUrl", e.target.value || null)} placeholder="https://..." />
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2"><Phone className="h-5 w-5" /><h2 className="text-xl font-semibold">معلومات التواصل (تظهر في التذييل)</h2></div>
        <div className="grid grid-cols-2 gap-4">
          <div><Label>رقم الجوال</Label><Input value={settings.contactPhone || ""} onChange={(e) => set("contactPhone", e.target.value || null)} placeholder="966500000000" /></div>
          <div><Label>البريد الإلكتروني</Label><Input type="email" value={settings.contactEmail || ""} onChange={(e) => set("contactEmail", e.target.value || null)} /></div>
        </div>
        <div><Label>العنوان</Label><Input value={settings.contactAddress || ""} onChange={(e) => set("contactAddress", e.target.value || null)} placeholder="الرياض، المملكة العربية السعودية" /></div>
        <h3 className="font-semibold pt-2">حسابات التواصل الاجتماعي</h3>
        <div className="grid grid-cols-2 gap-4">
          <div><Label>إنستغرام</Label><Input value={settings.socialInstagram || ""} onChange={(e) => set("socialInstagram", e.target.value || null)} placeholder="@username" /></div>
          <div><Label>تويتر / X</Label><Input value={settings.socialTwitter || ""} onChange={(e) => set("socialTwitter", e.target.value || null)} placeholder="@username" /></div>
          <div><Label>تيك توك</Label><Input value={settings.socialTiktok || ""} onChange={(e) => set("socialTiktok", e.target.value || null)} placeholder="@username" /></div>
          <div><Label>سناب شات</Label><Input value={settings.socialSnapchat || ""} onChange={(e) => set("socialSnapchat", e.target.value || null)} placeholder="username" /></div>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2"><Banknote className="h-5 w-5" /><h2 className="text-xl font-semibold">الدفع بالتحويل البنكي</h2></div>
        <div className="flex items-center justify-between">
          <Label>تفعيل التحويل البنكي كوسيلة دفع</Label>
          <Switch checked={settings.bankTransferEnabled} onCheckedChange={(v) => set("bankTransferEnabled", v)} />
        </div>
        {settings.bankTransferEnabled && <>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>اسم البنك</Label><Input value={settings.bankName || ""} onChange={(e) => set("bankName", e.target.value || null)} placeholder="البنك الأهلي" /></div>
            <div><Label>اسم صاحب الحساب</Label><Input value={settings.bankAccountName || ""} onChange={(e) => set("bankAccountName", e.target.value || null)} /></div>
          </div>
          <div><Label>رقم الآيبان (IBAN)</Label><Input value={settings.bankAccountIban || ""} onChange={(e) => set("bankAccountIban", e.target.value || null)} placeholder="SA0000000000000000000000" className="font-mono" dir="ltr" /></div>
          <div><Label>تعليمات إضافية للعميل</Label><Textarea rows={3} value={settings.bankInstructions || ""} onChange={(e) => set("bankInstructions", e.target.value || null)} placeholder="بعد التحويل، أرسل صورة الإيصال على الواتساب..." /></div>
        </>}
      </Card>

      <div className="flex justify-end sticky bottom-4">
        <Button size="lg" onClick={save} className="shadow-lg">حفظ التغييرات</Button>
      </div>
    </div>
  );
}

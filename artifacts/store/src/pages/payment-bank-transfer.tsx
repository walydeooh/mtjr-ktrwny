import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Banknote, Copy, Check, MessageCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Settings = {
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountIban: string | null;
  bankInstructions: string | null;
  contactPhone: string | null;
  storeName: string;
};

export default function BankTransferPage() {
  const [location] = useLocation();
  const params = new URLSearchParams(location.split("?")[1] || "");
  const orderId = params.get("orderId");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then(setSettings).catch(() => {});
  }, []);

  function copyIban() {
    if (!settings?.bankAccountIban) return;
    navigator.clipboard.writeText(settings.bankAccountIban);
    setCopied(true);
    toast({ title: "تم نسخ الآيبان" });
    setTimeout(() => setCopied(false), 2000);
  }

  const waLink = settings?.contactPhone
    ? `https://wa.me/${settings.contactPhone.replace(/\D/g, "")}?text=${encodeURIComponent(`السلام عليكم، أرسل لكم إيصال التحويل البنكي للطلب رقم #${orderId}`)}`
    : null;

  return (
    <div className="max-w-2xl mx-auto py-8">
      <Card>
        <CardHeader className="text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 text-primary mx-auto flex items-center justify-center mb-4">
            <Banknote className="h-8 w-8" />
          </div>
          <CardTitle className="text-2xl">تعليمات التحويل البنكي</CardTitle>
          <p className="text-muted-foreground mt-2">طلبك رقم #{orderId} في انتظار التحويل</p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
            <h3 className="font-bold">تفاصيل الحساب</h3>
            {settings?.bankName && <div className="flex justify-between"><span className="text-muted-foreground">البنك:</span><span className="font-semibold">{settings.bankName}</span></div>}
            {settings?.bankAccountName && <div className="flex justify-between"><span className="text-muted-foreground">صاحب الحساب:</span><span className="font-semibold">{settings.bankAccountName}</span></div>}
            {settings?.bankAccountIban && (
              <div className="pt-2 border-t">
                <span className="text-sm text-muted-foreground">الآيبان (IBAN):</span>
                <div className="flex items-center gap-2 mt-1">
                  <code className="flex-1 bg-background border rounded px-3 py-2 font-mono text-sm" dir="ltr">{settings.bankAccountIban}</code>
                  <Button variant="outline" size="icon" onClick={copyIban}>{copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}</Button>
                </div>
              </div>
            )}
          </div>

          {settings?.bankInstructions && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              {settings.bankInstructions}
            </div>
          )}

          <div className="rounded-lg border p-4 text-sm space-y-2">
            <p className="font-semibold">خطوات إتمام الطلب:</p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>قم بتحويل المبلغ المطلوب إلى الحساب أعلاه.</li>
              <li>أرسل لنا صورة الإيصال على الواتساب مع رقم الطلب #{orderId}.</li>
              <li>سيتم تأكيد طلبك خلال 24 ساعة كحد أقصى.</li>
            </ol>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            {waLink && (
              <Button asChild size="lg" className="bg-green-600 hover:bg-green-700">
                <a href={waLink} target="_blank" rel="noreferrer"><MessageCircle className="ml-2 h-5 w-5" /> إرسال الإيصال عبر واتساب</a>
              </Button>
            )}
            <Button asChild size="lg" variant="outline">
              <Link href="/my-orders">عرض طلباتي</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

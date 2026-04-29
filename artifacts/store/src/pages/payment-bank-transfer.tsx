import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Banknote, Copy, Check, MessageCircle, Upload, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Settings = { contactPhone: string | null; storeName: string };
type BankAccount = {
  id: number;
  bankName: string;
  accountName: string;
  accountNumber: string | null;
  iban: string;
  logoUrl: string | null;
};

async function api(path: string, init?: RequestInit) {
  const r = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || "خطأ");
  return r.json();
}

export default function BankTransferPage() {
  const [location] = useLocation();
  const params = new URLSearchParams(location.split("?")[1] || "");
  const orderId = params.get("orderId");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [selectedBank, setSelectedBank] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then(setSettings).catch(() => {});
    fetch("/api/bank-accounts").then((r) => r.json()).then((bs: BankAccount[]) => {
      setBanks(bs);
      if (bs.length > 0 && bs[0]) setSelectedBank(bs[0].id);
    }).catch(() => {});
  }, []);

  const bank = banks.find((b) => b.id === selectedBank) || null;

  function copyIban() {
    if (!bank?.iban) return;
    navigator.clipboard.writeText(bank.iban);
    setCopied(true);
    toast({ title: "تم نسخ الآيبان" });
    setTimeout(() => setCopied(false), 2000);
  }

  async function submitReceipt() {
    if (!orderId) return;
    setSubmitting(true);
    try {
      await api(`/payments/${orderId}/bank-transfer`, {
        method: "POST",
        body: JSON.stringify({ receiptUrl: receiptUrl || null }),
      });
      setSubmitted(true);
      toast({ title: "تم استلام الإشعار", description: "سنراجع التحويل ونؤكد طلبك قريباً." });
    } catch (e) {
      toast({ variant: "destructive", title: "خطأ", description: (e as Error).message });
    } finally {
      setSubmitting(false);
    }
  }

  const waLink = settings?.contactPhone
    ? `https://wa.me/${settings.contactPhone.replace(/\D/g, "")}?text=${encodeURIComponent(`السلام عليكم، أرسل لكم إيصال التحويل البنكي للطلب رقم #${orderId}`)}`
    : null;

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto py-8">
        <Card>
          <CardContent className="p-12 text-center">
            <CheckCircle2 className="w-16 h-16 mx-auto text-green-600 mb-4" />
            <h2 className="text-2xl font-bold mb-2">تم استلام إشعار التحويل</h2>
            <p className="text-muted-foreground mb-6">سيتم تأكيد طلبك #{orderId} خلال 24 ساعة كحد أقصى.</p>
            <Button asChild><Link href="/my-orders">عرض طلباتي</Link></Button>
          </CardContent>
        </Card>
      </div>
    );
  }

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
          {banks.length === 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-900 p-4 text-sm text-center">
              لم تُضف حسابات بنكية بعد. تواصل مع المتجر للحصول على بيانات التحويل.
            </div>
          ) : (
            <>
              {banks.length > 1 && (
                <div>
                  <Label className="mb-2 block">اختر البنك المفضّل لديك:</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {banks.map((b) => (
                      <button
                        key={b.id}
                        onClick={() => setSelectedBank(b.id)}
                        className={`text-right p-3 rounded-lg border-2 transition flex items-center gap-3 ${selectedBank === b.id ? "border-primary bg-primary/5" : "hover:border-muted-foreground/30"}`}
                      >
                        {b.logoUrl ? <img src={b.logoUrl} alt={b.bankName} className="h-8 w-8 object-contain" /> : <Banknote className="h-6 w-6 text-muted-foreground" />}
                        <span className="font-semibold text-sm">{b.bankName}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {bank && (
                <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                  <h3 className="font-bold flex items-center gap-2"><Banknote className="w-4 h-4" /> {bank.bankName}</h3>
                  <div className="flex justify-between"><span className="text-muted-foreground">صاحب الحساب:</span><span className="font-semibold">{bank.accountName}</span></div>
                  {bank.accountNumber && <div className="flex justify-between"><span className="text-muted-foreground">رقم الحساب:</span><span className="font-mono text-sm" dir="ltr">{bank.accountNumber}</span></div>}
                  <div className="pt-2 border-t">
                    <span className="text-sm text-muted-foreground">الآيبان (IBAN):</span>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="flex-1 bg-background border rounded px-3 py-2 font-mono text-sm" dir="ltr">{bank.iban}</code>
                      <Button variant="outline" size="icon" onClick={copyIban}>{copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}</Button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          <div className="rounded-lg border p-4 text-sm space-y-2">
            <p className="font-semibold">خطوات إتمام الطلب:</p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>قم بتحويل المبلغ المطلوب إلى الحساب أعلاه.</li>
              <li>الصق رابط صورة الإيصال أدناه ثم أرسله — أو أرسل صورة عبر واتساب.</li>
              <li>سيتم تأكيد طلبك خلال 24 ساعة كحد أقصى وستصلك رسالة على واتساب.</li>
            </ol>
          </div>

          <div className="rounded-lg border-2 border-primary/30 p-4 space-y-3 bg-primary/5">
            <Label className="font-bold flex items-center gap-2"><Upload className="w-4 h-4" /> أرسل إشعار التحويل</Label>
            <Input value={receiptUrl} onChange={(e) => setReceiptUrl(e.target.value)} placeholder="رابط صورة الإيصال (اختياري)" dir="ltr" className="text-right" />
            <Button onClick={submitReceipt} disabled={submitting} className="w-full" size="lg">
              {submitting ? "جاري الإرسال..." : "أرسلت التحويل — أبلغ الإدارة"}
            </Button>
            <p className="text-xs text-muted-foreground text-center">سيتم إعلام الإدارة فوراً لمراجعة طلبك.</p>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            {waLink && (
              <Button asChild size="lg" variant="outline" className="border-green-600 text-green-700 hover:bg-green-50">
                <a href={waLink} target="_blank" rel="noreferrer"><MessageCircle className="ml-2 h-5 w-5" /> أرسل صورة عبر واتساب</a>
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

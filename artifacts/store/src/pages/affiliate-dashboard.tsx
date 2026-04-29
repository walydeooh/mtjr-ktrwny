import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useCustomerAuth } from "@/hooks/use-customer-auth";
import { Share2, Copy, Wallet, TrendingUp, Users, ExternalLink } from "lucide-react";

type Dashboard = {
  approved: boolean;
  affiliate?: {
    id: number;
    name: string;
    code: string;
    commissionPercent: number;
    minPayoutAmount: number;
    totalEarned: number;
    totalPaid: number;
    balance: number;
    iban: string | null;
    ibanName: string | null;
  };
  referrals?: Array<{ id: number; orderId: number; commissionAmount: number; status: string; createdAt: string }>;
  payouts?: Array<{ id: number; amount: number; notes: string | null; createdAt: string }>;
};

async function api(path: string) {
  const token = localStorage.getItem("customer_token");
  const r = await fetch(`/api${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || "خطأ");
  return r.json();
}

export default function AffiliateDashboard() {
  const { isAuthenticated } = useCustomerAuth();
  const [, setLocation] = useLocation();
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    if (!isAuthenticated) { setLocation("/login?redirect=/affiliate/dashboard"); return; }
    api("/affiliate-applications/me/dashboard")
      .then((d) => { setData(d); if (!d?.approved) setLocation("/affiliate"); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isAuthenticated, setLocation]);

  if (loading || !data) return <div className="text-center py-12">جاري التحميل...</div>;
  if (!data.approved || !data.affiliate) return null;

  const aff = data.affiliate;
  const link = `${window.location.origin}/?ref=${aff.code}`;

  function copyLink() {
    navigator.clipboard.writeText(link);
    toast({ title: "تم نسخ الرابط" });
  }

  const canPayout = aff.balance >= aff.minPayoutAmount;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Share2 className="w-6 h-6 text-primary" /> لوحة المسوّق</h1>
          <p className="text-muted-foreground text-sm mt-1">مرحباً {aff.name}</p>
        </div>
        <Badge variant="outline" className="text-base px-3 py-1">عمولتك: {aff.commissionPercent}%</Badge>
      </div>

      <Card className="bg-gradient-to-l from-primary/10 to-transparent border-primary/20">
        <CardHeader><CardTitle className="text-base">رابط الإحالة الخاص بك</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-background border rounded px-3 py-2 text-sm font-mono truncate" dir="ltr">{link}</code>
            <Button onClick={copyLink} size="icon" variant="outline"><Copy className="w-4 h-4" /></Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">شارك هذا الرابط مع متابعينك. كل طلب يأتي عبره يضاف لرصيدك.</p>
        </CardContent>
      </Card>

      <div className="grid sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5">
            <TrendingUp className="w-5 h-5 text-primary mb-2" />
            <p className="text-sm text-muted-foreground">إجمالي المكتسب</p>
            <p className="text-2xl font-bold">{aff.totalEarned.toLocaleString("ar-SA")} ر.س</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <Wallet className="w-5 h-5 text-green-600 mb-2" />
            <p className="text-sm text-muted-foreground">المدفوع</p>
            <p className="text-2xl font-bold">{aff.totalPaid.toLocaleString("ar-SA")} ر.س</p>
          </CardContent>
        </Card>
        <Card className={canPayout ? "ring-2 ring-primary/50" : ""}>
          <CardContent className="p-5">
            <Users className="w-5 h-5 text-amber-600 mb-2" />
            <p className="text-sm text-muted-foreground">الرصيد المتاح</p>
            <p className="text-2xl font-bold text-primary">{aff.balance.toLocaleString("ar-SA")} ر.س</p>
            {canPayout
              ? <p className="text-xs text-green-600 mt-1">جاهز للسحب — تواصل مع الإدارة</p>
              : <p className="text-xs text-muted-foreground mt-1">الحد الأدنى للسحب: {aff.minPayoutAmount} ر.س</p>}
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">آخر الإحالات ({data.referrals?.length ?? 0})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {!data.referrals || data.referrals.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">لا توجد إحالات بعد</p>
            ) : data.referrals.slice(0, 10).map((r) => (
              <div key={r.id} className="flex items-center justify-between border-b pb-2 last:border-0 text-sm">
                <Link href={`/my-orders`} className="hover:text-primary flex items-center gap-1">
                  طلب #{r.orderId} <ExternalLink className="w-3 h-3" />
                </Link>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-primary">{r.commissionAmount.toFixed(2)} ر.س</span>
                  <Badge variant={r.status === "confirmed" ? "default" : "secondary"} className="text-[10px]">
                    {r.status === "confirmed" ? "مؤكد" : "بانتظار"}
                  </Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">سجل الدفعات ({data.payouts?.length ?? 0})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {!data.payouts || data.payouts.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">لا توجد دفعات بعد</p>
            ) : data.payouts.map((p) => (
              <div key={p.id} className="flex items-center justify-between border-b pb-2 last:border-0 text-sm">
                <span className="text-muted-foreground">{new Date(p.createdAt).toLocaleDateString("ar-SA")}</span>
                <span className="font-semibold text-green-700">{p.amount.toFixed(2)} ر.س</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

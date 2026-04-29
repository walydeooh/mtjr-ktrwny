import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Pencil, Share2, Copy, Wallet, Inbox, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Affiliate = {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  code: string;
  commissionPercent: number;
  totalEarned: number;
  totalPaid: number;
  iban?: string | null;
  active: boolean;
};
type Application = {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  socialLinks: string | null;
  audienceDescription: string | null;
  reason: string | null;
  iban: string | null;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
};
type Payout = {
  id: number;
  affiliateId: number;
  amount: number;
  iban: string | null;
  notes: string | null;
  createdAt: string;
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

export default function Affiliates() {
  const [list, setList] = useState<Affiliate[]>([]);
  const [apps, setApps] = useState<Application[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Affiliate | null>(null);
  const [payoutFor, setPayoutFor] = useState<Affiliate | null>(null);
  const [payoutAmount, setPayoutAmount] = useState("");
  const [payoutIban, setPayoutIban] = useState("");
  const [historyFor, setHistoryFor] = useState<Affiliate | null>(null);
  const [history, setHistory] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const [form, setForm] = useState({ name: "", phone: "", email: "", code: "", commissionPercent: "10", iban: "", active: true });

  async function load() {
    setLoading(true);
    try {
      const [a, ap] = await Promise.all([api("/affiliates"), api("/admin/affiliate-applications").catch(() => [])]);
      setList(a); setApps(ap);
    } catch (e) { toast({ variant: "destructive", title: "خطأ", description: (e as Error).message }); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  function openNew() {
    setEditing(null);
    setForm({ name: "", phone: "", email: "", code: "", commissionPercent: "10", iban: "", active: true });
    setOpen(true);
  }
  function openEdit(a: Affiliate) {
    setEditing(a);
    setForm({ name: a.name, phone: a.phone, email: a.email || "", code: a.code, commissionPercent: String(a.commissionPercent), iban: a.iban || "", active: a.active });
    setOpen(true);
  }

  async function save() {
    try {
      const payload = {
        name: form.name,
        phone: form.phone,
        email: form.email || null,
        ...(form.code ? { code: form.code } : {}),
        commissionPercent: parseFloat(form.commissionPercent),
        iban: form.iban || null,
        active: form.active,
      };
      if (editing) {
        await api(`/affiliates/${editing.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        toast({ title: "تم التعديل" });
      } else {
        await api("/affiliates", { method: "POST", body: JSON.stringify(payload) });
        toast({ title: "تمت الإضافة" });
      }
      setOpen(false);
      void load();
    } catch (e) {
      toast({ variant: "destructive", title: "خطأ", description: (e as Error).message });
    }
  }

  async function remove(id: number) {
    if (!confirm("حذف المسوّق؟")) return;
    await api(`/affiliates/${id}`, { method: "DELETE" });
    void load();
  }

  async function pay() {
    if (!payoutFor) return;
    try {
      await api(`/affiliates/${payoutFor.id}/payout`, { method: "POST", body: JSON.stringify({ amount: parseFloat(payoutAmount), iban: payoutIban || null }) });
      toast({ title: "تم تسجيل الدفعة" });
      setPayoutFor(null);
      setPayoutAmount("");
      setPayoutIban("");
      void load();
    } catch (e) { toast({ variant: "destructive", title: "خطأ", description: (e as Error).message }); }
  }

  async function decideApp(id: number, action: "approve" | "reject") {
    try {
      await api(`/admin/affiliate-applications/${id}/decision`, { method: "POST", body: JSON.stringify({ action }) });
      toast({ title: action === "approve" ? "تم القبول" : "تم الرفض" });
      void load();
    } catch (e) { toast({ variant: "destructive", title: "خطأ", description: (e as Error).message }); }
  }

  async function viewHistory(a: Affiliate) {
    setHistoryFor(a);
    try {
      const list = await api(`/affiliates/${a.id}/payouts`);
      setHistory(list);
    } catch (e) { toast({ variant: "destructive", title: "خطأ", description: (e as Error).message }); }
  }

  function copyLink(code: string) {
    const link = `${window.location.origin}/?ref=${code}`;
    navigator.clipboard.writeText(link);
    toast({ title: "تم نسخ رابط الإحالة" });
  }

  const pendingApps = apps.filter((a) => a.status === "pending");

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">المسوّقون</h1>
          <p className="text-muted-foreground mt-1">برنامج التسويق بالعمولة</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew}><Plus className="h-4 w-4 ml-2" />إضافة مسوّق</Button>
          </DialogTrigger>
          <DialogContent dir="rtl">
            <DialogHeader><DialogTitle>{editing ? "تعديل مسوّق" : "مسوّق جديد"}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>الاسم</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>الجوال</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                <div><Label>البريد (اختياري)</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>الكود (تلقائي إذا فارغ)</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} /></div>
                <div><Label>نسبة العمولة %</Label><Input type="number" value={form.commissionPercent} onChange={(e) => setForm({ ...form, commissionPercent: e.target.value })} /></div>
              </div>
              <div><Label>الآيبان (للحوالات)</Label><Input value={form.iban} onChange={(e) => setForm({ ...form, iban: e.target.value.toUpperCase() })} dir="ltr" className="text-right font-mono" placeholder="SA00 0000 0000 0000 0000 0000" /></div>
              <div className="flex items-center justify-between"><Label>نشط</Label><Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} /></div>
            </div>
            <DialogFooter><Button onClick={save}>{editing ? "حفظ" : "إضافة"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="affiliates">
        <TabsList>
          <TabsTrigger value="affiliates"><Share2 className="w-4 h-4 ml-1" /> المسوّقون النشطون ({list.length})</TabsTrigger>
          <TabsTrigger value="applications"><Inbox className="w-4 h-4 ml-1" /> طلبات الانضمام {pendingApps.length > 0 && <Badge className="mr-1">{pendingApps.length}</Badge>}</TabsTrigger>
        </TabsList>

        <TabsContent value="affiliates">
          <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
            <Table>
              <TableHeader><TableRow>
                <TableHead>الاسم</TableHead><TableHead>الجوال</TableHead><TableHead>الكود</TableHead>
                <TableHead>العمولة %</TableHead><TableHead>المكتسب</TableHead><TableHead>المدفوع</TableHead>
                <TableHead>المتبقي</TableHead><TableHead>الحالة</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {loading ? <TableRow><TableCell colSpan={9} className="text-center py-8">جاري التحميل...</TableCell></TableRow>
                : list.length === 0 ? <TableRow><TableCell colSpan={9} className="text-center py-12">
                    <Share2 className="mx-auto h-12 w-12 text-muted-foreground/40 mb-3" />
                    <p>لا يوجد مسوّقون بعد</p>
                  </TableCell></TableRow>
                : list.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.name}</TableCell>
                    <TableCell dir="ltr" className="text-right">{a.phone}</TableCell>
                    <TableCell>
                      <span className="font-mono">{a.code}</span>
                      <Button variant="ghost" size="icon" onClick={() => copyLink(a.code)}><Copy className="h-3 w-3" /></Button>
                    </TableCell>
                    <TableCell>{a.commissionPercent}%</TableCell>
                    <TableCell>{a.totalEarned.toFixed(2)} ر.س</TableCell>
                    <TableCell>
                      {a.totalPaid.toFixed(2)} ر.س
                      <Button variant="ghost" size="sm" className="text-xs px-1 mr-1" onClick={() => viewHistory(a)}>السجل</Button>
                    </TableCell>
                    <TableCell className="font-bold">{(a.totalEarned - a.totalPaid).toFixed(2)} ر.س</TableCell>
                    <TableCell><Badge variant={a.active ? "default" : "secondary"}>{a.active ? "نشط" : "موقوف"}</Badge></TableCell>
                    <TableCell className="text-left">
                      <Button variant="ghost" size="icon" title="تسجيل دفعة" onClick={() => { setPayoutFor(a); setPayoutAmount(String(Math.max(0, a.totalEarned - a.totalPaid))); setPayoutIban(a.iban || ""); }}><Wallet className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(a)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(a.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="applications">
          <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
            {apps.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Inbox className="mx-auto h-12 w-12 text-muted-foreground/40 mb-3" />
                <p>لا توجد طلبات انضمام بعد</p>
              </div>
            ) : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>الاسم</TableHead><TableHead>الجوال</TableHead><TableHead>الجمهور</TableHead>
                  <TableHead>الآيبان</TableHead><TableHead>الحالة</TableHead><TableHead>التاريخ</TableHead><TableHead></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {apps.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell dir="ltr" className="text-right">{a.phone}</TableCell>
                      <TableCell className="max-w-xs truncate text-muted-foreground" title={a.audienceDescription || ""}>{a.audienceDescription || "—"}</TableCell>
                      <TableCell className="font-mono text-xs" dir="ltr">{a.iban || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={a.status === "approved" ? "default" : a.status === "rejected" ? "destructive" : "secondary"}>
                          {a.status === "approved" ? "مقبول" : a.status === "rejected" ? "مرفوض" : "قيد المراجعة"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(a.createdAt).toLocaleDateString("ar-SA")}</TableCell>
                      <TableCell className="text-left">
                        {a.status === "pending" && (
                          <>
                            <Button variant="ghost" size="icon" onClick={() => decideApp(a.id, "approve")} title="قبول"><Check className="h-4 w-4 text-green-600" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => decideApp(a.id, "reject")} title="رفض"><X className="h-4 w-4 text-destructive" /></Button>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={!!payoutFor} onOpenChange={(o) => !o && setPayoutFor(null)}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>تسجيل دفعة عمولة لـ {payoutFor?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>المبلغ المدفوع (ر.س)</Label><Input type="number" value={payoutAmount} onChange={(e) => setPayoutAmount(e.target.value)} /></div>
            <div><Label>الآيبان المُحوَّل إليه</Label><Input value={payoutIban} onChange={(e) => setPayoutIban(e.target.value.toUpperCase())} dir="ltr" className="text-right font-mono" /></div>
          </div>
          <DialogFooter><Button onClick={pay}>تسجيل وأرشفة</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!historyFor} onOpenChange={(o) => !o && setHistoryFor(null)}>
        <DialogContent dir="rtl" className="max-w-xl">
          <DialogHeader><DialogTitle>سجل دفعات {historyFor?.name}</DialogTitle></DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            {history.length === 0 ? <p className="text-center py-8 text-muted-foreground">لا توجد دفعات سابقة</p>
            : (
              <Table>
                <TableHeader><TableRow><TableHead>التاريخ</TableHead><TableHead>المبلغ</TableHead><TableHead>الآيبان</TableHead></TableRow></TableHeader>
                <TableBody>
                  {history.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-xs">{new Date(p.createdAt).toLocaleString("ar-SA")}</TableCell>
                      <TableCell className="font-bold">{p.amount.toFixed(2)} ر.س</TableCell>
                      <TableCell className="font-mono text-xs" dir="ltr">{p.iban || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

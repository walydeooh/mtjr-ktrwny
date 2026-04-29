import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Send, Megaphone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Campaign = {
  id: number;
  name: string;
  message: string;
  status: string;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  scheduledAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
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

const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "مسودة", variant: "secondary" },
  sending: { label: "جاري الإرسال", variant: "outline" },
  sent: { label: "تم الإرسال", variant: "default" },
};

export default function Campaigns() {
  const [list, setList] = useState<Campaign[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const [form, setForm] = useState({ name: "", message: "" });

  async function load() {
    setLoading(true);
    try { setList(await api("/campaigns")); }
    catch (e) { toast({ variant: "destructive", title: "خطأ", description: (e as Error).message }); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, []);

  async function save() {
    try {
      await api("/campaigns", { method: "POST", body: JSON.stringify({ name: form.name, message: form.message }) });
      toast({ title: "تم إنشاء الحملة" });
      setOpen(false);
      setForm({ name: "", message: "" });
      void load();
    } catch (e) { toast({ variant: "destructive", title: "خطأ", description: (e as Error).message }); }
  }

  async function send(id: number) {
    if (!confirm("سيتم إرسال هذه الحملة لجميع العملاء. هل أنت متأكد؟")) return;
    try {
      const r = await api(`/campaigns/${id}/send`, { method: "POST" });
      toast({ title: "بدأ الإرسال", description: `سيتم الإرسال لـ ${r.queued} عميل` });
      void load();
    } catch (e) { toast({ variant: "destructive", title: "خطأ", description: (e as Error).message }); }
  }

  async function remove(id: number) {
    if (!confirm("حذف الحملة؟")) return;
    await api(`/campaigns/${id}`, { method: "DELETE" });
    void load();
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">الحملات التسويقية</h1>
          <p className="text-muted-foreground mt-1">إرسال رسائل واتساب جماعية للعملاء</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 ml-2" />حملة جديدة</Button></DialogTrigger>
          <DialogContent dir="rtl">
            <DialogHeader><DialogTitle>حملة تسويقية جديدة</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>اسم الحملة</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="عرض رمضان" /></div>
              <div><Label>نص الرسالة</Label><Textarea rows={6} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="مرحباً! لدينا عرض خاص لك..." /></div>
              <p className="text-xs text-muted-foreground">سيتم إرسال الحملة لجميع العملاء المسجلين في المتجر.</p>
            </div>
            <DialogFooter><Button onClick={save}>حفظ كمسودة</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
        <Table>
          <TableHeader><TableRow>
            <TableHead>الاسم</TableHead><TableHead>الرسالة</TableHead><TableHead>الحالة</TableHead>
            <TableHead>التقدم</TableHead><TableHead>التاريخ</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={6} className="text-center py-8">جاري التحميل...</TableCell></TableRow>
            : list.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center py-12">
                <Megaphone className="mx-auto h-12 w-12 text-muted-foreground/40 mb-3" />
                <p>لا توجد حملات بعد</p>
              </TableCell></TableRow>
            : list.map((c) => {
              const s = statusLabels[c.status] || { label: c.status, variant: "secondary" as const };
              return (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground">{c.message}</TableCell>
                  <TableCell><Badge variant={s.variant}>{s.label}</Badge></TableCell>
                  <TableCell>{c.totalRecipients > 0 ? `${c.sentCount}/${c.totalRecipients}` + (c.failedCount > 0 ? ` (فشل: ${c.failedCount})` : "") : "—"}</TableCell>
                  <TableCell>{new Date(c.createdAt).toLocaleDateString("ar-SA")}</TableCell>
                  <TableCell className="text-left">
                    {c.status === "draft" && (
                      <Button variant="ghost" size="icon" onClick={() => send(c.id)} title="إرسال الآن"><Send className="h-4 w-4 text-primary" /></Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => remove(c.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Pencil, UserCog } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Employee = { id: number; username: string; name: string | null; phone: string | null; role: "owner" | "manager" | "staff"; active: boolean; createdAt: string };

async function api(path: string, init?: RequestInit) {
  const token = localStorage.getItem("token");
  const r = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init?.headers || {}) },
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || "خطأ");
  return r.json();
}

const roleLabels: Record<string, string> = { owner: "مالك", manager: "مدير", staff: "موظف" };

export default function Employees() {
  const [list, setList] = useState<Employee[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const [form, setForm] = useState({ username: "", password: "", name: "", phone: "", role: "staff" as "owner" | "manager" | "staff", active: true });

  async function load() {
    setLoading(true);
    try { setList(await api("/employees")); }
    catch (e) { toast({ variant: "destructive", title: "خطأ", description: (e as Error).message }); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  function openNew() {
    setEditing(null);
    setForm({ username: "", password: "", name: "", phone: "", role: "staff", active: true });
    setOpen(true);
  }
  function openEdit(e: Employee) {
    setEditing(e);
    setForm({ username: e.username, password: "", name: e.name || "", phone: e.phone || "", role: e.role, active: e.active });
    setOpen(true);
  }

  async function save() {
    try {
      const payload: Record<string, unknown> = {
        username: form.username,
        name: form.name || null,
        phone: form.phone || null,
        role: form.role,
        active: form.active,
      };
      if (form.password) payload["password"] = form.password;
      if (editing) {
        await api(`/employees/${editing.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        toast({ title: "تم التعديل" });
      } else {
        if (!form.password) { toast({ variant: "destructive", title: "كلمة المرور مطلوبة" }); return; }
        await api("/employees", { method: "POST", body: JSON.stringify(payload) });
        toast({ title: "تمت الإضافة" });
      }
      setOpen(false);
      void load();
    } catch (e) { toast({ variant: "destructive", title: "خطأ", description: (e as Error).message }); }
  }

  async function remove(id: number) {
    if (!confirm("حذف الموظف؟")) return;
    try {
      await api(`/employees/${id}`, { method: "DELETE" });
      void load();
    } catch (e) { toast({ variant: "destructive", title: "خطأ", description: (e as Error).message }); }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">الموظفون</h1>
          <p className="text-muted-foreground mt-1">إدارة فريق العمل وصلاحيات الوصول</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button onClick={openNew}><Plus className="h-4 w-4 ml-2" />إضافة موظف</Button></DialogTrigger>
          <DialogContent dir="rtl">
            <DialogHeader><DialogTitle>{editing ? "تعديل موظف" : "موظف جديد"}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>اسم المستخدم</Label><Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></div>
                <div><Label>كلمة المرور {editing && "(اتركها فارغة لعدم التغيير)"}</Label><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>الاسم الكامل</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div><Label>الجوال</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              </div>
              <div>
                <Label>الدور</Label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as "owner" | "manager" | "staff" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owner">مالك</SelectItem>
                    <SelectItem value="manager">مدير</SelectItem>
                    <SelectItem value="staff">موظف</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between"><Label>نشط</Label><Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} /></div>
            </div>
            <DialogFooter><Button onClick={save}>{editing ? "حفظ" : "إضافة"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
        <Table>
          <TableHeader><TableRow>
            <TableHead>المستخدم</TableHead><TableHead>الاسم</TableHead><TableHead>الجوال</TableHead>
            <TableHead>الدور</TableHead><TableHead>الحالة</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={6} className="text-center py-8">جاري التحميل...</TableCell></TableRow>
            : list.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center py-12">
                <UserCog className="mx-auto h-12 w-12 text-muted-foreground/40 mb-3" />
                <p>لا يوجد موظفون</p>
              </TableCell></TableRow>
            : list.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="font-mono">{e.username}</TableCell>
                <TableCell>{e.name || "—"}</TableCell>
                <TableCell>{e.phone || "—"}</TableCell>
                <TableCell><Badge variant={e.role === "owner" ? "default" : "secondary"}>{roleLabels[e.role] || e.role}</Badge></TableCell>
                <TableCell><Badge variant={e.active ? "default" : "secondary"}>{e.active ? "نشط" : "موقوف"}</Badge></TableCell>
                <TableCell className="text-left">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(e)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => remove(e.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

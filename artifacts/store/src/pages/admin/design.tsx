import { useEffect, useState, useRef, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  GripVertical, Plus, Trash2, ChevronDown, ChevronUp, Eye, EyeOff,
  Store, LayoutDashboard, Image as ImageIcon, Grid3X3,
  Tag, Type, Megaphone, Save, RefreshCw, X, Settings2,
} from "lucide-react";

const token = () => localStorage.getItem("token");
async function api(path: string, init?: RequestInit) {
  const r = await fetch(`/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
      ...(init?.headers || {}),
    },
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "خطأ في الاتصال");
  if (r.status === 204) return null;
  return r.json();
}

type SectionType = "hero_banner" | "banners_grid" | "categories_bar" | "products_grid" | "custom_text" | "marquee";

interface Section {
  id: number;
  type: SectionType;
  title: string;
  sortOrder: number;
  active: boolean;
  config: Record<string, unknown>;
}

interface Settings {
  storeName: string;
  storeDescription: string | null;
  storeLogoUrl: string | null;
  themePrimaryColor: string;
  themeSecondaryColor: string;
  contactPhone: string | null;
  contactEmail: string | null;
  contactAddress: string | null;
  socialInstagram: string | null;
  socialTwitter: string | null;
  socialTiktok: string | null;
  socialSnapchat: string | null;
  showCategoriesBar: boolean;
  floatingCartEnabled: boolean;
}

const SECTION_META: Record<SectionType, { label: string; icon: React.ElementType; color: string; desc: string }> = {
  hero_banner: { label: "بانر رئيسي", icon: ImageIcon, color: "text-blue-400", desc: "صورة كبيرة مع عنوان وزر" },
  banners_grid: { label: "شبكة بانرات", icon: Grid3X3, color: "text-purple-400", desc: "مجموعة بانرات صغيرة جانبية" },
  categories_bar: { label: "شريط التصنيفات", icon: Tag, color: "text-green-400", desc: "تصنيفات المتجر أفقياً" },
  products_grid: { label: "شبكة المنتجات", icon: LayoutDashboard, color: "text-orange-400", desc: "عرض منتجات بشبكة" },
  custom_text: { label: "نص مخصص", icon: Type, color: "text-pink-400", desc: "فقرة نصية أو HTML" },
  marquee: { label: "شريط إعلانات", icon: Megaphone, color: "text-yellow-400", desc: "نص متحرك في الأعلى" },
};

const SECTION_TYPES = Object.entries(SECTION_META) as [SectionType, typeof SECTION_META[SectionType]][];

export default function DesignEditor() {
  const { toast } = useToast();
  const [sections, setSections] = useState<Section[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [activeTab, setActiveTab] = useState<"page" | "identity" | "header">("page");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  const loadSections = useCallback(async () => {
    try {
      const data = await api("/design/sections");
      setSections(data);
    } catch (e) {
      toast({ variant: "destructive", title: "خطأ", description: (e as Error).message });
    }
  }, [toast]);

  const loadSettings = useCallback(async () => {
    try {
      const data = await api("/settings");
      setSettings(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    void loadSections();
    void loadSettings();
  }, [loadSections, loadSettings]);

  const handleDragStart = (idx: number) => { dragItem.current = idx; };
  const handleDragEnter = (idx: number) => { dragOverItem.current = idx; };
  const handleDragEnd = async () => {
    const from = dragItem.current;
    const to = dragOverItem.current;
    if (from === null || to === null || from === to) return;
    const reordered = [...sections];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    const updated = reordered.map((s, i) => ({ ...s, sortOrder: i }));
    setSections(updated);
    dragItem.current = null;
    dragOverItem.current = null;
    try {
      await api("/design/sections/order", {
        method: "PUT",
        body: JSON.stringify(updated.map(s => ({ id: s.id, sortOrder: s.sortOrder }))),
      });
      setPreviewKey(k => k + 1);
    } catch (e) {
      toast({ variant: "destructive", title: "خطأ في الترتيب", description: (e as Error).message });
    }
  };

  const toggleActive = async (s: Section) => {
    const updated = { ...s, active: !s.active };
    setSections(prev => prev.map(x => x.id === s.id ? updated : x));
    try {
      await api(`/design/sections/${s.id}`, { method: "PATCH", body: JSON.stringify({ active: updated.active }) });
      setPreviewKey(k => k + 1);
    } catch (e) {
      setSections(prev => prev.map(x => x.id === s.id ? s : x));
      toast({ variant: "destructive", title: "خطأ", description: (e as Error).message });
    }
  };

  const deleteSection = async (id: number) => {
    if (!confirm("هل تريد حذف هذا القطاع؟")) return;
    setSections(prev => prev.filter(s => s.id !== id));
    if (editingId === id) setEditingId(null);
    try {
      await api(`/design/sections/${id}`, { method: "DELETE" });
      setPreviewKey(k => k + 1);
    } catch (e) {
      await loadSections();
      toast({ variant: "destructive", title: "خطأ", description: (e as Error).message });
    }
  };

  const addSection = async (type: SectionType) => {
    const meta = SECTION_META[type];
    const defaultConfig: Record<string, unknown> = {};
    if (type === "hero_banner") defaultConfig.overlayOpacity = 50;
    if (type === "products_grid") { defaultConfig.limit = 8; defaultConfig.columns = 4; }
    if (type === "categories_bar") defaultConfig.showImages = true;
    if (type === "marquee") { defaultConfig.bgColor = "#1d4ed8"; defaultConfig.textColor = "#ffffff"; defaultConfig.text = "أهلاً بكم في متجرنا 🎉"; }
    if (type === "banners_grid") defaultConfig.layout = "2";
    try {
      const section = await api("/design/sections", {
        method: "POST",
        body: JSON.stringify({ type, title: meta.label, config: defaultConfig }),
      });
      setSections(prev => [...prev, section]);
      setEditingId(section.id);
      setShowAddModal(false);
      setPreviewKey(k => k + 1);
    } catch (e) {
      toast({ variant: "destructive", title: "خطأ", description: (e as Error).message });
    }
  };

  const updateSectionConfig = async (id: number, config: Record<string, unknown>, title?: string) => {
    setSections(prev => prev.map(s => s.id === id ? { ...s, config, ...(title !== undefined ? { title } : {}) } : s));
    try {
      await api(`/design/sections/${id}`, { method: "PATCH", body: JSON.stringify({ config, ...(title !== undefined ? { title } : {}) }) });
      setPreviewKey(k => k + 1);
    } catch (e) {
      toast({ variant: "destructive", title: "خطأ في الحفظ", description: (e as Error).message });
    }
  };

  const saveSettings = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      await api("/settings", { method: "PATCH", body: JSON.stringify(settings) });
      toast({ title: "✓ تم الحفظ", description: "تم تطبيق التغييرات على المتجر" });
      setPreviewKey(k => k + 1);
    } catch (e) {
      toast({ variant: "destructive", title: "خطأ", description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const editingSection = editingId ? sections.find(s => s.id === editingId) : null;

  return (
    <div className="flex h-full -m-4 md:-m-6 overflow-hidden rounded-xl border border-border shadow-2xl">
      {/* Preview Panel */}
      <div className="flex-1 bg-gray-100 dark:bg-gray-900 flex flex-col min-w-0">
        <div className="flex items-center justify-between px-4 py-2 bg-white dark:bg-gray-800 border-b border-border text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <div className="w-3 h-3 rounded-full bg-yellow-500" />
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span className="mr-2 font-mono text-xs bg-muted px-2 py-0.5 rounded">متجرك</span>
          </div>
          <button
            onClick={() => setPreviewKey(k => k + 1)}
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors text-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            تحديث
          </button>
        </div>
        <iframe
          key={previewKey}
          src="/"
          className="flex-1 w-full border-0"
          title="معاينة المتجر"
        />
      </div>

      {/* Editor Panel */}
      <div className="w-[360px] shrink-0 flex flex-col bg-[#0f1117] text-white border-r border-white/10 overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-white/10">
          {([
            { key: "page", label: "الصفحة الرئيسية", icon: LayoutDashboard },
            { key: "identity", label: "هوية المتجر", icon: Store },
            { key: "header", label: "رأس وتذييل", icon: Settings2 },
          ] as const).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex flex-col items-center gap-1 py-3 text-[11px] font-medium transition-colors ${
                activeTab === tab.key
                  ? "text-white border-b-2 border-blue-500 bg-white/5"
                  : "text-white/50 hover:text-white/80 hover:bg-white/5"
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* ===== PAGE TAB ===== */}
          {activeTab === "page" && (
            <div>
              {/* Add Section Button */}
              <div className="p-3 border-b border-white/10">
                <button
                  onClick={() => setShowAddModal(true)}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border-2 border-dashed border-white/20 text-white/60 hover:border-blue-500 hover:text-blue-400 transition-all text-sm font-medium"
                >
                  <Plus className="w-4 h-4" />
                  إضافة عنصر جديد
                </button>
              </div>

              {/* Section List */}
              <div className="divide-y divide-white/5">
                {sections.map((section, idx) => {
                  const meta = SECTION_META[section.type as SectionType];
                  const isEditing = editingId === section.id;
                  const Icon = meta?.icon ?? LayoutDashboard;
                  return (
                    <div key={section.id}>
                      <div
                        draggable
                        onDragStart={() => handleDragStart(idx)}
                        onDragEnter={() => handleDragEnter(idx)}
                        onDragEnd={handleDragEnd}
                        onDragOver={(e) => e.preventDefault()}
                        className={`flex items-center gap-2 px-3 py-3 group transition-colors cursor-grab active:cursor-grabbing ${
                          isEditing ? "bg-blue-600/20" : "hover:bg-white/5"
                        }`}
                      >
                        {/* Drag Handle */}
                        <GripVertical className="w-4 h-4 text-white/30 group-hover:text-white/60 shrink-0" />

                        {/* Icon */}
                        <div className={`w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0 ${meta?.color ?? "text-white"}`}>
                          <Icon className="w-4 h-4" />
                        </div>

                        {/* Label */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{section.title || meta?.label}</p>
                          <p className="text-xs text-white/40 truncate">{meta?.desc}</p>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => toggleActive(section)}
                            className={`p-1 rounded transition-colors ${section.active ? "text-green-400 hover:text-green-300" : "text-white/30 hover:text-white/60"}`}
                            title={section.active ? "إخفاء" : "إظهار"}
                          >
                            {section.active ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => setEditingId(isEditing ? null : section.id)}
                            className={`p-1 rounded transition-colors ${isEditing ? "text-blue-400" : "text-white/40 hover:text-white"}`}
                            title="تعديل"
                          >
                            {isEditing ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => deleteSection(section.id)}
                            className="p-1 rounded text-white/20 hover:text-red-400 transition-colors"
                            title="حذف"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Inline Editor */}
                      {isEditing && (
                        <div className="bg-[#1a1d2e] border-t border-b border-blue-500/30 px-4 py-4">
                          <SectionEditor
                            section={section}
                            onUpdate={(config, title) => updateSectionConfig(section.id, config, title)}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}

                {sections.length === 0 && (
                  <div className="text-center py-12 text-white/30 text-sm px-4">
                    <LayoutDashboard className="w-8 h-8 mx-auto mb-3 opacity-30" />
                    <p>لا توجد عناصر</p>
                    <p className="text-xs mt-1">أضف عناصر للصفحة الرئيسية</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ===== IDENTITY TAB ===== */}
          {activeTab === "identity" && settings && (
            <div className="p-4 space-y-5">
              <div>
                <p className="text-xs text-white/40 uppercase tracking-wide mb-3">بيانات المتجر</p>
                <div className="space-y-3">
                  <DarkField label="اسم المتجر">
                    <DarkInput value={settings.storeName} onChange={v => setSettings(s => s ? { ...s, storeName: v } : s)} />
                  </DarkField>
                  <DarkField label="وصف المتجر">
                    <textarea
                      value={settings.storeDescription || ""}
                      onChange={e => setSettings(s => s ? { ...s, storeDescription: e.target.value || null } : s)}
                      rows={2}
                      className="w-full bg-white/10 border border-white/20 text-white text-sm rounded-lg px-3 py-2 placeholder:text-white/30 focus:outline-none focus:border-blue-500 resize-none"
                    />
                  </DarkField>
                  <DarkField label="شعار المتجر (رابط)">
                    <DarkInput value={settings.storeLogoUrl || ""} onChange={v => setSettings(s => s ? { ...s, storeLogoUrl: v || null } : s)} placeholder="https://..." />
                  </DarkField>
                </div>
              </div>

              <div>
                <p className="text-xs text-white/40 uppercase tracking-wide mb-3">لون المتجر</p>
                <div className="space-y-3">
                  <DarkField label="اللون الأساسي">
                    <div className="flex gap-2">
                      <input type="color" value={settings.themePrimaryColor} onChange={e => setSettings(s => s ? { ...s, themePrimaryColor: e.target.value } : s)} className="w-10 h-9 p-1 bg-transparent border border-white/20 rounded cursor-pointer" />
                      <DarkInput value={settings.themePrimaryColor} onChange={v => setSettings(s => s ? { ...s, themePrimaryColor: v } : s)} className="font-mono" />
                    </div>
                  </DarkField>
                  <DarkField label="اللون الثانوي">
                    <div className="flex gap-2">
                      <input type="color" value={settings.themeSecondaryColor} onChange={e => setSettings(s => s ? { ...s, themeSecondaryColor: e.target.value } : s)} className="w-10 h-9 p-1 bg-transparent border border-white/20 rounded cursor-pointer" />
                      <DarkInput value={settings.themeSecondaryColor} onChange={v => setSettings(s => s ? { ...s, themeSecondaryColor: v } : s)} className="font-mono" />
                    </div>
                  </DarkField>
                </div>
              </div>

              <div>
                <p className="text-xs text-white/40 uppercase tracking-wide mb-3">خيارات العرض</p>
                <div className="space-y-3">
                  <DarkToggle label="شريط التصنيفات" checked={settings.showCategoriesBar} onChange={v => setSettings(s => s ? { ...s, showCategoriesBar: v } : s)} />
                  <DarkToggle label="سلة الشراء العائمة" checked={settings.floatingCartEnabled} onChange={v => setSettings(s => s ? { ...s, floatingCartEnabled: v } : s)} />
                </div>
              </div>

              <div>
                <p className="text-xs text-white/40 uppercase tracking-wide mb-3">التواصل الاجتماعي</p>
                <div className="space-y-2">
                  <DarkField label="إنستغرام"><DarkInput value={settings.socialInstagram || ""} onChange={v => setSettings(s => s ? { ...s, socialInstagram: v || null } : s)} placeholder="@username" /></DarkField>
                  <DarkField label="تويتر / X"><DarkInput value={settings.socialTwitter || ""} onChange={v => setSettings(s => s ? { ...s, socialTwitter: v || null } : s)} placeholder="@username" /></DarkField>
                  <DarkField label="تيك توك"><DarkInput value={settings.socialTiktok || ""} onChange={v => setSettings(s => s ? { ...s, socialTiktok: v || null } : s)} placeholder="@username" /></DarkField>
                  <DarkField label="سناب شات"><DarkInput value={settings.socialSnapchat || ""} onChange={v => setSettings(s => s ? { ...s, socialSnapchat: v || null } : s)} placeholder="username" /></DarkField>
                </div>
              </div>
            </div>
          )}

          {/* ===== HEADER TAB ===== */}
          {activeTab === "header" && settings && (
            <div className="p-4 space-y-4">
              <div>
                <p className="text-xs text-white/40 uppercase tracking-wide mb-3">معلومات التواصل (التذييل)</p>
                <div className="space-y-2">
                  <DarkField label="رقم الجوال"><DarkInput value={settings.contactPhone || ""} onChange={v => setSettings(s => s ? { ...s, contactPhone: v || null } : s)} placeholder="966500000000" /></DarkField>
                  <DarkField label="البريد الإلكتروني"><DarkInput value={settings.contactEmail || ""} onChange={v => setSettings(s => s ? { ...s, contactEmail: v || null } : s)} /></DarkField>
                  <DarkField label="العنوان"><DarkInput value={settings.contactAddress || ""} onChange={v => setSettings(s => s ? { ...s, contactAddress: v || null } : s)} /></DarkField>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Save Button */}
        <div className="p-3 border-t border-white/10 bg-[#0f1117]">
          <button
            onClick={saveSettings}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-60 text-sm"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            حفظ التغييرات
          </button>
        </div>
      </div>

      {/* Add Section Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setShowAddModal(false)}>
          <div className="bg-[#1a1d2e] border border-white/10 rounded-2xl p-5 w-[400px] max-h-[80vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-bold text-base">اختر نوع العنصر</h2>
              <button onClick={() => setShowAddModal(false)} className="text-white/40 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {SECTION_TYPES.map(([type, meta]) => {
                const Icon = meta.icon;
                return (
                  <button
                    key={type}
                    onClick={() => addSection(type)}
                    className="flex flex-col items-start gap-2 p-3 rounded-xl bg-white/5 hover:bg-blue-600/20 border border-white/10 hover:border-blue-500/50 transition-all text-right group"
                  >
                    <div className={`w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center ${meta.color}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-white text-sm font-medium">{meta.label}</p>
                      <p className="text-white/40 text-xs leading-relaxed">{meta.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Section Config Editors ─── */
function SectionEditor({ section, onUpdate }: { section: Section; onUpdate: (config: Record<string, unknown>, title?: string) => void }) {
  const [title, setTitle] = useState(section.title);
  const [cfg, setCfg] = useState<Record<string, unknown>>(section.config);

  const set = (key: string, value: unknown) => {
    const next = { ...cfg, [key]: value };
    setCfg(next);
    onUpdate(next);
  };
  const commitTitle = () => { if (title !== section.title) onUpdate(cfg, title); };

  return (
    <div className="space-y-3">
      <DarkField label="اسم العنصر (في لوحة التحكم)">
        <DarkInput value={title} onChange={setTitle} onBlur={commitTitle} />
      </DarkField>

      {section.type === "hero_banner" && (
        <>
          <DarkField label="صورة البانر">
            <LightMediaPicker value={String(cfg.imageUrl || "")} onChange={v => set("imageUrl", v)} />
          </DarkField>
          <DarkField label="العنوان الرئيسي">
            <DarkInput value={String(cfg.title || "")} onChange={v => set("title", v)} placeholder="اكتشف منتجاتنا" />
          </DarkField>
          <DarkField label="العنوان الفرعي">
            <DarkInput value={String(cfg.subtitle || "")} onChange={v => set("subtitle", v)} placeholder="عروض حصرية..." />
          </DarkField>
          <DarkField label="نص الزر">
            <DarkInput value={String(cfg.ctaText || "")} onChange={v => set("ctaText", v)} placeholder="تسوّق الآن" />
          </DarkField>
          <DarkField label="رابط الزر">
            <DarkInput value={String(cfg.ctaUrl || "")} onChange={v => set("ctaUrl", v)} placeholder="/" />
          </DarkField>
          <DarkField label={`شفافية التعتيم: ${cfg.overlayOpacity ?? 50}%`}>
            <input type="range" min="0" max="90" value={Number(cfg.overlayOpacity ?? 50)} onChange={e => set("overlayOpacity", Number(e.target.value))} className="w-full accent-blue-500" />
          </DarkField>
          <DarkField label="محاذاة النص">
            <DarkSelect value={String(cfg.textAlign || "right")} onChange={v => set("textAlign", v)} options={[{ value: "right", label: "يمين" }, { value: "center", label: "وسط" }, { value: "left", label: "يسار" }]} />
          </DarkField>
        </>
      )}

      {section.type === "products_grid" && (
        <>
          <DarkField label="عنوان القطاع">
            <DarkInput value={String(cfg.sectionTitle || "")} onChange={v => set("sectionTitle", v)} placeholder="منتجاتنا المميزة" />
          </DarkField>
          <DarkField label="عدد المنتجات">
            <DarkSelect value={String(cfg.limit || "8")} onChange={v => set("limit", Number(v))} options={[
              { value: "4", label: "4 منتجات" }, { value: "8", label: "8 منتجات" },
              { value: "12", label: "12 منتج" }, { value: "16", label: "16 منتج" },
            ]} />
          </DarkField>
          <DarkField label="عدد الأعمدة">
            <DarkSelect value={String(cfg.columns || "4")} onChange={v => set("columns", Number(v))} options={[
              { value: "2", label: "عمودان" }, { value: "3", label: "3 أعمدة" }, { value: "4", label: "4 أعمدة" },
            ]} />
          </DarkField>
          <DarkField label="معرف التصنيف (اختياري)">
            <DarkInput value={String(cfg.categoryId || "")} onChange={v => set("categoryId", v || null)} placeholder="اتركه فارغاً لعرض الكل" />
          </DarkField>
        </>
      )}

      {section.type === "categories_bar" && (
        <>
          <DarkField label="عنوان القطاع">
            <DarkInput value={String(cfg.sectionTitle || "")} onChange={v => set("sectionTitle", v)} placeholder="تسوّق حسب التصنيف" />
          </DarkField>
          <DarkToggle label="عرض صور التصنيفات" checked={Boolean(cfg.showImages !== false)} onChange={v => set("showImages", v)} />
        </>
      )}

      {section.type === "banners_grid" && (
        <>
          <DarkField label="تخطيط الشبكة">
            <DarkSelect value={String(cfg.layout || "2")} onChange={v => set("layout", v)} options={[
              { value: "1", label: "عمود واحد" }, { value: "2", label: "عمودان" }, { value: "3", label: "3 أعمدة" },
            ]} />
          </DarkField>
          <p className="text-xs text-white/40">تُستخدم البانرات المُضافة من صفحة البانرات</p>
        </>
      )}

      {section.type === "custom_text" && (
        <>
          <DarkField label="المحتوى (HTML مدعوم)">
            <textarea
              value={String(cfg.content || "")}
              onChange={e => set("content", e.target.value)}
              rows={5}
              className="w-full bg-white/10 border border-white/20 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 resize-y font-mono"
              placeholder="<h2>عنوان مخصص</h2><p>وصف هنا...</p>"
            />
          </DarkField>
          <DarkField label="محاذاة النص">
            <DarkSelect value={String(cfg.textAlign || "right")} onChange={v => set("textAlign", v)} options={[
              { value: "right", label: "يمين" }, { value: "center", label: "وسط" }, { value: "left", label: "يسار" },
            ]} />
          </DarkField>
          <DarkField label="لون الخلفية">
            <div className="flex gap-2">
              <input type="color" value={String(cfg.bgColor || "#f9fafb")} onChange={e => set("bgColor", e.target.value)} className="w-10 h-9 p-1 bg-transparent border border-white/20 rounded cursor-pointer" />
              <DarkInput value={String(cfg.bgColor || "#f9fafb")} onChange={v => set("bgColor", v)} className="font-mono" />
            </div>
          </DarkField>
        </>
      )}

      {section.type === "marquee" && (
        <>
          <DarkField label="نص الشريط">
            <DarkInput value={String(cfg.text || "")} onChange={v => set("text", v)} placeholder="عروض الجمعة البيضاء 🎉" />
          </DarkField>
          <DarkField label="لون الخلفية">
            <div className="flex gap-2">
              <input type="color" value={String(cfg.bgColor || "#1d4ed8")} onChange={e => set("bgColor", e.target.value)} className="w-10 h-9 p-1 bg-transparent border border-white/20 rounded cursor-pointer" />
              <DarkInput value={String(cfg.bgColor || "#1d4ed8")} onChange={v => set("bgColor", v)} className="font-mono" />
            </div>
          </DarkField>
          <DarkField label="لون النص">
            <div className="flex gap-2">
              <input type="color" value={String(cfg.textColor || "#ffffff")} onChange={e => set("textColor", e.target.value)} className="w-10 h-9 p-1 bg-transparent border border-white/20 rounded cursor-pointer" />
              <DarkInput value={String(cfg.textColor || "#ffffff")} onChange={v => set("textColor", v)} className="font-mono" />
            </div>
          </DarkField>
        </>
      )}
    </div>
  );
}

/* ─── Dark Form Primitives ─── */
function DarkField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-white/50 font-medium">{label}</label>
      {children}
    </div>
  );
}

function DarkInput({ value, onChange, placeholder, className = "", onBlur }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string; onBlur?: () => void;
}) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      className={`w-full bg-white/10 border border-white/20 text-white text-sm rounded-lg px-3 py-2 placeholder:text-white/30 focus:outline-none focus:border-blue-500 ${className}`}
    />
  );
}

function DarkSelect({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full bg-white/10 border border-white/20 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
    >
      {options.map(o => <option key={o.value} value={o.value} className="bg-gray-800">{o.label}</option>)}
    </select>
  );
}

function DarkToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-white/80">{label}</span>
      <button
        onClick={() => onChange(!checked)}
        className={`w-10 h-6 rounded-full transition-colors relative ${checked ? "bg-blue-500" : "bg-white/20"}`}
      >
        <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? "translate-x-5 right-auto left-1" : "right-1"}`} />
      </button>
    </div>
  );
}

function LightMediaPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="https://... أو ارفع صورة"
        className="w-full bg-white/10 border border-white/20 text-white text-sm rounded-lg px-3 py-2 placeholder:text-white/30 focus:outline-none focus:border-blue-500"
      />
      {value && (
        <div className="relative rounded-lg overflow-hidden bg-white/5 aspect-video">
          <img src={value} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
        </div>
      )}
    </div>
  );
}

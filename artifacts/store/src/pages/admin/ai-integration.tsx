import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Sparkles, Check, Eye, EyeOff, Save, Loader2, ExternalLink,
  KeyRound, Zap, AlertCircle, CheckCircle2,
} from "lucide-react";

type Provider = "openai" | "gemini";

const token = () => localStorage.getItem("token");

const PROVIDERS: Record<Provider, {
  label: string;
  description: string;
  defaultModel: string;
  models: { value: string; label: string }[];
  keyPlaceholder: string;
  docsUrl: string;
  gradient: string;
}> = {
  openai: {
    label: "OpenAI (ChatGPT)",
    description: "نماذج GPT-4o و GPT-4o-mini من OpenAI — الأكثر شهرة وأداء عام ممتاز",
    defaultModel: "gpt-4o-mini",
    models: [
      { value: "gpt-4o-mini", label: "GPT-4o Mini (سريع واقتصادي)" },
      { value: "gpt-4o", label: "GPT-4o (الأقوى)" },
      { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
      { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo (الأرخص)" },
    ],
    keyPlaceholder: "sk-...",
    docsUrl: "https://platform.openai.com/api-keys",
    gradient: "from-emerald-500 to-teal-600",
  },
  gemini: {
    label: "Google Gemini",
    description: "نماذج Gemini من Google — مجانية بحدود سخية وأداء قوي بالعربية",
    defaultModel: "gemini-2.0-flash",
    models: [
      { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash (سريع ومجاني)" },
      { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro (الأقوى)" },
      { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
    ],
    keyPlaceholder: "AIza...",
    docsUrl: "https://aistudio.google.com/apikey",
    gradient: "from-blue-500 to-purple-600",
  },
};

export default function AiIntegration() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useGetSettings({
    query: { queryKey: getGetSettingsQueryKey() },
  });

  const [provider, setProvider] = useState<Provider>("openai");
  const [openaiKey, setOpenaiKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [model, setModel] = useState("");
  const [showOpenai, setShowOpenai] = useState(false);
  const [showGemini, setShowGemini] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const s = settings as Record<string, unknown> | undefined;
  const openaiConfigured = Boolean(s?.["aiOpenaiConfigured"]);
  const geminiConfigured = Boolean(s?.["aiGeminiConfigured"]);

  useEffect(() => {
    if (!s) return;
    const p = (s["aiProvider"] as Provider) || "openai";
    setProvider(p);
    setModel((s["aiModel"] as string) || "");
  }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    setTestResult(null);
    try {
      const body: Record<string, unknown> = {
        aiProvider: provider,
        aiModel: model || PROVIDERS[provider].defaultModel,
      };
      // Only send keys that the user actually changed
      if (openaiKey) body["aiOpenaiApiKey"] = openaiKey;
      if (geminiKey) body["aiGeminiApiKey"] = geminiKey;

      const r = await fetch("/api/settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
        },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error("فشل الحفظ");
      await queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
      setOpenaiKey("");
      setGeminiKey("");
      toast({ title: "تم الحفظ", description: "تم حفظ إعدادات الذكاء الاصطناعي بنجاح" });
    } catch (e) {
      toast({ variant: "destructive", title: "خطأ", description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await fetch("/api/ai/test-connection", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
        },
        body: JSON.stringify({
          provider,
          model: model || PROVIDERS[provider].defaultModel,
          // Send the unsaved key if user typed one — lets them test BEFORE saving
          ...(openaiKey ? { openaiApiKey: openaiKey } : {}),
          ...(geminiKey ? { geminiApiKey: geminiKey } : {}),
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "فشل الاختبار");
      setTestResult({ ok: true, msg: data.message || "الاتصال يعمل بنجاح" });
    } catch (e) {
      setTestResult({ ok: false, msg: (e as Error).message });
    } finally {
      setTesting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const cfg = PROVIDERS[provider];

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500 to-blue-600 text-white">
            <Sparkles className="w-5 h-5" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">ربط الذكاء الاصطناعي</h1>
        </div>
        <p className="text-muted-foreground">
          اختر مزوّد الذكاء الاصطناعي وأدخل مفتاح الربط الخاص بك. سيتم استخدامه في الردود الذكية،
          استيراد المنتجات بالذكاء، ومساعد لوحة التحكم.
        </p>
      </div>

      {/* Provider selection */}
      <Card>
        <CardHeader>
          <CardTitle>اختر المزوّد</CardTitle>
          <CardDescription>اختر المزوّد الذي تريد استخدامه افتراضياً في كل ميزات الذكاء بالمتجر</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(Object.keys(PROVIDERS) as Provider[]).map(key => {
              const p = PROVIDERS[key];
              const isSelected = provider === key;
              const isConfigured = key === "openai" ? openaiConfigured : geminiConfigured;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setProvider(key)}
                  className={`relative text-right p-5 rounded-xl border-2 transition-all ${
                    isSelected
                      ? "border-primary bg-primary/5 shadow-md"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2.5 rounded-lg bg-gradient-to-br ${p.gradient} text-white shrink-0`}>
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold">{p.label}</h3>
                        {isConfigured && (
                          <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                            <Check className="w-3 h-3 ml-1" />
                            مُفعّل
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{p.description}</p>
                    </div>
                  </div>
                  {isSelected && (
                    <div className="absolute top-3 left-3">
                      <div className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                        <Check className="w-3 h-3" />
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* API Key inputs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="w-5 h-5" />
            مفاتيح الربط
          </CardTitle>
          <CardDescription>
            أدخل مفتاح API الخاص بكل مزوّد. لا تتم مشاركة المفاتيح أبداً وتُحفظ بأمان.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* OpenAI key */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="font-semibold flex items-center gap-2">
                مفتاح OpenAI
                {openaiConfigured && (
                  <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                    محفوظ
                  </Badge>
                )}
              </Label>
              <a
                href={PROVIDERS.openai.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                احصل على مفتاح
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showOpenai ? "text" : "password"}
                  value={openaiKey}
                  onChange={e => setOpenaiKey(e.target.value)}
                  placeholder={openaiConfigured ? "•••••••••••••• (لا تغيير)" : PROVIDERS.openai.keyPlaceholder}
                  dir="ltr"
                  className="font-mono pl-10"
                />
                <button
                  type="button"
                  onClick={() => setShowOpenai(v => !v)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 hover:bg-muted rounded text-muted-foreground"
                >
                  {showOpenai ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              ابدأ بـ <code className="bg-muted px-1.5 py-0.5 rounded text-foreground">sk-</code>
            </p>
          </div>

          {/* Gemini key */}
          <div className="space-y-2 pt-4 border-t">
            <div className="flex items-center justify-between">
              <Label className="font-semibold flex items-center gap-2">
                مفتاح Google Gemini
                {geminiConfigured && (
                  <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                    محفوظ
                  </Badge>
                )}
              </Label>
              <a
                href={PROVIDERS.gemini.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                احصل على مفتاح مجاني
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showGemini ? "text" : "password"}
                  value={geminiKey}
                  onChange={e => setGeminiKey(e.target.value)}
                  placeholder={geminiConfigured ? "•••••••••••••• (لا تغيير)" : PROVIDERS.gemini.keyPlaceholder}
                  dir="ltr"
                  className="font-mono pl-10"
                />
                <button
                  type="button"
                  onClick={() => setShowGemini(v => !v)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 hover:bg-muted rounded text-muted-foreground"
                >
                  {showGemini ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              ابدأ بـ <code className="bg-muted px-1.5 py-0.5 rounded text-foreground">AIza</code> — مجاني من Google AI Studio
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Model selection */}
      <Card>
        <CardHeader>
          <CardTitle>النموذج</CardTitle>
          <CardDescription>اختر نموذج {cfg.label} الذي تريد استخدامه</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {cfg.models.map(m => {
              const active = (model || cfg.defaultModel) === m.value;
              return (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setModel(m.value)}
                  className={`text-right p-3 rounded-lg border-2 transition-all text-sm ${
                    active ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{m.label}</span>
                    {active && <Check className="w-4 h-4 text-primary" />}
                  </div>
                  <code className="text-[10px] text-muted-foreground mt-1 block">{m.value}</code>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Test result */}
      {testResult && (
        <div
          className={`flex items-start gap-3 p-4 rounded-lg border ${
            testResult.ok
              ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300"
              : "bg-destructive/10 border-destructive/30 text-destructive"
          }`}
        >
          {testResult.ok ? <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" /> : <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />}
          <div>
            <p className="font-medium">{testResult.ok ? "اتصال ناجح" : "فشل الاتصال"}</p>
            <p className="text-sm opacity-80">{testResult.msg}</p>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3 sticky bottom-4 bg-background/95 backdrop-blur p-4 rounded-xl border shadow-lg">
        <Button onClick={handleSave} disabled={saving} size="lg" className="flex-1 sm:flex-none min-w-40">
          {saving ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : <Save className="w-4 h-4 ml-2" />}
          حفظ الإعدادات
        </Button>
        <Button
          variant="outline"
          onClick={handleTest}
          disabled={testing || (!openaiConfigured && !geminiConfigured && !openaiKey && !geminiKey)}
          size="lg"
        >
          {testing ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : <Zap className="w-4 h-4 ml-2" />}
          اختبر الاتصال
        </Button>
      </div>
    </div>
  );
}

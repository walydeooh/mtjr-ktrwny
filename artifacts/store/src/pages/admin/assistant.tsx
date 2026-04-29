import { useState, useRef, useEffect } from "react";
import { AdminLayout } from "@/components/layout/admin-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Send, User, Bot, Loader2, Trash2 } from "lucide-react";
import { useChatWithAssistant } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

type ChatMessage = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "اعطني ملخص الطلبات المعلقة",
  "كم كود متبقي في منتج اشتراك سناب",
  "اعرض لي آخر 10 طلبات مدفوعة",
];

export default function AssistantPage() {
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const chat = useChatWithAssistant();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when a new message lands.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, chat.isPending]);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    chat.mutate(
      { data: { messages: next } },
      {
        onSuccess: (res) => {
          setMessages([...next, { role: "assistant", content: res.reply || "تم." }]);
        },
        onError: () => {
          toast({
            title: "تعذّر الاتصال بالمساعد",
            description: "حاول مرة أخرى بعد قليل",
            variant: "destructive",
          });
          // Roll back the optimistic user message to keep state honest
          setMessages(messages);
          setInput(trimmed);
        },
      }
    );
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Sparkles className="h-7 w-7 text-primary" />
              المساعد الذكي
            </h1>
            <p className="text-muted-foreground mt-1">
              اطلب أي شيء من إدارة المتجر — مثل إضافة أكواد لمنتج، أو ملخص الطلبات المعلقة.
            </p>
          </div>
          {messages.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => setMessages([])}>
              <Trash2 className="h-4 w-4 ml-2" />
              محادثة جديدة
            </Button>
          )}
        </div>

        <Card className="flex flex-col h-[70vh]">
          <CardHeader className="border-b py-3">
            <CardTitle className="text-base">المحادثة</CardTitle>
            <CardDescription className="text-xs">
              ينفّذ الأوامر مباشرة على بيانات متجرك. تأكّد من المراجعة قبل الموافقة على أي تغيير حساس.
            </CardDescription>
          </CardHeader>

          <CardContent ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && !chat.isPending && (
              <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground gap-4">
                <Sparkles className="h-12 w-12 opacity-30" />
                <p className="max-w-md">
                  ابدأ محادثة. يمكنك طلب إضافة أكواد لمنتج، أو ملخص للطلبات، أو معرفة المخزون المتاح.
                </p>
                <div className="flex flex-wrap gap-2 justify-center max-w-md">
                  {SUGGESTIONS.map(s => (
                    <Button
                      key={s}
                      variant="outline"
                      size="sm"
                      onClick={() => send(s)}
                    >
                      {s}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                {m.role === "assistant" && (
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                )}
                <div className={`rounded-2xl px-4 py-2.5 max-w-[80%] whitespace-pre-wrap ${
                  m.role === "user"
                    ? "bg-primary text-primary-foreground rounded-tl-md"
                    : "bg-muted rounded-tr-md"
                }`}>
                  {m.content}
                </div>
                {m.role === "user" && (
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <User className="h-4 w-4" />
                  </div>
                )}
              </div>
            ))}

            {chat.isPending && (
              <div className="flex gap-3 justify-start">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div className="rounded-2xl px-4 py-3 bg-muted flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  يفكّر...
                </div>
              </div>
            )}
          </CardContent>

          <div className="border-t p-3 bg-background">
            <div className="flex gap-2 items-end">
              <Textarea
                placeholder="اكتب طلبك... (Enter للإرسال، Shift+Enter لسطر جديد)"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                rows={2}
                className="resize-none"
                disabled={chat.isPending}
              />
              <Button
                onClick={() => send(input)}
                disabled={!input.trim() || chat.isPending}
                size="icon"
                className="h-10 w-10 shrink-0"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </AdminLayout>
  );
}

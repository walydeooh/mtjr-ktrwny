# نشر المشروع على Railway

## الخطوات

### 1. إنشاء مشروع جديد على Railway
1. افتح [railway.app](https://railway.app) وأنشئ **New Project**
2. اختر **Deploy from GitHub repo** وربط المستودع

### 2. إضافة قاعدة بيانات PostgreSQL
1. من داخل المشروع اضغط **+ Add Service** → **Database** → **PostgreSQL**
2. Railway سيضيف `DATABASE_URL` تلقائياً في متغيرات البيئة

### 3. إعداد متغيرات البيئة
في صفحة **Variables** للـ service أضف:

| المتغير | القيمة |
|---------|--------|
| `SESSION_SECRET` | نص عشوائي طويل (مثلاً من `openssl rand -hex 32`) |
| `NODE_ENV` | `production` |
| `OPENAI_API_KEY` | (اختياري) مفتاح OpenAI للردود الذكية |
| `ANTHROPIC_API_KEY` | (اختياري) مفتاح Anthropic للمساعد الإداري |

> `DATABASE_URL` و `PORT` يُضافان تلقائياً من Railway.

### 4. Deploy
بعد إضافة المتغيرات اضغط **Deploy** أو push أي commit على الـ branch الرئيسي.

## ما يحدث عند البناء

```
pnpm install              ← تنزيل الحزم
vite build (store)        ← بناء الواجهة الأمامية
esbuild (api-server)      ← بناء الـ API
```

## ما يحدث عند التشغيل

```
drizzle push              ← مزامنة جداول قاعدة البيانات تلقائياً
node dist/index.mjs       ← تشغيل الـ API الذي يخدم الواجهة أيضاً
```

## البنية في الإنتاج

```
Railway Service (واحد فقط)
├── /api/*          → Express API
└── /*              → React SPA (من artifacts/store/dist/public)
```

## Health Check
`GET /api/healthz` → `{ "status": "ok" }`

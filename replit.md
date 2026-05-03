# متجري - E-Commerce Platform

## Overview

A full-stack Arabic e-commerce platform with WhatsApp AI integration, similar to Salla/Zid but more advanced.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui
- **Routing**: wouter
- **State**: TanStack Query (via Orval generated hooks)
- **WhatsApp**: Baileys (`@whiskeysockets/baileys`) — pure WebSocket, no browser needed
- **AI**: OpenAI (for smart auto-replies)
- **Payments**: Paylink integration

## Features

### Public Store (`/`)
- Product grid with RTL Arabic layout
- Product types: digital (codes), physical (shipping), booking (calendar)
- Shopping cart + checkout
- Customer login via WhatsApp OTP (`/login`) — required to checkout
- Customer order history (`/my-orders`)
- Payment via Paylink with success/failed callback pages (`/payment/success`, `/payment/failed`)

### Admin Dashboard (`/admin`)
- Protected behind JWT auth (username: admin, password: admin123)
- Stats overview (revenue, orders, customers, products)
- Sales chart (Recharts)
- Top products list

### Product Management (`/admin/products`)
- Add/edit products with type-specific fields
- Digital products: manage activation codes
- Booking products: manage time slots (calendar)
- **Bulk AI Import** (`استيراد من موقع`): paste any store URL → AI scrapes all products (images, descriptions, prices) and saves them as hidden (`active=false`); admin can then selectively publish each product via the eye-toggle button
  - Endpoint: `POST /api/products/import-from-site` (`{ url, maxProducts }`)
  - Extraction pipeline: JSON-LD → Microdata → Salla/Zid JS-variable detection → OpenAI/Anthropic AI
  - SSRF protection (private IPs blocked)
  - `sourceUrl` field stored on each imported product
- Quick active/hidden toggle button (eye icon) on every product row

### Order Management (`/admin/orders`)
- Orders list with status filters
- Create Paylink payment links
- Automatic payment confirmation + WhatsApp notification

### Customer Database (`/admin/customers`)
- Full customer CRM with order history

### Bookings (`/admin/bookings`)
- Calendar view of appointments
- Status management

### WhatsApp Integration (`/admin/whatsapp`)
- QR code connection (polls every 3s)
- Message history
- Send messages from dashboard
- Auto-reply rules (trigger → response)
- AI-powered replies (via OpenAI when enabled)

### Settings (`/admin/settings`)
- Store branding (name, logo, description)
- Custom domain
- Paylink API keys (masked)
- AI toggle, auto-reply toggle

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

## Default Admin Credentials
- Username: `admin`
- Password: `admin123`

## Auth Architecture
Two parallel authentication systems share the same JWT secret (`SESSION_SECRET`):
1. **Admin auth** (`/api/auth/*`) — username/password for admin panel.
   - JWT in `localStorage["token"]`. Used when path starts with `/admin`.
   - Wrapped by `AuthProvider` only on admin pages.
2. **Customer auth** (`/api/customer-auth/*`) — phone-only via WhatsApp OTP.
   - JWT in `localStorage["customer_token"]`, customer object in `localStorage["customer_data"]`.
   - 6-digit OTP sent via active Baileys WhatsApp session, stored in `customer_otps` table (5 min TTL).
   - Wrapped by `CustomerAuthProvider` on storefront pages.
   - Token kind discriminator (`kind: "customer"` vs admin's no-kind) prevents cross-use.

The token getter in `main.tsx` switches based on `window.location.pathname`.

## Payments
- `POST /api/orders/:id/payment` creates a Paylink invoice with `callBackUrl` = `/api/payments/callback?orderId=X`.
- `GET /api/payments/callback?orderId=X&transactionNo=Y` verifies the invoice via Paylink REST API (atomic `UPDATE ... WHERE payment_status != 'paid' RETURNING` so duplicate callbacks don't re-fulfill), marks the order paid, delivers digital codes via WhatsApp, then 302-redirects to `/payment/success` or `/payment/failed`.
- **Paylink API client** (`artifacts/api-server/src/lib/paylink.ts`): proper two-step flow (POST `/api/auth` → cached Bearer token (25min TTL), then `addInvoice`/`getInvoice`). The previous implementation incorrectly sent `apiId`/`apiPassword` as raw headers and silently fell back to a fake `?mock=1` success URL. Now if Paylink is misconfigured or API call fails, `/orders/:id/payment` returns 503/502 instead of pretending success.
- `/payment/success` now fetches `paymentStatus` from `/api/payments/:orderId/status` and only renders the success state if status is `paid`. Otherwise shows pending UI (with auto-refresh every 3s) or redirects to `/payment/failed`. Prevents customers from seeing fake success by URL-hacking.

## Notes
- WhatsApp uses Baileys; QR is generated and shown in `/admin/whatsapp`. **Auth state is persisted in Postgres** (`whatsapp_auth_files` table) via a custom `usePostgresAuthState` adapter (`artifacts/api-server/src/lib/whatsapp-auth.ts`) that mirrors Baileys' multi-file layout. Survives container restarts and redeploys — the user only scans the QR once per device. Logging out (status 401 from WhatsApp) auto-clears the table so a fresh QR is generated. Socket uses `keepAliveIntervalMs: 25_000` to prevent idle drops, and `initInProgress` flag plus `if (sock)` guard prevent parallel init races.
- **Cold-start tolerance for Autoscale**: `waitForConnection(timeoutMs)` in `whatsapp.ts` polls until the socket reconnects (and triggers `initWhatsapp` if needed). Used by `/customer-auth/request-otp` with a 25s window so the first OTP after a cold start succeeds instead of failing instantly. Returns false fast if status is `"qr"` (no point waiting — operator hasn't scanned).
- OpenAI key (`OPENAI_API_KEY`) needs to be set for AI auto-replies.
- Paylink keys are configured via the Settings page in admin.

## Phase 2-5 Features (added)
- **Coupons** (`/admin/coupons`): create/edit/delete percent or fixed-amount discounts with min order, max uses, expiry. Public `POST /api/coupons/validate` for storefront. `usedCount` is incremented atomically only on payment success (with `usedCount < maxUses` guard) — never on order creation — to prevent unpaid orders from depleting limits.
- **Bank transfer**: storefront checkout shows a payment-method selector when `settings.bankTransferEnabled` is on. Order is created with `paymentMethod=bank_transfer`, customer is redirected to `/payment/bank-transfer` (IBAN copy + WhatsApp deep link). Admin confirms via `POST /api/payments/:orderId/confirm-bank` (requireAuth) which marks paid, delivers digital codes, and notifies customer.
- **Affiliate program** (`/admin/affiliates`): each affiliate has an auto-generated code; storefront captures `?ref=CODE` into `localStorage["affiliate_code"]` and includes it on order create. On payment success, `affiliate_referrals` is inserted (unique on `order_id` for idempotency) and `totalEarned` bumped. Admin can record manual payouts.
- **WhatsApp campaigns** (`/admin/campaigns`): bulk-message all customers; progress is tracked on the row and auto-polled.
- **AI auto-replies**: `whatsapp.ts` falls back to `gpt-4o-mini` (using `settings.aiSystemPrompt`) when `aiEnabled && whatsappAutoReply`.
- **Employees** (`/admin/employees`): bcrypt-hashed `admin_users` with `role` (owner/manager/staff). Last owner cannot be deleted.
- **Design editor** (`/admin/design`): theme primary/secondary color (mapped to CSS HSL vars by `store-layout`), banner block on home, contact info + social links rendered in footer, bank-transfer config.
- **Settings router**: `GET /api/settings` is public (storefront reads it). `PATCH /api/settings` requires admin auth and uses a `STRING_FIELD_MAP` to map API keys (e.g. `contactPhone`, `bankAccountIban`, `bankInstructions`) to actual schema columns (`contactWhatsapp`, `bankIban`, `bankAccountNumber`).
- **Auth**: all admin CRUD endpoints (coupons, affiliates, campaigns, employees, settings PATCH, payments confirm-bank) protected with `requireAuth` middleware.
- **Dev OTP**: `POST /api/customer-auth/request-otp` returns the OTP in the `devOtp` response field when `NODE_ENV !== "production"` to ease end-to-end testing.

## Phase A+B+C+D Features (latest batch)
- **Categories** (`/admin/categories`, public `GET /api/categories`): CRUD with name/slug/imageUrl/sortOrder. Storefront home shows a horizontal filter bar when `settings.showCategoriesBar` is on.
- **Multi-banners** (`/admin/banners`): each banner has `shape` (rectangle/square/circle), `linkType` (url/product/category/none), `linkValue`, sort order. Home renders one main banner + grid of the rest.
- **Bank accounts** (`/admin/bank-accounts`, public `GET /api/bank-accounts`): multiple bank accounts; storefront `/payment/bank-transfer` lets the customer pick which one and POST a receipt URL via `POST /api/payments/:orderId/bank-transfer`. **Authorization**: that endpoint accepts admin OR the customer who owns the order via `Authorization: Bearer` (admin token verified first, customer token fallback). Anonymous returns 401.
- **Affiliate self-application** (`/affiliate` → `POST /api/affiliate-applications`, no auth): customer fills name/phone/audience/IBAN. Admin sees them in `/admin/affiliates` "طلبات الانضمام" tab; approve creates an active affiliate record (`POST /api/admin/affiliate-applications/:id/decision` accepts both `{action}` and `{decision}` payloads). Approved customers see `/affiliate/dashboard` with their code, link, totals, and payout history.
- **Affiliate payouts**: `POST /api/affiliates/:id/payout` (admin) records an entry in `affiliate_payouts` and bumps `totalPaid`; admin UI shows history.
- **WhatsApp campaigns** enhanced: random delay range (5–50s default, sliders 1–600s), recipient picker (all customers / selected / manual phones with CSV import), per-message progress.
- **Floating cart** component (`floating-cart.tsx`): fixed bottom-left pill, hidden when cart is empty, gated by `settings.floatingCartEnabled` (default true).
- **Admin notification phone** (`settings.adminWhatsappPhone`): `notifyAdmin()` helper sends new-order alerts and bank-receipt alerts (with one-click admin URL to confirm payment).
- **Removed payment-link via WhatsApp for web orders**: `/orders` only sends a WA payment link when `source === "whatsapp"`. Web orders just notify the customer/admin.
- **Product extensions**: `discountType` (none/percent/fixed), `discountValue`, `categoryId`, `usageInstructionsText/MediaUrl/MediaType/LinkUrl`, `externalImportUrl`. Product card shows discount badges + old-price strikethrough.
- **AI product import** (`POST /api/products/import-from-url`, **admin auth required**): fetches the URL, extracts OpenGraph/meta tags, optionally refines with `gpt-4o-mini`. **SSRF hardened**: rejects non-http(s), private/loopback/link-local/CGNAT IPs (incl. AWS/GCP metadata 169.254.169.254 and `metadata.google.internal`), disables HTTP redirects.
- **Coupon scoping**: `startsAt`, `applicableProductIds`, `excludedProductIds` are stored, validated on `/api/coupons/validate`, AND enforced inside order discount calculation via shared `computeCouponDiscount(coupon, subtotal, items)`.
- **Digital code linkage**: `digital_codes.orderId` is set on EVERY fulfillment path (Paylink callback, admin confirm-bank, admin manual mark-paid). `/api/my-orders` (customer) joins by `orderId` to list each paid order's codes plus the product's usage instructions (text/image/video/link) on `/my-orders`.

## Salla-like Home Page Design Editor (`/admin/design`)
- **`home_sections` DB table** (`lib/db/src/schema/home-sections.ts`): stores dynamic homepage sections with `type`, `title`, `sortOrder`, `active`, `config` (jsonb).
- **API** (`/api/design/sections`): GET (public, auto-seeds 3 defaults on first call), POST/PATCH/DELETE/PUT-order (admin auth). Routes: `artifacts/api-server/src/routes/design.ts`.
- **Admin editor** (`/admin/design`): full-screen split-panel editor similar to Salla.
  - Left: live store preview in iframe with refresh button.
  - Right: dark panel with 3 tabs — الصفحة الرئيسية | هوية المتجر | رأس وتذييل.
  - Section list with native HTML5 drag-to-reorder (updates DB instantly).
  - Per-section toggle (show/hide), inline config editor (expand/collapse), delete.
  - "إضافة عنصر جديد" modal with 6 section types.
  - "حفظ التغييرات" saves store identity settings.
  - Admin layout uses full-screen mode (no max-width container) when on `/admin/design`.
- **6 section types**: `hero_banner`, `categories_bar`, `products_grid`, `banners_grid`, `custom_text`, `marquee`.
- **Home page** (`artifacts/store/src/pages/home.tsx`): fetches sections from `/api/design/sections` and renders them dynamically in order. Falls back to hardcoded layout if DB has no sections.
- **Marquee animation** added to `index.css` (`@keyframes marquee`).

## Latest additions
- **Bulk digital codes**: `POST /api/products/:id/codes/bulk` (admin auth) accepts `{codes: string[]}` — trims, dedupes within request AND against existing rows for the product (re-pasting is a no-op), validates the product is `type=digital`, returns `{added, skipped, codes}`. UI: textarea + toggle in the product form's codes section (`useBulkAddProductCodes`).
- **AI Integration page** (`/admin/ai-integration`, admin auth required): UI to choose AI provider (OpenAI vs Gemini), store API keys per provider, pick model, and test the connection live. Settings stored on `storeSettingsTable` as `aiProvider` (text), `aiOpenaiApiKey`, `aiGeminiApiKey` (secret, masked as `***` on read), `aiModel` (optional override). Test endpoint: `POST /api/ai/test-connection` (auth) calls the selected provider with a tiny prompt and returns `{ok, message}`. Stored keys are preferred over env vars; falls back to `OPENAI_API_KEY` / `GEMINI_API_KEY` env vars.
- **In-dashboard AI assistant** (`/admin/assistant`, admin auth required): chat page powered by Anthropic via `@workspace/integrations-anthropic-ai` (provisioned through `setupReplitAIIntegrations`). Uses `claude-sonnet-4-6` with a tool-calling loop (max 8 iterations) and 5 narrowly-scoped tools: `find_products`, `add_codes_to_product` (digital-only, dedups), `list_orders` (filterable), `get_order_details`, `get_product_codes_summary`. System prompt is Arabic-first; messages are validated to only `user`/`assistant` roles via Zod. Endpoint: `POST /api/admin/assistant/chat`.
- **Auth hardening on products router**: every write route (`POST/PATCH/DELETE /products`, all `/codes` endpoints, `POST /availability`) and the codes-listing endpoint now require `requireAuth`. Public reads (`GET /products`, `GET /products/:id`, `GET /products/:id/availability`) remain open for the storefront.
- **Object storage + unified MediaPicker**: every admin form that previously asked for a media URL (categories, banners, bank logos, design banner, product image, product usage-instructions media) now uses `<MediaPicker>` (`artifacts/store/src/components/ui/media-picker.tsx`) which exposes two tabs: **رابط** (paste a URL) or **رفع ملف** (upload from device). Uploads go through Replit Object Storage via the standard two-step presigned-URL flow:
  - `POST /api/storage/uploads/request-url` (**admin auth required**) → returns presigned PUT URL + objectPath.
  - Client PUTs the file bytes directly to GCS.
  - Saved value in DB is `/api/storage{objectPath}`, served by `GET /storage/objects/*` (mounted under `/api`).
  - Files: `artifacts/api-server/src/routes/storage.ts`, `artifacts/api-server/src/lib/objectStorage.ts`, `artifacts/api-server/src/lib/objectAcl.ts`, `lib/object-storage-web/src/use-upload.ts`.
  - Lib `@workspace/object-storage-web` is intentionally a leaf package (not composite); only `useUpload` is exported, and `ObjectUploader.tsx` carries `// @ts-nocheck` because Uppy v5 wants stricter React 19 type packages than we currently set up. Root `pnpm.overrides` pin `react`/`react-dom` to `19.1.0` so Uppy doesn't pull a duplicate React.
- **Subscription product type**: New product `type=subscription` with multi-duration plans.
  - Schema: `subscription_plans` (productId, name, durationDays, price, sortOrder, active) + `customer_subscriptions` (customerId, productId+name snapshot, planId+name snapshot, durationDays, orderId, startedAt, expiresAt, status). Schema lives in `lib/db/src/schema/products.ts`.
  - Routes (`artifacts/api-server/src/routes/subscriptions.ts`):
    - Public: `GET /api/products/:id/subscription-plans` (active only).
    - Admin: `GET/POST /api/admin/products/:id/subscription-plans`, `PATCH/DELETE /api/admin/subscription-plans/:planId`.
    - Customer: `GET /api/my-subscriptions` (requires customer JWT) — returns plans with derived `remainingDays`/`isActive` and auto-derives `expired` status.
  - Order flow: orders.ts validates that subscription items include `planId`; rejects with 400 if missing or plan inactive. Plan price (not product.price) is used as `unitPrice`; plan snapshot stored on order item as `{plan: {planId, planName, durationDays}}`.
  - On payment paid (`PATCH /orders/:id` with `paymentStatus=paid`): for each subscription item, inserts N customer-subscription rows (one per quantity), each with `expiresAt = now + durationDays`. Sends WhatsApp activation message.
  - **api-zod**: `CreateOrderBody.items` schema extended with `planId: z.number().optional()`; product `type` enum extended with `subscription` in both `lib/api-spec/openapi.yaml` and `lib/api-zod/src/generated/api.ts`.
  - Cart hook (`artifacts/store/src/hooks/use-cart.tsx`): `CartItem` carries `planId/planName/planPrice/planDurationDays`; cart-line key is now `productId:planId`; total uses `planPrice ?? product.price`; remove/updateQuantity take optional `planId`.
  - Storefront product page (`/product/:id`): when `type=subscription`, fetches plans and shows REQUIRED radio-card picker; add-to-cart disabled until a plan is selected; price + label update with selection.
  - Cart + checkout: cart line shows plan badge + duration; checkout submission sends `planId` in items.
  - Admin product form: "subscription" added to type select (locked after creation, like other types); when editing a subscription product, a new "خطط الاشتراك" tab exposes inline `<SubscriptionPlans>` component for add/toggle-active/delete plans.
  - My-orders page (`/my-orders`): new "اشتراكاتي" section above orders, fetched from `/api/my-subscriptions`, renders each subscription as a card with status badge (active/expired), progress bar (elapsed/total days), remaining days, expiry date.
- **Generic product options (Salla-style)**: ANY non-subscription product can have multiple selectable options; each option has a name and absolute price.
  - Schema: `product_options` (productId FK CASCADE, name, price, sortOrder, active). Schema in `lib/db/src/schema/products.ts`.
  - Routes (`artifacts/api-server/src/routes/product-options.ts`):
    - Public: `GET /api/products/:id/options` (active only, sorted by sortOrder then id).
    - Admin: `GET/POST /api/admin/products/:id/options`, `PATCH/DELETE /api/admin/product-options/:optionId`.
  - Order flow (`orders.ts`): for non-subscription products, if there is at least one ACTIVE option, the order item MUST include `optionId`; rejects with 400 otherwise. The selected option's price replaces the base product price as `unitPrice`. Snapshot stored on order item as `{option: {optionId, optionName}}`.
  - **api-zod**: `CreateOrderBody.items` schema extended with `optionId: z.number().optional()`.
  - Cart hook: `CartItem` carries `optionId/optionName/optionPrice`; cart-line key now `productId:planId:optionId` (so two options of same product = two lines); `total` uses `optionPrice ?? planPrice ?? product.price`; `removeItem`/`updateQuantity` accept optional `optionId`.
  - Storefront product page: when product has options, shows a REQUIRED options grid (radio cards, similar style to plan picker); add-to-cart disabled until selected; price label updates with selection.
  - Cart + checkout: cart line shows option badge; checkout sends `optionId` per item.
  - Admin product form: new "الخيارات" tab visible for ALL non-subscription products in edit mode, with inline `<ProductOptions>` component (add/toggle-active/delete). Subscription products use the existing "خطط الاشتراك" tab instead — the two systems don't overlap.
- **Theme customization (admin) + Dark/Light mode (storefront)**:
  - Backend: `themePrimaryColor` + `themeSecondaryColor` on `storeSettingsTable` (defaults `#2563eb`/`#1e40af`); `formatSettings` exposes them; `STRING_FIELD_MAP` in `artifacts/api-server/src/routes/settings.ts` accepts them on PATCH `/settings`. `UpdateSettingsBody` zod in `lib/api-zod/src/generated/api.ts` extended with both fields (`zod.string().optional()`).
  - Admin UI: settings page (`artifacts/store/src/pages/admin/settings.tsx`) has a new "المظهر والألوان" card with native `<input type="color">` + hex Input for each color; values validated via regex `^#[0-9a-fA-F]{6}$`.
  - Theme color application: `StoreLayout` (already) and `AdminLayout` (new) fetch `/api/settings`, convert hex→HSL via `hexToHsl`, then `root.style.setProperty("--primary"/"--secondary", ...)` so Tailwind's `bg-primary`/`text-primary` etc. update everywhere.
  - Dark/Light mode: `artifacts/store/src/hooks/use-theme.tsx` provides `<ThemeProvider>` + `useTheme()` (`mode: "light"|"dark"`, `toggle()`, `setMode()`); persists in `localStorage["ui_theme_mode"]`, falls back to `prefers-color-scheme`, applies/removes `dark` class on `<html>`. `artifacts/store/src/components/theme-toggle.tsx` exposes `<ThemeToggle/>` (Sun/Moon button). Provider wraps app inside `QueryClientProvider`. Toggle is mounted in both store header (next to cart/user) and admin top header. Existing `.dark { ... }` block in `artifacts/store/src/index.css` already provides dark palette; `StoreLayout` outer container uses `bg-background text-foreground` and the header `bg-card text-card-foreground` so dark mode actually flips storefront colors.

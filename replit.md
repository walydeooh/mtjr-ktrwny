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
- `GET /api/payments/callback?orderId=X&transactionNo=Y` verifies the invoice via Paylink REST API, marks the order paid, delivers digital codes via WhatsApp, then 302-redirects to `/payment/success` or `/payment/failed`.
- If Paylink keys are missing, the system falls back to a mock URL `/payment/success?orderId=X&mock=1`.

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

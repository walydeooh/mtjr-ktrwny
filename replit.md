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
- WhatsApp uses Baileys; QR is generated and shown in `/admin/whatsapp`. Sessions persist in `.wa-session/`.
- OpenAI key (`OPENAI_API_KEY`) needs to be set for AI auto-replies.
- Paylink keys are configured via the Settings page in admin.

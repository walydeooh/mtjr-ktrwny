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
- **WhatsApp**: whatsapp-web.js (requires Chrome/Chromium)
- **AI**: OpenAI (for smart auto-replies)
- **Payments**: Paylink integration

## Features

### Public Store (`/`)
- Product grid with RTL Arabic layout
- Product types: digital (codes), physical (shipping), booking (calendar)
- Shopping cart + checkout
- Payment via Paylink

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

## Notes
- WhatsApp requires Chrome/Chromium. In development it starts but degrades gracefully if Chrome isn't found.
- OpenAI key (`OPENAI_API_KEY`) needs to be set for AI auto-replies.
- Paylink keys are configured via the Settings page in admin.

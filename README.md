# Fruity Fun Juice Factory — Factory Management ERP

A commercial, full-stack Factory Management ERP System for **Fruity Fun Juice Factory**, designed for packaged juice manufacturing, inventory & BOM control, dealer distribution, live Android Booker GPS tracking, Roman-Urdu/English Voice Transactions, and Claude AI Business Intelligence.

## Monorepo Structure

```text
/
├── apps/
│   ├── web/                        # Next.js 15 + TypeScript + Tailwind CSS + Recharts ERP Platform
│   └── android/                    # Native Kotlin + Jetpack Compose Booker App + Foreground GPS Service
├── packages/
│   ├── shared-types/               # Canonical TypeScript definitions across all 35+ database entities
│   └── shared-validation/          # Zod server-side validation schemas
├── supabase/
│   ├── migrations/
│   │   └── 0001_initial_erp_schema.sql  # Normalized PostgreSQL schema, constraints & RLS policies
│   └── seed.sql                    # Labeled development seed data
├── .env.example                    # Environment variables template (no secrets committed)
├── SYSTEM_ARCHITECTURE.md          # Complete architectural & data-flow documentation
├── DATABASE_SCHEMA.md              # Entity-Relationship & ledger invariant reference
├── API_DOCUMENTATION.md            # Server API & voice/AI endpoint specification
├── DEPLOYMENT_GUIDE.md             # Vercel + Supabase production deployment guide
├── ANDROID_BUILD_GUIDE.md          # Signed release APK build & private distribution guide
└── ENVIRONMENT_VARIABLES.md        # Third-party API key & secret setup reference
```

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```
2. **Configure environment variables (optional for local run — required for cloud Supabase/Anthropic):**
   ```bash
   cp .env.example apps/web/.env.local
   ```
3. **Start the ERP Server:**
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000`.

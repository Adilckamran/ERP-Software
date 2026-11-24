# Fruity Fun Juice Factory — Deployment Guide (`DEPLOYMENT_GUIDE.md`)

## 1. Supabase Cloud Database Setup
1. Create a new Supabase project at `https://supabase.com/dashboard`.
2. Open the SQL Editor and execute [`supabase/migrations/0001_initial_erp_schema.sql`](supabase/migrations/0001_initial_erp_schema.sql).
3. (Optional for staging) Execute [`supabase/seed.sql`](supabase/seed.sql).
4. Copy your project's `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.

## 2. Vercel Web ERP Deployment
1. Push this monorepo to your private Git repository.
2. Import the repository into Vercel and set the **Root Directory** to `apps/web`.
3. Configure the environment variables listed in [`ENVIRONMENT_VARIABLES.md`](ENVIRONMENT_VARIABLES.md).
4. Deploy. All Next.js App Router pages and API routes (`/api/erp`, `/api/voice`, `/api/ai-assistant`) will build and serve automatically.

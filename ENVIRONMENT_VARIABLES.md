# Fruity Fun Juice Factory — Environment Variables Reference (`ENVIRONMENT_VARIABLES.md`)

| Variable | Scope | Purpose |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | Web & Server | Supabase PostgreSQL & Auth project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Web & Android | Public anon key subject to Row Level Security (RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-Only | Secret service role key used strictly inside Next.js server routes — **never** exposed to frontend |
| `ANTHROPIC_API_KEY` | Server-Only | Claude API key for natural voice command parsing and executive BI queries |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Web & Android | Google Maps API key for live booker route rendering |
| `ANDROID_KEYSTORE_PATH` | Android CI/Build | Path to private `.jks` signing keystore |
| `ANDROID_KEYSTORE_PASSWORD` | Android CI/Build | Keystore password |
| `ANDROID_KEY_ALIAS` | Android CI/Build | Signing key alias |
| `ANDROID_KEY_PASSWORD` | Android CI/Build | Signing key password |

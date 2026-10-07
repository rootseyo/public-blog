# AI Agent Guide

This file is the entry point for AI coding agents working in this repository. Read it and `README.md` before making changes.

## Project at a glance

- **Product:** single-owner, self-hosted personal blog. One deployment serves one blog.
- **Framework:** Next.js App Router with React and TypeScript.
- **Runtime/deployment:** Cloudflare Workers through OpenNextJS and Wrangler.
- **Database/media:** Supabase PostgreSQL and Supabase Storage.
- **Not implemented:** public user registration, multi-tenant isolation, automated customer domain onboarding, and a Docker deployment. Do not describe these as existing capabilities.

## Where things live

- `src/app/(main)/`: public pages, post pages, category pages, shorts, and shared layout.
- `src/app/(main)/admin/`: administrator UI, server actions, editor, and SEO tools.
- `src/app/api/`: API routes, including upload and scheduled IndexNow handling.
- `src/components/`: shared UI components.
- `src/lib/`: database, Supabase Storage, SEO, URL, session, and utility code.
- `supabase/migrations/`: ordered database and storage migrations. This is the schema change source of truth.
- `schema.sql`: reference schema snapshot; do not use it instead of adding a migration.
- `public/`: checked-in static assets. User uploads belong in Supabase Storage.
- `worker-wrapper.mjs`, `wrangler.jsonc`, `open-next.config.ts`: Cloudflare Worker runtime and deployment configuration.

## Getting started

1. Read `README.md` for Supabase setup and deployment instructions.
2. Install dependencies with `npm ci`.
3. Copy `.env.example` to `.env.local` for local development and fill in local Supabase settings.
4. Use `npm run dev` to start the app.

Cloudflare production builds also need a local, ignored `.env.production` file because Next.js reads database settings while building. Set `SITE_URL` and the Supabase values for the intended deployment. Never commit either environment file.

## Environment and secrets

- `DATABASE_URL` is the PostgreSQL connection string. Use a Supabase pooler suitable for serverless connections in Cloudflare.
- `NEXT_PUBLIC_SUPABASE_URL` identifies the Supabase project. It is public configuration, not a secret.
- `SUPABASE_SERVICE_ROLE_KEY` is server-only. Never expose it in client components, HTML, logs, or error messages.
- Admin access uses `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and `ADMIN_SESSION_SECRET`. The session cookie is HMAC-signed and expires after one day.
- `CRON_SECRET` protects scheduled endpoint calls. Optional integrations include `OPENAI_API_KEY`, `INDEXNOW_KEY`, and `NEXT_PUBLIC_KAKAO_JS_KEY`.
- Do not read, print, copy, commit, or include real values from `.env*`, service-account JSON, database dumps, or credential files in responses or patches. `.env.example` is safe to edit.
- Do not add default production passwords or secret fallbacks. Fail closed when required authentication configuration is missing.

## Data and authorization rules

- Make schema changes with a new, timestamped SQL migration under `supabase/migrations/`.
- Do not edit or migrate a production Supabase database unless the user explicitly asks for that operation.
- Keep admin checks on every protected page, server action, and API route. Validate the signed session with `src/lib/admin-session.ts`; checking only whether a cookie exists is not authorization.
- Scope all app behavior to one blog instance. A future multi-tenant feature requires explicit tenant ownership and query isolation across posts, categories, comments, uploads, analytics, and domains.
- Keep uploads in Supabase Storage; do not rely on the Worker filesystem for persistent user files.

## Build and deployment

- `npm run lint` — lint the repository.
- `npm run build` — Next.js production build; requires build-time database configuration.
- `npm run cf:preview` — OpenNext build and local Wrangler preview.
- `npm run cf:deploy` — deploy to Cloudflare Workers.
- `wrangler.jsonc` contains example settings. Replace `SITE_URL` and the Supabase URL before deploying. No production domain is preconfigured.
- Deploying, changing DNS, creating secrets, or applying remote migrations affects external services. Do those only when the user explicitly requests the operation.
- There is no Docker configuration in this project. Keep documentation aligned with the Cloudflare + Supabase deployment path.

## Change workflow

- Inspect the relevant files and existing Git changes before editing; preserve unrelated user work.
- Prefer focused changes in `src/` for application logic and migrations for schema changes.
- Do not add tests or run test suites unless the user asks for testing or verification. Do not claim a build or deployment succeeded unless it was run and completed.
- Keep documentation and `.env.example` synchronized with code changes.

# Kookos — Recepten App

Persoonlijke recepten-app met AI-powered scanning, import en weekmenu-planning.

## Tech Stack

- **Monorepo**: Turborepo + npm workspaces
- **API** (`apps/api`): Hono, Drizzle ORM, Better Auth, Anthropic SDK
- **Web** (`apps/web`): React, Vite, TailwindCSS v4, React Router, TanStack Query, PWA
- **Shared** (`packages/shared`): Zod schemas (types + validatie gedeeld tussen api en web)
- **Database**: PostgreSQL 17 met tsvector (full-text search, Dutch)
- **Infra**: Docker Compose (PostgreSQL + API + Nginx voor web)

## Commands

```bash
npm run dev              # Start alle workspaces (turbo)
npm run build            # Build alles
npm run check            # Lint + format check (Biome)
npm run check:fix        # Lint + format auto-fix (Biome)
npm run typecheck        # Type check alle workspaces
npm run db:push          # Push schema naar DB (dev)
npm run db:generate      # Genereer Drizzle migratie
npm run db:migrate       # Run migraties

# Per workspace
cd apps/api && npm run dev          # API op :3010
cd apps/web && npm run dev          # Web op :5173 (proxy naar :3010)
cd apps/api && npm run db:migrate:run  # Migraties + search triggers

# Deploy
docker compose up --build -d        # Alles in Docker
```

## Project Structure

```
apps/api/src/
├── db/schema.ts          # Drizzle schema (alle tabellen)
├── db/migrate.ts         # Migratie runner + tsvector triggers
├── auth.ts               # Better Auth config
├── middleware.ts          # Auth middleware (AppEnv typed)
├── types.ts              # Hono env types
├── routes/recipes.ts     # CRUD + tsvector search
├── routes/ai.ts          # Scan, import, meal-plan (Claude API)
└── index.ts              # Server entrypoint

apps/web/src/
├── pages/                # Route pages
├── components/layout.tsx # Shell met bottom tabs
├── lib/api.ts            # Fetch wrapper met auth
└── lib/auth.ts           # Zustand auth store (persisted)

packages/shared/src/
└── index.ts              # Zod schemas + type exports
```

## Critical Rules

1. **NO `!important`**: Gebruik NOOIT `!important` in CSS
2. **Tests**: NOOIT tests verwijderen zonder expliciete toestemming
3. **Commits**: ALTIJD falende tests fixen voor commit. NOOIT `--no-verify`
4. **Legacy code**: NOOIT legacy code laten staan na een refactor. ALTIJD volledig opschonen
5. **Duplicate code**: NOOIT zomaar code dupliceren. Vraag jezelf af of centraliseren beter is. Bij twijfel: VRAAG de user
6. **Backwards compatibility**: ALTIJD expliciet vragen voordat je backward-compatible code schrijft
7. **Third party**: Altijd officiële docs lezen voordat je een library integreert
8. **Nooit `any`**: Gebruik `unknown`, specifieke types, of generics. Bij catch: `catch (err: unknown)`. Bij JSON/API data: `Record<string, unknown>` + type guards
9. **Geen unused vars/imports**: Verwijder ongebruikte imports, variabelen en parameters. Prefix met `_` als nodig (bijv. `_err`)
10. **Type checking**: Gebruik `tsc --noEmit` voor type checks, niet de build

## Conventions

- **Taal**: UI/UX in het Nederlands, code in het Engels
- **API routes**: Altijd onder `/api/` prefix
- **Auth**: Alle routes behalve `/health` en `/api/auth/**` vereisen sessie
- **Hono typing**: Routes gebruiken `new Hono<AppEnv>()` en `c.get("user")!`
- **Database**: Schema wijzigingen via Drizzle → `db:generate` → commit migratie
- **Search**: tsvector met Dutch dictionary, weighted (A=titel, B=beschrijving+ingrediënten, C=keuken+categorie)
- **AI prompts**: Nederlands, output altijd strict JSON
- **Env**: `.env` in project root, niet in workspaces
- **Port**: API op 3010, web dev op 5173, web prod op 3011
- **Formatting**: Biome (2 spaces, double quotes, 100 char line width). Pre-commit hook draait automatisch
- **Pre-commit**: Husky + lint-staged — Biome check + auto-fix op staged bestanden

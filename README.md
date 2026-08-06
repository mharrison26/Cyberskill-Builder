# nextjs-app

A Next.js 14 starter project with the App Router, TypeScript, Tailwind CSS, ESLint, and Prettier.

**GitHub:** [mharrison26/Cyberskill-Builder](https://github.com/mharrison26/Cyberskill-Builder)

**Production:** [cyberskill-builder.vercel.app](https://cyberskill-builder.vercel.app)

## Prerequisites

- [Node.js](https://nodejs.org/) 18.17 or later

## Getting started

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Scripts

| Command                | Description                              |
| ---------------------- | ---------------------------------------- |
| `npm run dev`          | Start the development server             |
| `npm run build`        | Create a production build                |
| `npm run start`        | Serve the production build               |
| `npm run lint`         | Run ESLint                               |
| `npm run format`       | Format files with Prettier               |
| `npm run format:check` | Check formatting without writing changes |
| `npm run test:rls`     | Verify RLS + FORCE RLS on all public tables (requires `DATABASE_URL`) |

## Project structure

```
src/
├── app/          # App Router pages, layouts, and global styles
├── components/   # Reusable UI components
├── lib/          # Shared utilities and helpers
└── types/        # Shared TypeScript types
```

## Supabase

This project includes Supabase SSR clients in `src/lib/supabase/`. Local development requires two environment variables (see `.env.local.example`).

### Connected project

| Setting      | Value                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------ |
| Project name | CyberSkills Builder                                                                                                |
| Project ref  | `oyexzmucngsoyxlxhofy`                                                                                             |
| Dashboard    | [supabase.com/dashboard/project/oyexzmucngsoyxlxhofy](https://supabase.com/dashboard/project/oyexzmucngsoyxlxhofy) |
| API URL      | `https://oyexzmucngsoyxlxhofy.supabase.co`                                                                         |
| Region       | us-west-2                                                                                                          |
| Status       | **Connected** — `.env.local` configured, foundation migration applied                                              |

Foundation tables in `public`: `tenants`, `users`, `tracks`, `track_enrollments`, `lessons`, `lesson_progress`, `oscal_findings` (plus pre-existing `profiles`, `portfolios`, `student_scenarios`).

### Local setup

`.env.local` is already created with the project URL and anon key. To recreate or rotate keys:

1. Copy the example env file (if starting fresh):

   ```bash
   cp .env.local.example .env.local
   ```

2. Open the [Supabase dashboard](https://supabase.com/dashboard/project/oyexzmucngsoyxlxhofy) → **Settings** → **API**.
3. Copy **Project URL** and **anon public** key into `.env.local`:

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://oyexzmucngsoyxlxhofy.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
   ```

4. Restart the dev server after changing env vars.

### AI grading

Artifact lab submissions are graded against NIST SP 800-53 control statement text via Claude. Add a server-side Anthropic key to `.env.local`:

```
ANTHROPIC_API_KEY=<your-anthropic-api-key>
```

Optional: set `ANTHROPIC_MODEL` to override the default (`claude-sonnet-4-20250514`).

Grading runs automatically after `POST /api/lessons/[lessonId]/submit`, or can be invoked directly via `POST /api/lessons/[lessonId]/grade` (students grade their own submission; admins may pass `{ "studentId": "<uuid>" }`).

> `.env.local` is gitignored — never commit it.

### RLS coverage test

`npm run test:rls` connects directly to Postgres (admin role) and fails if any `public` table other than `lessons` and `tracks` is missing RLS or FORCE RLS.

**Local:** add a direct connection string to `.env.local` (not the anon key):

```
DATABASE_URL=postgresql://postgres.[project-ref]:[password]@...
```

Supabase → **Settings** → **Database** → **Connection string** → URI (`postgres` role).

**CI:** add the same URI as a repository secret named `DATABASE_URL` (GitHub → repo **Settings** → **Secrets and variables** → **Actions**). The CI workflow runs `npm run test:rls` when that secret is set; otherwise it prints a skip note.

### Database migration

Migration `0001_foundation` was applied remotely via Supabase MCP (recorded as version `20260806130830`).

To apply manually (e.g. on a new project), open **SQL Editor** in the dashboard and paste the contents of `supabase/migrations/0001_foundation.sql`, then click **Run**.

### Optional: Supabase CLI

The Supabase CLI is not installed on this machine. To use it later:

```bash
brew install supabase/tap/supabase   # or: npm install -g supabase
supabase login
supabase link --project-ref oyexzmucngsoyxlxhofy
supabase db push
```

## Deploying to Vercel

**Production:** [cyberskill-builder.vercel.app](https://cyberskill-builder.vercel.app)

This project deploys as a standard Next.js 14 App Router app. Vercel auto-detects the framework — no `vercel.json` is required (and none is checked in, to avoid overriding the working production deployment).

### Connect repo to Vercel

1. Go to [vercel.com/new](https://vercel.com/new).
2. Import the GitHub repository **mharrison26/Cyberskill-Builder**.
3. **Framework preset:** Next.js (auto-detected).
4. **Root directory:** `.` (repository root).
5. Click **Deploy**.

The GitHub integration is already connected for this project; new clones only need the steps above if you create a separate Vercel project.

### Automatic deployments

- **Preview:** Every pull request gets a unique preview deployment URL automatically.
- **Production:** Merging or pushing to `main` triggers a production deployment.

### Environment variables

In the Vercel project → **Settings** → **Environment Variables**, set the variables from [`.env.local.example`](.env.local.example). Apply each to **Production**, **Preview**, and **Development**.

| Variable | Required | Description |
| -------- | -------- | ----------- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL (`https://oyexzmucngsoyxlxhofy.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon/public key (Settings → API) |
| `ANTHROPIC_API_KEY` | Yes | Server-side Anthropic key for AI lesson grading |
| `ANTHROPIC_MODEL` | No | Override Claude model (default: `claude-sonnet-4-20250514`) |

> `NEXT_PUBLIC_*` variables are embedded in client bundles. They are safe to expose — Supabase Row Level Security protects data. Never add the **service role** key to Vercel.

**Stripe:** Not configured yet — no Stripe keys appear in `.env.local.example`.

**`DATABASE_URL` (optional, CI only):** Not needed for Vercel runtime. If you add RLS integration tests in GitHub Actions that connect directly to Postgres, store `DATABASE_URL` as a GitHub Actions secret, not a Vercel env var.

To add or rotate vars via CLI:

```bash
vercel env add NEXT_PUBLIC_SUPABASE_URL production,preview,development --no-sensitive
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production,preview,development --no-sensitive
vercel env add ANTHROPIC_API_KEY production,preview,development
```

Manual production redeploy:

```bash
vercel --prod
```

| Setting | Value |
| ------- | ----- |
| Vercel project | `cyberskill-builder` (team: CyberSkill Builder) |
| Dashboard | [vercel.com/cyber-skill-builder/cyberskill-builder](https://vercel.com/cyber-skill-builder/cyberskill-builder) |
| GitHub repo | [mharrison26/Cyberskill-Builder](https://github.com/mharrison26/Cyberskill-Builder) |

## Connecting services

Follow these steps once to connect GitHub, Supabase, and Vercel. **Install Xcode Command Line Tools first** — git and several other tools require them on macOS:

```bash
xcode-select --install
```

Ensure Node is on your PATH (if installed to `~/.local/node`):

```bash
export PATH="$HOME/.local/node/bin:$PATH"
```

### 1. Git + GitHub

Remote repository (empty, ready for first push): **https://github.com/mharrison26/Cyberskill-Builder**

After Xcode Command Line Tools are installed:

```bash
cd /Users/Lion/Projects/nextjs-app
export PATH="$HOME/.local/node/bin:$PATH"
git init
git branch -M main
git remote add origin https://github.com/mharrison26/Cyberskill-Builder.git
git add .
git status   # confirm .env.local is NOT listed (ignored via .env*.local)
git commit -m "Initial commit: Next.js 14 starter with Supabase SSR"
git push -u origin main
```

Install and authenticate the GitHub CLI (optional but useful for PRs and repo management):

```bash
brew install gh          # or: https://cli.github.com/manual/installation
gh auth login          # GitHub.com → HTTPS → Login with a web browser
gh auth status
```

### 2. Vercel deployment

See **[Deploying to Vercel](#deploying-to-vercel)** for connect steps, automatic deployments, and environment variables. Production is live at [cyberskill-builder.vercel.app](https://cyberskill-builder.vercel.app).

### Status checklist

| Step                                              | Status                                                                        |
| ------------------------------------------------- | ----------------------------------------------------------------------------- |
| `.gitignore` excludes `.env*.local` and `.vercel` | Done                                                                          |
| Supabase SSR clients configured                   | Done                                                                          |
| Supabase project linked (`oyexzmucngsoyxlxhofy`)  | Done                                                                          |
| `.env.local` with real keys                       | Done                                                                          |
| Foundation migration applied                      | Done                                                                          |
| `npm run build` passes                            | Done                                                                          |
| Git initialized locally                           | Done                                                                          |
| GitHub remote connected & pushed                  | Done                                                                          |
| Vercel project linked (`cyberskill-builder`)      | Done                                                                          |
| Supabase env vars on Vercel (prod + preview)      | Done                                                                          |
| Production deployed                               | Done — [cyberskill-builder.vercel.app](https://cyberskill-builder.vercel.app) |
| GitHub → Vercel auto-deploy                       | Done                                                                          |
| `gh` CLI installed & authenticated                | Optional — `brew install gh` + `gh auth login`                                |

## Learn more

- [Next.js Documentation](https://nextjs.org/docs)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [Supabase + Next.js SSR guide](https://supabase.com/docs/guides/auth/server-side/nextjs)

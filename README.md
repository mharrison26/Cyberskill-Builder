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

> `.env.local` is gitignored — never commit it.

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

**Live URL:** [https://cyberskill-builder.vercel.app](https://cyberskill-builder.vercel.app)

| Setting        | Value                                                                                                                         |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Vercel project | `cyberskill-builder` (team: CyberSkill Builder)                                                                               |
| Dashboard      | [vercel.com/cyber-skill-builder/cyberskill-builder](https://vercel.com/cyber-skill-builder/cyberskill-builder)                |
| GitHub repo    | [mharrison26/Cyberskill-Builder](https://github.com/mharrison26/Cyberskill-Builder) — connected; pushes to `main` auto-deploy |
| Framework      | Next.js 14 (auto-detected)                                                                                                    |

#### Environment variables on Vercel

Both variables are set for **Production**, **Preview**, and **Development**:

| Variable                        | Value source                                                  |
| ------------------------------- | ------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | `https://oyexzmucngsoyxlxhofy.supabase.co`                    |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (masked in dashboard; same as `.env.local`) |

> These are `NEXT_PUBLIC_` vars — they are embedded in client bundles and are safe to expose (Supabase RLS protects data). Never add the **service role** key to Vercel.

To redeploy manually:

```bash
export PATH="$HOME/.local/node/bin:$PATH"
vercel --prod
```

To add or rotate env vars via CLI:

```bash
vercel env add NEXT_PUBLIC_SUPABASE_URL production,preview,development --no-sensitive
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production,preview,development --no-sensitive
```

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

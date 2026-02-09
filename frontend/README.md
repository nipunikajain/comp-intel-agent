# CompIntel — Frontend

Next.js 15 (App Router) + TypeScript + Tailwind + ESLint + **shadcn/ui** (default style, Slate).

## Setup

```bash
cd frontend
npm install
```

## Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Use **Open Executive Dashboard** or go to [/dashboard](http://localhost:3000/dashboard).

## Stack

- **Next.js 15** (App Router, TypeScript, Tailwind, ESLint)
- **shadcn/ui** (Slate) — card, button, input, badge, alert, skeleton, separator
- **lucide-react** — icons

## Dashboard

`app/dashboard/page.tsx` is the Executive Dashboard. It uses a constant `MOCK_DATA` shaped like the backend competitor schema:

- `pricing_tiers` — name, price, features
- `swot_analysis` — strength, weakness, opportunity, threat
- `recent_news` — title, date

Replace `MOCK_DATA` with API calls to your backend when ready.

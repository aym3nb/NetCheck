# Copilot Instructions — NetCheck

## Project Overview

NetCheck is a **client-side-only** DNS leak test and network diagnostic tool. There is no backend server — every API call is made directly from the browser. It is deployed as a static site on GitHub Pages at `https://aym3nb.github.io/NetCheck/`.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Build tool | Vite 7 |
| Framework | React 19 |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v3 (CSS variables, dark-mode via `class` strategy) |
| UI components | shadcn/ui (Radix UI primitives) |
| Icons | Lucide React |
| PWA | vite-plugin-pwa (Workbox) |
| Linting | ESLint 10 with typescript-eslint and react-hooks/react-refresh plugins |
| Package manager | npm |
| CI/CD | GitHub Actions → GitHub Pages |

---

## Project Structure

```
src/
  components/
    Dashboard.tsx          # Main layout, all diagnostic cards, header
    NetworkTopology.tsx    # Visual Device → Router → NextDNS → Web path diagram
    ui/                    # shadcn/ui primitives (badge, button, card, scroll-area,
                           #   skeleton, switch, table)
  hooks/
    useNetDiagnostics.ts   # Core data-fetching hook — all API calls live here
    useTheme.ts            # Dark/light theme toggle with localStorage persistence
  lib/
    utils.ts               # cn() helper (clsx + tailwind-merge)
  App.tsx                  # Root component — renders <Dashboard />
  main.tsx                 # React entry point
  index.css                # Tailwind directives + CSS custom properties (light & dark)
.github/
  workflows/
    gh-pages.yml           # Build and deploy to GitHub Pages on push to main
vite.config.ts             # base: '/NetCheck/', PWA manifest, path alias @/ → src/
tailwind.config.js         # darkMode: 'class', CSS-variable colour tokens, shadcn radii
```

---

## Architecture & Key Patterns

### Data Fetching — `useNetDiagnostics`

All diagnostic logic lives in `src/hooks/useNetDiagnostics.ts`. The hook exposes:

```ts
{ ipInfo, nextDns, dnsLeak, dnsLeakEntries, dnsLeakAllSecure,
  latency, loading, lastUpdated, error, auditLog,
  autoRefresh, setAutoRefresh, refresh }
```

**Diagnostic sequence** (all parallel where possible, each updates the audit log):

1. **IP lookup** — `GET https://ipapi.co/json/` → `IpInfo`
2. **NextDNS detection** — `GET https://test.nextdns.io/` via `corsproxy.io` (CORS proxy); falls back to a `no-cors` fetch; if both fail, attempts a DoH probe to distinguish CORS block from firewall block.
3. **DNS leak test (primary)** — bash.ws 3-step flow:
   - Obtain a test ID from `https://bash.ws/dnsleak/id` (via corsproxy)
   - Fire 8 parallel `no-cors` probes to `https://{i}.{testId}.bash.ws/pixel.png`
   - Fetch results from `https://bash.ws/dnsleak/result/{testId}` (via corsproxy)
   - Each resolver entry is classified as `"secure"` (NextDNS/Anexia ASN) or `"leak"`
4. **DNS leak test (fallback)** — `GET https://edns.ip-api.com/json` when the bash.ws flow fails
5. **Latency probe** — `HEAD https://1.1.1.1/favicon.ico` via `no-cors`; result classified as Excellent / Good / Fair
6. **Connection type** — `navigator.connection.effectiveType`

### Timeout & Error Handling

- All fetches use `fetchWithTimeout` (5 000 ms, `AbortController`).
- `no-cors` fetches use `fetchNoCorsWithTimeout` (skips `response.ok` check — status is always 0 for opaque responses).
- Every step appends an `AuditEntry` regardless of success or failure.
- The audit log retains the last 100 entries across refreshes.

### Theme

`useTheme` reads from `localStorage` (`netcheck-theme`), falls back to `prefers-color-scheme`. It toggles the `dark` class on `<html>`. Tailwind's `darkMode: ["class"]` strategy drives all dark-mode variants.

### Path Alias

`@/` resolves to `src/`. Use it for all internal imports (e.g. `import { cn } from "@/lib/utils"`).

---

## External APIs

| API | Usage | CORS proxy needed? |
|---|---|---|
| `ipapi.co/json` | IP, ISP, location, timezone | No |
| `test.nextdns.io` | NextDNS status, config ID, protocol, server | Yes — corsproxy.io |
| `bash.ws/dnsleak/*` | Multi-resolver DNS leak test | Yes — corsproxy.io (result endpoints) |
| `edns.ip-api.com/json` | Fallback single-resolver DNS check | No |
| `1.1.1.1/favicon.ico` | Latency probe | No (no-cors) |

---

## Coding Guidelines

- **TypeScript strict mode** — all interfaces are exported from `useNetDiagnostics.ts` and imported explicitly where used.
- **No backend** — never add server-side code. All data must be fetched client-side.
- **No new external libraries** unless absolutely necessary. Prefer what is already in `package.json`.
- **shadcn/ui components** — add new primitives under `src/components/ui/` following the existing pattern.
- **Tailwind only** — do not write custom CSS beyond what is in `index.css`. Use `cn()` for conditional class merging.
- **Comments** — only where logic is non-obvious (e.g. the CORS fallback chain, opaque response handling).
- **No tests** — the project has no test suite; do not add one unless explicitly requested.

---

## Development

```bash
npm install
npm run dev      # Vite dev server at http://localhost:5173/NetCheck/
npm run build    # tsc + Vite build → dist/
npm run lint     # ESLint
npm run preview  # Serve dist/ locally
```

## Deployment

Merging to `main` triggers `.github/workflows/gh-pages.yml`, which:
1. Runs `npm ci` and `npm run build` on Node 24
2. Uploads `dist/` as a Pages artifact
3. Deploys to `https://aym3nb.github.io/NetCheck/`

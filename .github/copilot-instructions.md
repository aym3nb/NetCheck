# Copilot Instructions — NetCheck

## 1. Core Persona & Role

You are an expert Senior Full-Stack Engineer specializing in high-performance, static network diagnostic tools. Your guiding philosophy is **client-side-first**: no backend, no server secrets, every diagnostic call made directly from the browser. You hold the architecture accountable to clarity, DRY abstractions, full type-safety, and accessible UI.

---

## 2. Project Overview

NetCheck is a **client-side-only** DNS leak test and network diagnostic tool. There is no backend server — every API call is made directly from the browser. It is deployed as a static site on GitHub Pages at `https://aym3nb.github.io/NetCheck/`.

---

## 3. Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js v24 (LTS) |
| Build tool | Vite 7 |
| Framework | React 19 |
| Language | TypeScript ~6 (strict) |
| Styling | Tailwind CSS v3 (CSS variables, dark-mode via `class` strategy) |
| UI components | shadcn/ui (Radix UI primitives) |
| Icons | Lucide React |
| PWA | vite-plugin-pwa (Workbox, `autoUpdate`, `registerType`) |
| Linting | ESLint 10 with typescript-eslint and react-hooks/react-refresh plugins |
| Package manager | npm |
| CI/CD | GitHub Actions → GitHub Pages |

---

## 4. Sources of Truth

When generating or reviewing code, always defer to the official documentation for these sources:

| Source | URL | Relevance |
|---|---|---|
| shadcn/ui | ui.shadcn.com | Component installation (CLI) and primitive patterns |
| Tailwind CSS v3 | tailwindcss.com | CSS-variable-based theming, `darkMode: ["class"]` |
| Vite | vitejs.dev | Static production builds, `dist/` output, `base` path |
| MDN Web Docs | developer.mozilla.org | `AbortController`, Fetch API, ServiceWorker |

---

## 5. Project Structure

```
src/
  components/
    Dashboard.tsx          # Main layout, all diagnostic cards, header, sub-components:
                           #   DataRow, StatusBadge, NextDnsIcon, LeakIcon,
                           #   DnsLeakTable, AuditLog, countryCodeToFlag
    NetworkTopology.tsx    # Visual Device → Router → NextDNS → Web path diagram
                           #   TopoNode (highlight: blue | green | yellow | default)
                           #   Connector (color: blue | green | muted)
    ui/                    # shadcn/ui primitives (badge, button, card, scroll-area,
                           #   skeleton, switch, table)
  hooks/
    useNetDiagnostics.ts   # Core data-fetching hook — all API calls live here
                           #   Exports: IpInfo, NextDnsInfo, DnsLeakInfo, DnsLeakEntry,
                           #            LatencyInfo, AuditEntry, DiagnosticState
    useTheme.ts            # Dark/light theme toggle with localStorage persistence
  lib/
    utils.ts               # cn() helper (clsx + tailwind-merge)
  App.tsx                  # Root component — renders <Dashboard />
  main.tsx                 # React entry point
  index.css                # Tailwind directives + CSS custom properties (light & dark)
.github/
  copilot-instructions.md  # This file
  workflows/
    gh-pages.yml           # Build and deploy to GitHub Pages on push to main
vite.config.ts             # base: '/NetCheck/', PWA manifest, path alias @/ → src/
tailwind.config.js         # darkMode: 'class', CSS-variable colour tokens, shadcn radii
```

---

## 6. Architecture & Key Patterns

### Data Fetching — `useNetDiagnostics`

All diagnostic logic lives in `src/hooks/useNetDiagnostics.ts`. The hook signature:

```ts
useNetDiagnostics(autoRefreshInterval = 60_000)
```

It exposes:

```ts
{ ipInfo, nextDns, dnsLeak, dnsLeakEntries, dnsLeakAllSecure,
  latency, loading, lastUpdated, error, auditLog,
  autoRefresh, setAutoRefresh, refresh }
```

**Exported interfaces** (import explicitly; do not re-declare):

```ts
IpInfo          // ip, isp, city, region, country_name, latitude, longitude, timezone, org
NextDnsInfo     // status, configId?, protocol?, server?, blockReason?
DnsLeakInfo     // ip, geo, isSameAsPublic
DnsLeakEntry    // ip, country, countryCode, isp, hostname?, status
LatencyInfo     // pingMs, connectionType
AuditEntry      // timestamp (ISO 8601), event, statusCode
DiagnosticState // full hook state shape
```

**Diagnostic sequence** (runs on mount and on each manual/auto refresh):

1. **IP lookup** — `GET https://ipapi.co/json/` → `IpInfo`
2. **NextDNS detection** — three-tier fallback:
   - Proxy: `GET https://corsproxy.io/?url=https://test.nextdns.io/` (CORS mode)
   - Fallback: `no-cors` fetch to `https://test.nextdns.io` (opaque response → treated as connected)
   - Block probe: DoH fetch to `https://dns.nextdns.io/resolve?name=test.nextdns.io` to distinguish `"cors"` vs `"network"` block reason
3. **DNS leak test (primary)** — bash.ws 3-step flow:
   - Obtain test ID from `https://bash.ws/dnsleak/id` (via corsproxy)
   - Fire **8 parallel** `no-cors` probes to `https://{i}.{testId}.bash.ws/pixel.png` to force multi-resolver DNS queries
   - Wait **1 500 ms** for DNS propagation to reach bash.ws servers
   - Fetch results from `https://bash.ws/dnsleak/result/{testId}` (via corsproxy)
   - Classify each entry: `"secure"` if ISP/hostname contains "nextdns" or "anexia"; otherwise `"leak"`
4. **DNS leak test (fallback)** — `GET https://edns.ip-api.com/json` when the bash.ws flow fails; produces a single entry with `status: "unknown"`
5. **Latency probe** — `HEAD https://1.1.1.1/favicon.ico?_={Date.now()}` via `no-cors`, timed with `performance.now()`; classified as **Excellent** (<50 ms) / **Good** (<150 ms) / **Fair** (≥150 ms)
6. **Connection type** — reads `navigator.connection || navigator.mozConnection || navigator.webkitConnection`; returns `effectiveType || type || "Unknown"`

### Internal Helper Functions

| Function | Purpose |
|---|---|
| `fetchWithTimeout(url, options)` | 5 000 ms `AbortController` + `response.ok` check |
| `fetchNoCorsWithTimeout(url, options)` | Same timeout; omits `response.ok` check (status always 0 for opaque responses) |
| `measureLatency()` | Times a `no-cors` HEAD to `1.1.1.1` using `performance.now()` |
| `getConnectionType()` | Reads vendor-prefixed `navigator.connection` |
| `isCorsOrNetworkError(err)` | Detects CORS/network failures by error message keywords and `AbortError` name |
| `makeEntry(event, statusCode)` | Creates an `AuditEntry` with `new Date().toISOString()` timestamp |

### Timeout & Error Handling

- Every fetch uses `AbortController` with a **5 000 ms** timeout.
- `no-cors` fetches skip `response.ok` — the browser always returns status `0` for opaque responses.
- Every step appends an `AuditEntry` regardless of success or failure.
- The audit log retains the **last 100 entries** (prepend new, slice to 100) across refreshes.
- `isCorsOrNetworkError` catches `"failed to fetch"`, `"networkerror"`, `"cors"`, `"load"`, and `AbortError`.

### NetworkTopology — State-to-Visual Mapping

`NetworkTopology` (`src/components/NetworkTopology.tsx`) renders four nodes connected by directional arrows:

**Device → Router → NextDNS → The Web**

`TopoNode` highlight mapping:

| Node | Condition | Highlight | Visual Effect |
|---|---|---|---|
| Device | always | `default` | neutral border/bg |
| Router | `leakDetected` | `yellow` | amber glow (`shadow-yellow-400/30 shadow-[0_0_12px_2px]`) |
| Router | no leak / loading | `default` | neutral |
| NextDNS | `nextDnsOk` | `blue` | blue border + bg tint |
| NextDNS | not active / loading | `default` | neutral |
| The Web | `hasIp` | `green` | emerald border + bg tint |
| The Web | no IP / loading | `default` | neutral |

`Connector` color follows the same logic: `blue` when NextDNS is active, `green` when IP resolved, `muted` otherwise. All transitions use `transition-all duration-300`.

### Theme

`useTheme` reads from `localStorage` key `"netcheck-theme"`, falls back to `prefers-color-scheme`. It toggles the `dark` class on `<html>` via `useLayoutEffect`. Tailwind's `darkMode: ["class"]` strategy drives all dark-mode variants.

### Auto-Refresh

`autoRefreshInterval` defaults to **60 000 ms**. When `autoRefresh` is `true` a `setInterval` is registered; it is cleared on toggle-off or unmount. The header displays `"Auto (60s)"` as the label.

### Path Alias

`@/` resolves to `src/`. Use it for **all** internal imports (e.g. `import { cn } from "@/lib/utils"`).

---

## 7. External APIs

| API | Usage | CORS proxy needed? |
|---|---|---|
| `ipapi.co/json` | IP, ISP, location, timezone | No |
| `test.nextdns.io` | NextDNS status, config ID, protocol, server | Yes — corsproxy.io |
| `bash.ws/dnsleak/id` | Obtain test ID for multi-resolver leak test | Yes — corsproxy.io |
| `bash.ws/dnsleak/result/{id}` | Fetch resolver results | Yes — corsproxy.io |
| `{i}.{testId}.bash.ws/pixel.png` | DNS probe pixels (8 parallel) | No (no-cors) |
| `edns.ip-api.com/json` | Fallback single-resolver DNS check | No |
| `1.1.1.1/favicon.ico` | Latency probe | No (no-cors) |
| `dns.nextdns.io/resolve` | DoH block-reason probe | No (cors) |

---

## 8. Implementation Principles

- **DRY** — Abstract shared network logic into custom hooks (`useNetDiagnostics`). Never duplicate fetch/timeout patterns inline.
- **Type safety** — All interfaces are exported from `useNetDiagnostics.ts` and imported explicitly wherever used. Do not use `any`.
- **Asynchronous resilience** — Every network request **must** use `fetchWithTimeout` or `fetchNoCorsWithTimeout`. No bare `fetch()` calls.
- **No backend** — Never add server-side code. All data must be fetched client-side.
- **Accessibility** — All shadcn/ui components maintain ARIA standards; interactive controls must have `aria-label` or `aria-pressed` where applicable (see the theme toggle button in `Dashboard.tsx`).
- **Timestamps** — Always use **ISO 8601** for all audit log and display timestamps (`new Date().toISOString()`).
- **No new external libraries** unless absolutely necessary. Prefer what is already in `package.json`.
- **shadcn/ui components** — Add new primitives under `src/components/ui/` using the shadcn CLI pattern.
- **Tailwind only** — Do not write custom CSS beyond what is in `index.css`. Use `cn()` (clsx + tailwind-merge) for conditional class merging.
- **Comments** — Only where logic is non-obvious (e.g. the CORS fallback chain, opaque response handling, the 1 500 ms DNS propagation delay).
- **No tests** — The project has no test suite; do not add one unless explicitly requested.

---

## 9. Documentation & Quality Assurance Protocol

### README-Driven Development

For every functional change or new feature (e.g. a new diagnostic step, a new UI card, a new API), the agent **must** update `README.md`:
- Document any new or changed dependencies.
- Update the "How it Works" / diagnostic sequence description.
- Maintain an accurate "Technical Stack" list.

### Self-Review Checklist

Before declaring a task done, perform a virtual code review:
- [ ] No `console.log` statements left in production code.
- [ ] `vite.config.ts` still has `base: '/NetCheck/'` — do not revert.
- [ ] Tailwind classes are consolidated and follow a logical order (layout → spacing → colour → animation).
- [ ] All new `fetch()` calls go through `fetchWithTimeout` or `fetchNoCorsWithTimeout`.
- [ ] All new interfaces are exported from `useNetDiagnostics.ts` and imported by name in consumers.
- [ ] `AuditEntry` timestamps use `new Date().toISOString()`.
- [ ] Any new interactive element has an appropriate `aria-label`.

### Verification Summary

After finishing a file, briefly summarize:
1. **What changed** — which functions, components, or interfaces were added/modified.
2. **How it impacts network logic** — does it affect the diagnostic sequence, the audit log, or the topology visual mapping?

---

## 10. Deployment Protocol

Merging to `main` triggers `.github/workflows/gh-pages.yml`, which uses:
- `actions/checkout@v5`
- `actions/setup-node@v6` with Node 24 and npm cache
- `npm ci && npm run build` (`tsc -b && vite build` → `dist/`)
- `actions/upload-pages-artifact@v3` (uploads `dist/`)
- `actions/deploy-pages@v4` → `https://aym3nb.github.io/NetCheck/`

---

## 11. Development Commands

```bash
npm install
npm run dev      # Vite dev server at http://localhost:5173/NetCheck/
npm run build    # tsc -b && vite build → dist/
npm run lint     # ESLint (typescript-eslint + react-hooks + react-refresh)
npm run preview  # Serve dist/ locally
```

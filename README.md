# NetCheck

**NetCheck** is a free, instant DNS leak test and network diagnostic tool built with Vite + React + TypeScript + Tailwind CSS v3 + shadcn/ui.

## Features

- 🌐 **Public Identity** — Shows your public IP, ISP/org, location, and timezone
- 🔐 **VPN Integrity Check** — Select your expected VPN exit city from a list of major global nodes; a green "VPN Exit Verified" badge confirms your public IP matches the selected location, or a red pulsing "Location Mismatch" badge alerts you when it doesn't. Verification is done client-side by comparing the city returned by the IP lookup API with your selection.
- 🏅 **Anonymity & Privacy Score** — Dynamic letter grade (A / C / F) calculated from your current network state. Grade A requires NextDNS active, no DNS leaks, and VPN location confirmed. Grade C means NextDNS is active but no VPN city is matched. Grade F indicates a DNS leak or no NextDNS protection. A Skeleton loader is shown while diagnostics are still running.
- 🛡️ **NextDNS Status** — Detects if you are using NextDNS and shows config ID, protocol, and server; links directly to [test.nextdns.io](https://test.nextdns.io) for detailed logs
- 🔒 **DNS Leak Test** — Shows your primary DNS resolver IP and ISP via ip-api.com; multi-resolver detail via bash.ws (8 parallel probes) when available; one-click deep-packet inspection via [dnsleaktest.com](https://dnsleaktest.com) — the industry-standard external tool used as the "Standard of Truth" for comprehensive diagnostics
- ⚡ **Network Performance** — Measures latency to 1.1.1.1, detects connection type, and rates connection quality
- 🗺️ **Network Path** — Visual topology diagram showing the path from your device through your router and NextDNS to the internet
- 📋 **Audit Log** — Timestamped log of every diagnostic event and its result, kept across refreshes
- 🌗 **Dark / Light mode** — Toggle between dark and light themes
- 🔄 **Auto-refresh** — Optional 60-second auto-refresh toggle
- 📱 **PWA ready** — Installable as a Progressive Web App (standalone display mode, Workbox service worker)

## Tech Stack

- [Vite 7](https://vitejs.dev/) + [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS v3](https://tailwindcss.com/)
- [shadcn/ui](https://ui.shadcn.com/) components
- [Lucide React](https://lucide.dev/) icons
- [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) for PWA support

## Architecture

NetCheck uses a **Backend-for-Frontend (BFF)** deployed as a Cloudflare Worker to handle cross-origin data aggregation and provide edge metadata. The frontend calls the BFF directly; the BFF in turn queries upstream APIs (ipapi.co, test.nextdns.io) server-side and returns normalised JSON with an `X-NetCheck-Edge` response header that identifies the Cloudflare edge location that served the request.

- **BFF source**: [github.com/aym3nb/NetCheck-BFF](https://github.com/aym3nb/NetCheck-BFF)
- **BFF worker**: `https://netcheck-bff.aym3nb-cf.workers.dev`

> **Note**: Full IP and NextDNS diagnostics require the NetCheck-BFF to be reachable at `VITE_BFF_URL`. If the BFF is unavailable, those steps degrade gracefully to a "Service Unavailable" audit entry; DNS leak and latency tests continue to run client-side.

## Data Sources

The BFF (`https://netcheck-bff.aym3nb-cf.workers.dev`) aggregates upstream APIs on the edge. Direct client-side calls are still made for DNS leak probes and latency.

| Source | Purpose | How accessed |
|---|---|---|
| [NetCheck-BFF](https://github.com/aym3nb/NetCheck-BFF) `/ip-info` | Public IP, ASN/org, location, timezone | Via BFF (Cloudflare Worker) |
| [NetCheck-BFF](https://github.com/aym3nb/NetCheck-BFF) `/nextdns` | NextDNS status (ok / unconfigured / not-using) | Via BFF (Cloudflare Worker) |
| [edns.ip-api.com](https://edns.ip-api.com/) | Primary DNS resolver IP, ISP, and location | Client-side |
| [bash.ws/dnsleak](https://bash.ws/) | Multi-resolver DNS leak detail (8 parallel probes) | Client-side (`no-cors`) |
| [1.1.1.1](https://1.1.1.1/) | Latency probe | Client-side (`no-cors`) |
| [dnsleaktest.com](https://dnsleaktest.com) | External Standard of Truth for deep-packet DNS diagnostics | External link |

### VPN Exit City Verification

The VPN Integrity Check works entirely client-side:

1. After each diagnostic run, `ipapi.co` returns the city that corresponds to your current public IP address.
2. You select your expected VPN exit node from the dropdown (e.g. "Amsterdam").
3. The dashboard performs a **case-insensitive string comparison** between the API-reported city and your selected city.
4. If they match, a green "VPN Exit Verified" badge is shown. If they differ, a red pulsing "Location Mismatch" badge is shown instead. No badge is shown until a city is selected.

> **Note**: City names from VPN providers and IP geolocation databases may differ slightly. If your VPN connects to a city that is geographically close but labelled differently, select the city that your VPN provider advertises for that exit node.

### External Test Links as Standard of Truth

For comprehensive DNS leak analysis beyond what a browser-based tool can provide, NetCheck links directly to [dnsleaktest.com](https://dnsleaktest.com). This ad-free industry-standard tool performs deep-packet inspection and multi-protocol resolver testing that requires a dedicated server environment. NetCheck acts as a clean, always-available dashboard; dnsleaktest.com is used for definitive verification.

## Development

```bash
# 1. Copy the environment template (already committed for production)
cp .env.production .env.local   # or create .env.local manually

# .env.local contents:
# VITE_BFF_URL=https://netcheck-bff.aym3nb-cf.workers.dev

npm install
npm run dev
```

## Build

```bash
npm run build
```

## Deployment

Automatically deployed to [GitHub Pages](https://aym3nb.github.io/NetCheck/) via GitHub Actions on every push to `main`.

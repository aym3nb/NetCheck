# NetCheck

**NetCheck** is a free, instant DNS leak test and network diagnostic tool built with Vite + React + TypeScript + Tailwind CSS v3 + shadcn/ui.

## Features

- 🌐 **Public Identity** — Shows your public IP, ISP/org, location, and timezone
- 🛡️ **NextDNS Status** — Detects if you are using NextDNS and shows config ID, protocol, and server
- 🔒 **DNS Leak Test** — Multi-resolver leak test (8 parallel probes via bash.ws) with a full table showing each resolver's IP, country, ISP, and secure/leak status; falls back to edns.ip-api.com when the primary test is unavailable
- ⚡ **Network Performance** — Measures latency to 1.1.1.1, detects connection type, and rates connection quality
- 🗺️ **Network Path** — Visual topology diagram showing the path from your device through your router and NextDNS to the internet
- 📋 **Audit Log** — Timestamped log of every diagnostic event and its result, kept across refreshes
- 🌗 **Dark / Light mode** — Toggle between dark and light themes
- 🔄 **Auto-refresh** — Optional 60-second auto-refresh toggle
- 📱 **PWA ready** — Installable as a Progressive Web App

## Tech Stack

- [Vite 7](https://vitejs.dev/) + [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS v3](https://tailwindcss.com/)
- [shadcn/ui](https://ui.shadcn.com/) components
- [Lucide React](https://lucide.dev/) icons
- [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) for PWA support

## Data Sources

All requests are made client-side directly from the browser — no backend server is involved.

| Source | Purpose |
|---|---|
| [ipapi.co](https://ipapi.co/) | Public IP, ISP, location, timezone |
| [test.nextdns.io](https://test.nextdns.io/) via [corsproxy.io](https://corsproxy.io/) | NextDNS detection (config ID, protocol, server) |
| [bash.ws/dnsleak](https://bash.ws/) | Multi-resolver DNS leak test (primary) |
| [edns.ip-api.com](https://edns.ip-api.com/) | Single-resolver DNS leak check (fallback) |
| [1.1.1.1](https://1.1.1.1/) | Latency probe |

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Deployment

Automatically deployed to [GitHub Pages](https://aym3nb.github.io/NetCheck/) via GitHub Actions on every push to `main`.

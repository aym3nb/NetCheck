# NetCheck

**NetCheck** is a free, instant DNS leak test and network diagnostic tool built with Vite + React + TypeScript + Tailwind CSS v3 + shadcn/ui.

## Features

- 🌐 **Public Identity** — Shows your public IP, ISP/org, location, and timezone
- 🛡️ **NextDNS Status** — Detects if you are using NextDNS and shows config ID, protocol, and server
- 🔒 **DNS Security** — Checks for DNS leaks by comparing your DNS resolver IP with your public IP
- ⚡ **Network Performance** — Measures latency to 1.1.1.1 and detects connection type
- 🔄 **Auto-refresh** — Optional 60-second auto-refresh toggle
- 📱 **PWA ready** — Installable as a Progressive Web App

## Tech Stack

- [Vite](https://vitejs.dev/) + [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS v3](https://tailwindcss.com/)
- [shadcn/ui](https://ui.shadcn.com/) components
- [Lucide React](https://lucide.dev/) icons

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

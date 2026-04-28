import { useState, useEffect, useCallback, useRef } from "react";

const BFF_URL = (import.meta.env.VITE_BFF_URL as string | undefined) ?? "";

export interface IpInfo {
  ip: string;
  isp: string;
  city: string;
  region: string;
  country_name: string;
  latitude: number;
  longitude: number;
  timezone: string;
  org: string;
  asn?: string;
}

export interface ConnectionInfo {
  connectionType: string;
  pingMs: number | null;
}

export type TunnelType = "VPN" | "Proxy" | null;

export interface AuditEntry {
  timestamp: string; // ISO 8601
  event: string;
  statusCode: string;
}

export interface DiagnosticState {
  ipInfo: IpInfo | null;
  latency: ConnectionInfo;
  isTor: boolean;
  tunnelType: TunnelType;
  isPinging: boolean;
  loading: boolean;
  lastUpdated: Date | null;
  error: string | null;
  auditLog: AuditEntry[];
  edgeLocation: string | null;
}

const FETCH_TIMEOUT_MS = 5000;
const PING_INTERVAL_MS = 3000;
const PING_URL = "https://1.1.1.1/favicon.ico";

// Known VPN provider keywords (case-insensitive)
const VPN_KEYWORDS = [
  "nordvpn", "nord vpn", "mullvad", "expressvpn", "express vpn",
  "surfshark", "protonvpn", "proton vpn", "windscribe", "private internet access",
  "pia vpn", "ivpn", "hidemyass", "ipvanish", "cyberghost", "purevpn",
  "torguard", "airvpn", "perfect privacy",
];

// Hosting / datacenter keywords that suggest a proxy or cloud exit node
const HOSTING_KEYWORDS = [
  "hosting", "datacenter", "data center", "colocation", "cloud",
  "digitalocean", "linode", "vultr", "amazon", "google", "microsoft",
  "ovh", "hetzner", "leaseweb", "choopa", "cogent", "fastly", "cloudflare",
  "akamai", "serverius", "quadranet", "m247",
];

interface BffIpInfoResponse {
  ip?: string;
  asn?: string | number;
  asOrganization?: string;
  isp?: string;
  org?: string;
  city?: string;
  region?: string;
  country_name?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  isTor?: boolean;
}

async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchNoCorsWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, mode: "no-cors", signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Measures a single round-trip ping to 1.1.1.1 using a no-cors HEAD request. */
async function measureLatency(): Promise<number | null> {
  // Build the cache-busting URL before starting the timer so only network time is measured
  const url = `${PING_URL}?_=${Date.now()}`;
  const t0 = performance.now();
  try {
    await fetchNoCorsWithTimeout(url, { method: "HEAD" });
    return Math.round(performance.now() - t0);
  } catch {
    return null;
  }
}

/**
 * Maps the raw navigator.connection fields to a human-readable label.
 * - 'wifi' type → "Wi-Fi"
 * - 'cellular' type: '5g' → "5G", '4g' → "4G", '3g' → "3G", otherwise "Cellular"
 * - 'ethernet' or unknown → "Ethernet/Wired" (common for OpenWRT desktop setups)
 */
function getConnectionType(): string {
  const nav = navigator as Navigator & {
    connection?: { effectiveType?: string; type?: string };
    mozConnection?: { effectiveType?: string; type?: string };
    webkitConnection?: { effectiveType?: string; type?: string };
  };
  const conn = nav.connection || nav.mozConnection || nav.webkitConnection;
  if (!conn) return "Ethernet/Wired";

  const type = conn.type?.toLowerCase() ?? "";
  const effective = conn.effectiveType?.toLowerCase() ?? "";

  if (type === "wifi") return "Wi-Fi";
  if (type === "cellular") {
    if (effective === "5g") return "5G";
    if (effective === "4g") return "4G";
    if (effective === "3g") return "3G";
    return "Cellular";
  }
  // ethernet, other, or unknown
  if (type === "ethernet") return "Ethernet/Wired";
  return "Ethernet/Wired";
}

/**
 * Determines whether the ISP/org string indicates a VPN or Proxy/Hosting service.
 * Returns "VPN" for known VPN providers, "Proxy" for datacenter/hosting IPs,
 * or null for regular ISPs.
 */
function detectTunnelType(orgOrIsp: string): TunnelType {
  const lower = orgOrIsp.toLowerCase();
  if (VPN_KEYWORDS.some((k) => lower.includes(k))) return "VPN";
  if (HOSTING_KEYWORDS.some((k) => lower.includes(k))) return "Proxy";
  return null;
}

function isCorsOrNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("cors") ||
    msg.includes("load") ||
    err.name === "AbortError"
  );
}

function makeEntry(event: string, statusCode: string, edgeLocation?: string | null): AuditEntry {
  const prefix = edgeLocation ? `[${edgeLocation}] ` : "";
  return { timestamp: new Date().toISOString(), event: `${prefix}${event}`, statusCode };
}

export function useNetDiagnostics(autoRefreshInterval = 60000) {
  const [state, setState] = useState<DiagnosticState>({
    ipInfo: null,
    latency: { connectionType: "", pingMs: null },
    isTor: false,
    tunnelType: null,
    isPinging: false,
    loading: true,
    lastUpdated: null,
    error: null,
    auditLog: [],
    edgeLocation: null,
  });
  const [autoRefresh, setAutoRefresh] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runPing = useCallback(async () => {
    setState((prev) => ({ ...prev, isPinging: true }));
    const pingMs = await measureLatency();
    setState((prev) => ({
      ...prev,
      isPinging: false,
      latency: { ...prev.latency, pingMs },
    }));
  }, []);

  const runDiagnostics = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    const newEntries: AuditEntry[] = [];

    // Edge location extracted from the first successful BFF response header
    let edgeLocation: string | null = null;

    // --- IP Info (via BFF) ---
    let ipInfo: IpInfo | null = null;
    let isTor = false;
    let tunnelType: TunnelType = null;
    try {
      const resp = await fetchWithTimeout(`${BFF_URL}/ip-info`);
      edgeLocation = resp.headers.get("X-NetCheck-Edge");
      const data = await resp.json() as BffIpInfoResponse;
      const orgOrIsp = data.asOrganization ?? data.org ?? data.isp ?? "";
      ipInfo = {
        ip: data.ip ?? "",
        isp: orgOrIsp,
        city: data.city ?? "",
        region: data.region ?? "",
        country_name: data.country_name ?? data.country ?? "",
        latitude: typeof data.latitude === "number" ? data.latitude : 0,
        longitude: typeof data.longitude === "number" ? data.longitude : 0,
        timezone: data.timezone ?? "",
        org: orgOrIsp,
        asn: data.asn != null ? String(data.asn) : undefined,
      };
      isTor = data.isTor === true;
      tunnelType = isTor ? null : detectTunnelType(orgOrIsp);
      newEntries.push(makeEntry("IP Lookup", "200 OK", edgeLocation));
    } catch (err) {
      const code = isCorsOrNetworkError(err) ? "BFF Unavailable" : (err instanceof Error ? err.message : "ERR");
      newEntries.push(makeEntry("IP Lookup", code));
    }

    const connectionType = getConnectionType();

    // Run initial ping immediately
    const pingMs = await measureLatency();

    setState((prev) => ({
      ipInfo,
      latency: { connectionType, pingMs },
      isTor,
      tunnelType,
      isPinging: false,
      loading: false,
      lastUpdated: new Date(),
      error: null,
      auditLog: [...newEntries, ...prev.auditLog].slice(0, 100),
      edgeLocation,
    }));
  }, []);

  // Start live ping loop on mount; restart when diagnostics refresh
  useEffect(() => {
    // Clear any existing ping interval before setting a new one
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
    }
    pingIntervalRef.current = setInterval(runPing, PING_INTERVAL_MS);
    return () => {
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
    };
  }, [runPing]);

  useEffect(() => {
    runDiagnostics();
  }, [runDiagnostics]);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(runDiagnostics, autoRefreshInterval);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [autoRefresh, autoRefreshInterval, runDiagnostics]);

  return { ...state, autoRefresh, setAutoRefresh, refresh: runDiagnostics };
}

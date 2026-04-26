import { useState, useEffect, useCallback, useRef } from "react";

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
}

export interface NextDnsInfo {
  status: "ok" | "not-using" | "blocked" | "error" | "loading";
  configId?: string;
  protocol?: string;
  server?: string;
  /** Extra detail when status is 'blocked': 'cors' means browser/CORS blocked; 'network' means firewall-level */
  blockReason?: "cors" | "network";
}

export interface DnsLeakInfo {
  ip: string;
  geo: string;
  isSameAsPublic: boolean;
}

export interface LatencyInfo {
  pingMs: number | null;
  connectionType: string;
}

export interface AuditEntry {
  timestamp: string; // ISO 8601
  event: string;
  statusCode: string;
}

export interface DiagnosticState {
  ipInfo: IpInfo | null;
  nextDns: NextDnsInfo;
  dnsLeak: DnsLeakInfo | null;
  latency: LatencyInfo;
  loading: boolean;
  lastUpdated: Date | null;
  error: string | null;
  auditLog: AuditEntry[];
}

const FETCH_TIMEOUT_MS = 5000;

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

async function measureLatency(): Promise<number> {
  const start = performance.now();
  try {
    await fetch(`https://1.1.1.1/favicon.ico?_=${Date.now()}`, {
      method: "HEAD",
      mode: "no-cors",
      cache: "no-store",
    });
  } catch {
    // no-cors fetch may throw, but timing is still valid
  }
  return Math.round(performance.now() - start);
}

function getConnectionType(): string {
  const nav = navigator as Navigator & {
    connection?: { effectiveType?: string; type?: string };
    mozConnection?: { effectiveType?: string; type?: string };
    webkitConnection?: { effectiveType?: string; type?: string };
  };
  const conn = nav.connection || nav.mozConnection || nav.webkitConnection;
  if (!conn) return "Unknown";
  return conn.effectiveType || conn.type || "Unknown";
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

function makeEntry(event: string, statusCode: string): AuditEntry {
  return { timestamp: new Date().toISOString(), event, statusCode };
}

export function useNetDiagnostics(autoRefreshInterval = 60000) {
  const [state, setState] = useState<DiagnosticState>({
    ipInfo: null,
    nextDns: { status: "loading" },
    dnsLeak: null,
    latency: { pingMs: null, connectionType: "Unknown" },
    loading: true,
    lastUpdated: null,
    error: null,
    auditLog: [],
  });
  const [autoRefresh, setAutoRefresh] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runDiagnostics = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    const newEntries: AuditEntry[] = [];

    // --- IP Info ---
    let ipInfo: IpInfo | null = null;
    try {
      const resp = await fetchWithTimeout("https://ipapi.co/json/");
      ipInfo = (await resp.json()) as IpInfo;
      newEntries.push(makeEntry("IP Lookup", "200 OK"));
    } catch (err) {
      const code = isCorsOrNetworkError(err) ? "Blocked/Firewalled" : (err instanceof Error ? err.message : "ERR");
      newEntries.push(makeEntry("IP Lookup", code));
    }

    // --- NextDNS ---
    let nextDns: NextDnsInfo = { status: "not-using" };
    try {
      const resp = await fetchWithTimeout("https://test.nextdns.io/", { mode: "cors" });
      const data = await resp.json();
      if (data && data.status === "ok") {
        nextDns = { status: "ok", configId: data.configId, protocol: data.protocol, server: data.server };
        newEntries.push(makeEntry("NextDNS Check", "200 OK — Linked"));
      } else {
        nextDns = { status: "not-using" };
        newEntries.push(makeEntry("NextDNS Check", "200 OK — Not Configured"));
      }
    } catch (err) {
      if (isCorsOrNetworkError(err)) {
        // Fallback: try DoH to determine if it's a CORS issue or a true network block
        let blockReason: NextDnsInfo["blockReason"] = "network";
        try {
          const dohResp = await fetchWithTimeout("https://dns.nextdns.io/resolve?name=test.nextdns.io", { mode: "cors" });
          const dohData = await dohResp.json();
          // A valid DoH response includes a 'Status' field (0 = NOERROR) and an 'Answer' array
          if (typeof dohData === "object" && dohData !== null && "Status" in dohData) {
            // DoH endpoint is reachable → the block is at the CORS/browser level
            blockReason = "cors";
          }
        } catch {
          // DoH also failed → network-level interception (e.g. OpenWRT firewall rule)
          blockReason = "network";
        }
        nextDns = { status: "blocked", blockReason };
        newEntries.push(makeEntry("NextDNS Check", blockReason === "cors" ? "Blocked/CORS" : "Blocked/Firewalled"));
      } else {
        nextDns = { status: "not-using" };
        newEntries.push(makeEntry("NextDNS Check", err instanceof Error ? err.message : "ERR"));
      }
    }

    // --- DNS Leak ---
    let dnsLeak: DnsLeakInfo | null = null;
    try {
      const resp = await fetchWithTimeout("https://edns.ip-api.com/json");
      const data = await resp.json();
      if (data && data.dns) {
        dnsLeak = {
          ip: data.dns.ip || "Unknown",
          geo: data.dns.geo || "Unknown",
          isSameAsPublic: ipInfo ? data.dns.ip === ipInfo.ip : false,
        };
        newEntries.push(makeEntry("DNS Leak Test", dnsLeak.isSameAsPublic ? "200 OK — Possible Leak" : "200 OK — Clean"));
      } else {
        newEntries.push(makeEntry("DNS Leak Test", "200 OK — No Data"));
      }
    } catch (err) {
      const code = isCorsOrNetworkError(err) ? "Blocked/Firewalled" : (err instanceof Error ? err.message : "ERR");
      newEntries.push(makeEntry("DNS Leak Test", code));
    }

    // --- Latency ---
    let pingMs: number | null = null;
    try {
      pingMs = await measureLatency();
      newEntries.push(makeEntry("Latency Probe", `${pingMs} ms`));
    } catch {
      newEntries.push(makeEntry("Latency Probe", "ERR"));
    }

    const connectionType = getConnectionType();

    setState((prev) => ({
      ipInfo,
      nextDns,
      dnsLeak,
      latency: { pingMs, connectionType },
      loading: false,
      lastUpdated: new Date(),
      error: null,
      auditLog: [...newEntries, ...prev.auditLog].slice(0, 100),
    }));
  }, []);

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

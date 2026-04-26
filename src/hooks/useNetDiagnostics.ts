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
  status: "ok" | "not-using" | "blocked" | "error" | "loading" | "manual";
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

export interface DnsResolverInfo {
  ip: string;
  isp: string;
  geo: string;
}

export interface DnsLeakEntry {
  ip: string;
  country: string;
  countryCode: string;
  isp: string;
  hostname?: string;
  status: "secure" | "leak" | "unknown";
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
  dnsLeakEntries: DnsLeakEntry[];
  dnsLeakAllSecure: boolean | null;
  dnsResolverInfo: DnsResolverInfo | null;
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

/** Like fetchWithTimeout but omits the response.ok check, for use with mode:'no-cors'
 *  where the browser always returns an opaque response with status 0. */
async function fetchNoCorsWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
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
    dnsLeakEntries: [],
    dnsLeakAllSecure: null,
    dnsResolverInfo: null,
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
      // First attempt: proxy to bypass CORS
      const proxyUrl = "https://corsproxy.io/?url=" + encodeURIComponent("https://test.nextdns.io/");
      const resp = await fetchWithTimeout(proxyUrl, { mode: "cors" });
      const data = await resp.json();
      if (data && data.status === "ok") {
        nextDns = { status: "ok", configId: data.configId, protocol: data.protocol, server: data.server };
        newEntries.push(makeEntry("NextDNS Check", "200 OK — Linked"));
      } else {
        nextDns = { status: "not-using" };
        newEntries.push(makeEntry("NextDNS Check", "200 OK — Not Configured"));
      }
    } catch {
      // Proxy failed; attempt no-cors fallback
      try {
        const fallbackResp = await fetchNoCorsWithTimeout("https://test.nextdns.io", { mode: "no-cors" });
        if (fallbackResp.type === "opaque") {
          // Server is reachable but we can't read the response body — manual verification required
          nextDns = { status: "manual" };
          newEntries.push(makeEntry("NextDNS Check", "Reachable — Manual Check Required"));
        } else {
          nextDns = { status: "not-using" };
          newEntries.push(makeEntry("NextDNS Check", "Not Configured"));
        }
      } catch (fallbackErr) {
        // Both attempts failed — determine if it's CORS or network block
        let blockReason: NextDnsInfo["blockReason"] = "network";
        try {
          const dohResp = await fetchWithTimeout("https://dns.nextdns.io/resolve?name=test.nextdns.io", { mode: "cors" });
          const dohData = await dohResp.json();
          if (
            typeof dohData === "object" &&
            dohData !== null &&
            "Status" in dohData &&
            typeof dohData.Status === "number"
          ) {
            blockReason = "cors";
          }
        } catch {
          blockReason = "network";
        }
        nextDns = { status: "blocked", blockReason };
        newEntries.push(makeEntry("NextDNS Check", blockReason === "cors" ? "Blocked/CORS" : "Blocked/Firewalled"));
        void fallbackErr;
      }
    }

    // --- DNS Leak (multi-resolver) ---
    let dnsLeak: DnsLeakInfo | null = null;
    let dnsLeakEntries: DnsLeakEntry[] = [];
    let dnsLeakAllSecure: boolean | null = null;
    try {
      // Step 1: obtain a test ID from bash.ws
      const idProxy = "https://corsproxy.io/?url=" + encodeURIComponent("https://bash.ws/dnsleak/id");
      const idResp = await fetchWithTimeout(idProxy, { mode: "cors" });
      const idData = await idResp.json();
      const testId: string = idData?.id ?? idData;

      // Step 2: fire 8 parallel no-cors fetches to unique subdomains to force DNS resolution
      const PROBE_COUNT = 8;
      const probes = Array.from({ length: PROBE_COUNT }, (_, i) =>
        fetch(`https://${i}.${testId}.bash.ws/pixel.png`, { mode: "no-cors", cache: "no-store" }).catch(() => {})
      );
      await Promise.allSettled(probes);

      // Small delay to allow DNS propagation to reach bash.ws servers
      await new Promise((r) => setTimeout(r, 1500));

      // Step 3: fetch results
      const resultProxy = "https://corsproxy.io/?url=" + encodeURIComponent(`https://bash.ws/dnsleak/result/${testId}`);
      const resultResp = await fetchWithTimeout(resultProxy, { mode: "cors" });
      const resultData = await resultResp.json();

      if (Array.isArray(resultData) && resultData.length > 0) {
        dnsLeakEntries = resultData.map(
          (r: { ip?: string; country?: string; country_code?: string; isp?: string; hostname?: string; type?: string }) => {
            const isp = r.isp ?? "";
            const hostname = r.hostname ?? "";
            const isNextDns =
              isp.toLowerCase().includes("nextdns") ||
              isp.toLowerCase().includes("anexia") ||
              hostname.toLowerCase().includes("nextdns");
            return {
              ip: r.ip ?? "Unknown",
              country: r.country ?? "Unknown",
              countryCode: r.country_code ?? "",
              isp,
              hostname,
              status: isNextDns ? "secure" : "leak",
            } satisfies DnsLeakEntry;
          }
        );

        // Keep legacy single-entry shape for NetworkTopology compatibility
        const first = dnsLeakEntries[0];
        dnsLeak = {
          ip: first.ip,
          geo: `${first.country}`,
          isSameAsPublic: dnsLeakEntries.some((e) => e.status === "leak"),
        };

        dnsLeakAllSecure = dnsLeakEntries.every((e) => e.status === "secure");
        newEntries.push(
          makeEntry(
            "DNS Leak Test",
            dnsLeakAllSecure
              ? `${dnsLeakEntries.length} resolvers — All NextDNS`
              : `${dnsLeakEntries.filter((e) => e.status === "leak").length}/${dnsLeakEntries.length} leaking`
          )
        );
      } else {
        newEntries.push(makeEntry("DNS Leak Test", "200 OK — No Resolvers"));
      }
    } catch {
      newEntries.push(makeEntry("DNS Leak Test", "Unavailable — Use external test"));
    }

    // --- Primary DNS Resolver Info (ip-api.com) — always runs ---
    let dnsResolverInfo: DnsResolverInfo | null = null;
    try {
      const resp = await fetchWithTimeout("https://edns.ip-api.com/json");
      const data = await resp.json();
      if (data && data.dns) {
        dnsResolverInfo = {
          ip: data.dns.ip || "Unknown",
          isp: data.dns.isp || data.dns.org || "Unknown",
          geo: data.dns.geo || "Unknown",
        };
        newEntries.push(makeEntry("DNS Resolver Info", "200 OK"));
      } else {
        newEntries.push(makeEntry("DNS Resolver Info", "200 OK — No Data"));
      }
    } catch (err) {
      const code = isCorsOrNetworkError(err) ? "Blocked/Firewalled" : (err instanceof Error ? err.message : "ERR");
      newEntries.push(makeEntry("DNS Resolver Info", code));
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
      dnsLeakEntries,
      dnsLeakAllSecure,
      dnsResolverInfo,
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

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
}

export interface NextDnsInfo {
  status: "ok" | "not-using" | "unconfigured" | "blocked" | "error" | "loading" | "manual";
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
  edgeLocation: string | null;
}

const FETCH_TIMEOUT_MS = 5000;

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
}

interface BffNextDnsResponse {
  status?: string;
  configId?: string;
  protocol?: string;
  server?: string;
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
  if (!conn) return "";
  return conn.effectiveType || conn.type || "";
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
    nextDns: { status: "loading" },
    dnsLeak: null,
    dnsLeakEntries: [],
    dnsLeakAllSecure: null,
    dnsResolverInfo: null,
    latency: { pingMs: null, connectionType: "" },
    loading: true,
    lastUpdated: null,
    error: null,
    auditLog: [],
    edgeLocation: null,
  });
  const [autoRefresh, setAutoRefresh] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runDiagnostics = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    const newEntries: AuditEntry[] = [];

    // Edge location extracted from the first successful BFF response header
    let edgeLocation: string | null = null;

    // --- IP Info (via BFF) ---
    let ipInfo: IpInfo | null = null;
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
      };
      newEntries.push(makeEntry("IP Lookup", "200 OK", edgeLocation));
    } catch (err) {
      const code = isCorsOrNetworkError(err) ? "BFF Unavailable" : (err instanceof Error ? err.message : "ERR");
      newEntries.push(makeEntry("IP Lookup", code));
    }

    // --- NextDNS (via BFF) ---
    let nextDns: NextDnsInfo = { status: "not-using" };
    try {
      const resp = await fetchWithTimeout(`${BFF_URL}/nextdns`);
      if (!edgeLocation) edgeLocation = resp.headers.get("X-NetCheck-Edge");
      const data = await resp.json() as BffNextDnsResponse;
      const bffStatus = data.status ?? "not-using";
      if (bffStatus === "ok") {
        nextDns = { status: "ok", configId: data.configId, protocol: data.protocol, server: data.server };
        newEntries.push(makeEntry("NextDNS Check", "OK", edgeLocation));
      } else if (bffStatus === "unconfigured") {
        nextDns = { status: "unconfigured", configId: data.configId };
        newEntries.push(makeEntry("NextDNS Check", "Linked (Unconfigured)", edgeLocation));
      } else {
        nextDns = { status: "not-using" };
        newEntries.push(makeEntry("NextDNS Check", "Not Configured", edgeLocation));
      }
    } catch (err) {
      const code = isCorsOrNetworkError(err) ? "BFF Unavailable" : (err instanceof Error ? err.message : "ERR");
      nextDns = { status: "error" };
      newEntries.push(makeEntry("NextDNS Check", code, edgeLocation));
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
              ip: r.ip ?? "",
              country: r.country ?? "",
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
              ? `${dnsLeakEntries.length} resolvers, all NextDNS`
              : `${dnsLeakEntries.filter((e) => e.status === "leak").length}/${dnsLeakEntries.length} leaking`,
            edgeLocation
          )
        );
      } else {
        newEntries.push(makeEntry("DNS Leak Test", "No Resolvers", edgeLocation));
      }
    } catch {
      newEntries.push(makeEntry("DNS Leak Test", "Unavailable", edgeLocation));
    }

    // --- Primary DNS Resolver Info (ip-api.com) — always runs ---
    let dnsResolverInfo: DnsResolverInfo | null = null;
    try {
      const resp = await fetchWithTimeout("https://edns.ip-api.com/json");
      const data = await resp.json();
      if (data && data.dns) {
        dnsResolverInfo = {
          ip: data.dns.ip || "",
          isp: data.dns.isp || data.dns.org || "",
          geo: data.dns.geo || "",
        };
        newEntries.push(makeEntry("DNS Resolver Info", "200 OK", edgeLocation));
      } else {
        newEntries.push(makeEntry("DNS Resolver Info", "No Data", edgeLocation));
      }
    } catch (err) {
      const code = isCorsOrNetworkError(err) ? "Blocked/Firewalled" : (err instanceof Error ? err.message : "ERR");
      newEntries.push(makeEntry("DNS Resolver Info", code, edgeLocation));
    }

    // --- Latency ---
    let pingMs: number | null = null;
    try {
      pingMs = await measureLatency();
      newEntries.push(makeEntry("Latency Probe", `${pingMs} ms`, edgeLocation));
    } catch {
      newEntries.push(makeEntry("Latency Probe", "ERR", edgeLocation));
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
      edgeLocation,
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

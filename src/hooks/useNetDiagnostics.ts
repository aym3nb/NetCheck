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
  status: "ok" | "not-using" | "error" | "loading";
  configId?: string;
  protocol?: string;
  server?: string;
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

export interface DiagnosticState {
  ipInfo: IpInfo | null;
  nextDns: NextDnsInfo;
  dnsLeak: DnsLeakInfo | null;
  latency: LatencyInfo;
  loading: boolean;
  lastUpdated: Date | null;
  error: string | null;
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

export function useNetDiagnostics(autoRefreshInterval = 60000) {
  const [state, setState] = useState<DiagnosticState>({
    ipInfo: null,
    nextDns: { status: "loading" },
    dnsLeak: null,
    latency: { pingMs: null, connectionType: "Unknown" },
    loading: true,
    lastUpdated: null,
    error: null,
  });
  const [autoRefresh, setAutoRefresh] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runDiagnostics = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const [ipResult, nextDnsResult, dnsLeakResult, pingMs] = await Promise.allSettled([
        fetch("https://ipapi.co/json/").then((r) => r.json()),
        fetch("https://test.nextdns.io/").then((r) => r.json()),
        fetch("https://edns.ip-api.com/json").then((r) => r.json()),
        measureLatency(),
      ]);

      let ipInfo: IpInfo | null = null;
      if (ipResult.status === "fulfilled") {
        ipInfo = ipResult.value as IpInfo;
      }

      let nextDns: NextDnsInfo = { status: "not-using" };
      if (nextDnsResult.status === "fulfilled") {
        const data = nextDnsResult.value;
        if (data && data.status === "ok") {
          nextDns = {
            status: "ok",
            configId: data.configId,
            protocol: data.protocol,
            server: data.server,
          };
        } else {
          nextDns = { status: "not-using" };
        }
      } else {
        nextDns = { status: "not-using" };
      }

      let dnsLeak: DnsLeakInfo | null = null;
      if (dnsLeakResult.status === "fulfilled") {
        const data = dnsLeakResult.value;
        if (data && data.dns) {
          dnsLeak = {
            ip: data.dns.ip || "Unknown",
            geo: data.dns.geo || "Unknown",
            isSameAsPublic: ipInfo ? data.dns.ip === ipInfo.ip : false,
          };
        }
      }

      const latencyMs = pingMs.status === "fulfilled" ? pingMs.value : null;
      const connectionType = getConnectionType();

      setState({
        ipInfo,
        nextDns,
        dnsLeak,
        latency: { pingMs: latencyMs, connectionType },
        loading: false,
        lastUpdated: new Date(),
        error: null,
      });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : "Unknown error",
      }));
    }
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

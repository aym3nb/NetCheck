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

export interface ConnectionInfo {
  connectionType: string;
}

export interface AuditEntry {
  timestamp: string; // ISO 8601
  event: string;
  statusCode: string;
}

export interface DiagnosticState {
  ipInfo: IpInfo | null;
  latency: ConnectionInfo;
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
    latency: { connectionType: "" },
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

    const connectionType = getConnectionType();

    setState((prev) => ({
      ipInfo,
      latency: { connectionType },
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

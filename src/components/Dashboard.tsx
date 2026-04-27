import { useState } from "react";
import { RefreshCw, Wifi, ShieldCheck, ShieldX, Globe, Activity, Clock, Sun, Moon, AlertTriangle, ExternalLink, MapPin, CheckCircle2, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { NetworkTopology } from "@/components/NetworkTopology";
import { useNetDiagnostics } from "@/hooks/useNetDiagnostics";
import { useTheme } from "@/hooks/useTheme";
import { usePersistentAudit } from "@/hooks/usePersistentAudit";
import type { NextDnsInfo, DnsLeakInfo, AuditEntry, DnsLeakEntry } from "@/hooks/useNetDiagnostics";
import { cn } from "@/lib/utils";

// Placeholder values that should be treated as absent data (hide the row entirely)
const PLACEHOLDER_VALUES = new Set(["Unknown", "—", "Basic", ""]);

function DataRow({ label, value, loading }: { label: string; value?: string | null; loading: boolean }) {
  if (!loading && (value == null || PLACEHOLDER_VALUES.has(value))) return null;
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 border-b border-border/40 last:border-0">
      <span className="text-sm text-muted-foreground flex-shrink-0">{label}</span>
      {loading ? (
        <Skeleton className="h-4 w-32" />
      ) : (
        <span className="text-sm font-medium text-right break-all">{value}</span>
      )}
    </div>
  );
}

function StatusBadge({
  status,
  loading,
  verified,
}: {
  status: NextDnsInfo["status"] | "leak" | "clean" | "connected" | "disconnected" | null;
  loading: boolean;
  verified?: boolean;
}) {
  if (loading) return <Skeleton className="h-5 w-16" />;

  if (verified) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-transparent bg-blue-600 px-2.5 py-0.5 text-xs font-semibold text-white">
        <CheckCircle2 className="w-3 h-3" />
        User Verified
      </span>
    );
  }

  const variants: Record<string, { label: string; className: string }> = {
    ok: { label: "Active", className: "bg-emerald-500 text-white border-transparent" },
    unconfigured: { label: "Linked", className: "bg-blue-500 text-white border-transparent" },
    "not-using": { label: "Not Configured", className: "bg-secondary text-secondary-foreground border-transparent" },
    blocked: { label: "Blocked", className: "bg-red-500 text-white border-transparent animate-pulse" },
    error: { label: "Error", className: "bg-red-500 text-white border-transparent animate-pulse" },
    loading: { label: "Loading…", className: "bg-secondary text-secondary-foreground border-transparent" },
    manual: { label: "Manual Check Required", className: "bg-yellow-500 text-white border-transparent" },
    leak: { label: "Possible Leak", className: "bg-yellow-500 text-white border-transparent animate-pulse" },
    clean: { label: "No Leak", className: "bg-emerald-500 text-white border-transparent" },
    connected: { label: "Connected", className: "bg-emerald-500 text-white border-transparent" },
    disconnected: { label: "Disconnected", className: "bg-secondary text-secondary-foreground border-transparent" },
  };

  const cfg = variants[status ?? "not-using"] ?? variants["not-using"];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold",
        cfg.className
      )}
    >
      {cfg.label}
    </span>
  );
}

function NextDnsIcon({ status, loading }: { status: NextDnsInfo["status"]; loading: boolean }) {
  if (loading) return <ShieldCheck className="w-4 h-4 text-muted-foreground animate-pulse" />;
  if (status === "ok") return <ShieldCheck className="w-4 h-4 text-emerald-500" />;
  if (status === "unconfigured") return <ShieldCheck className="w-4 h-4 text-blue-500" />;
  if (status === "blocked") return <ShieldX className="w-4 h-4 text-red-500 animate-pulse" />;
  if (status === "manual") return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
  return <ShieldX className="w-4 h-4 text-muted-foreground" />;
}

function LeakIcon({ leak, loading }: { leak: DnsLeakInfo | null; loading: boolean }) {
  if (loading) return <ShieldCheck className="w-4 h-4 text-muted-foreground animate-pulse" />;
  if (!leak) return <ShieldCheck className="w-4 h-4 text-muted-foreground" />;
  return leak.isSameAsPublic ? (
    <ShieldX className="w-4 h-4 text-yellow-500" />
  ) : (
    <ShieldCheck className="w-4 h-4 text-emerald-500" />
  );
}

/** Return a human-readable resolver label: ISP if valid, else hostname, else IP */
function resolverLabel(entry: DnsLeakEntry): string {
  const isp = entry.isp?.trim();
  if (isp && isp !== "Unknown") return isp;
  if (entry.hostname?.trim()) return entry.hostname.trim();
  return entry.ip;
}

function isNextDnsEntry(entry: DnsLeakEntry): boolean {
  return (
    entry.isp.toLowerCase().includes("nextdns") ||
    entry.hostname?.toLowerCase().includes("nextdns") === true
  );
}

function isCloudflareEntry(entry: DnsLeakEntry): boolean {
  return (
    entry.isp.toLowerCase().includes("cloudflare") ||
    entry.hostname?.toLowerCase().includes("cloudflare") === true
  );
}

function DnsResolverTable({ entries, loading }: { entries: DnsLeakEntry[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="space-y-1.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex justify-between gap-4 py-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    );
  }
  if (entries.length === 0) return null;

  return (
    <div className="rounded-md border border-border/40 overflow-hidden text-xs">
      <div className="grid grid-cols-[1fr_auto_auto] bg-muted/40 px-3 py-1.5 font-medium text-muted-foreground">
        <span>Resolver</span>
        <span className="text-center px-2">Country</span>
        <span className="text-right">Status</span>
      </div>
      {entries.map((entry, i) => {
        const isNextDns = isNextDnsEntry(entry);
        const isCloudflare = isCloudflareEntry(entry);
        const isTrusted = isNextDns || isCloudflare;
        return (
          <div
            key={i}
            className={cn(
              "grid grid-cols-[1fr_auto_auto] px-3 py-2 border-t border-border/30",
              isNextDns && "bg-emerald-500/5",
              isCloudflare && !isNextDns && "bg-orange-500/5"
            )}
          >
            <span
              className={cn(
                "truncate font-medium",
                isNextDns && "text-emerald-600 dark:text-emerald-400",
                isCloudflare && !isNextDns && "text-orange-600 dark:text-orange-400"
              )}
            >
              {resolverLabel(entry)}
            </span>
            <span className="px-2 text-center text-muted-foreground">{entry.country || "—"}</span>
            <span className="text-right">
              {isTrusted ? (
                <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-3 h-3" />
                  Secure
                </span>
              ) : (
                <span className="text-yellow-600 dark:text-yellow-400">Leak</span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Major VPN exit-node cities for the location selector
const VPN_CITIES = [
  "Amsterdam",
  "Atlanta",
  "Chicago",
  "Dallas",
  "Frankfurt",
  "Hong Kong",
  "London",
  "Los Angeles",
  "Miami",
  "New York",
  "Paris",
  "San Jose",
  "Seattle",
  "Singapore",
  "Stockholm",
  "Sydney",
  "Tokyo",
  "Toronto",
  "Warsaw",
  "Zurich",
] as const;

type AnonymityGrade = "A" | "B" | "C" | "F";

interface AnonymityScore {
  grade: AnonymityGrade;
  label: string;
  description: string;
  colorClass: string;
}

function computeAnonymityScore({
  nextDnsOk,
  vpnLocationMatch,
  hasSelectedCity,
  isNextDNSVerified,
  isDNSLeakVerified,
  hasDNSLeak,
}: {
  nextDnsOk: boolean;
  vpnLocationMatch: boolean;
  hasSelectedCity: boolean;
  isNextDNSVerified: boolean;
  isDNSLeakVerified: boolean;
  hasDNSLeak: boolean;
}): AnonymityScore {
  // Manual verifications take priority
  if (isDNSLeakVerified && hasDNSLeak) {
    return {
      grade: "F",
      label: "Grade F: Exposed",
      description: "You reported a potential DNS leak — your resolver may be visible to third parties.",
      colorClass: "text-red-500",
    };
  }
  if (isNextDNSVerified && isDNSLeakVerified && hasSelectedCity && vpnLocationMatch) {
    return {
      grade: "A",
      label: "Grade A: Fully Verified & Proxied",
      description: "Manually verified: NextDNS active, no DNS leaks, and VPN exit node confirmed.",
      colorClass: "text-emerald-500",
    };
  }
  if (isNextDNSVerified && isDNSLeakVerified) {
    return {
      grade: "B",
      label: "Grade B: Verified Secure",
      description: "Manually verified: NextDNS active with no DNS leaks.",
      colorClass: "text-blue-500",
    };
  }

  // Automated scoring
  if (nextDnsOk && hasSelectedCity && vpnLocationMatch) {
    return {
      grade: "A",
      label: "Grade A: Fully Encrypted & Proxied",
      description: "NextDNS is active, no DNS leaks, and your public IP matches the expected VPN exit node.",
      colorClass: "text-emerald-500",
    };
  }
  if (nextDnsOk) {
    // Grade B: NextDNS connected, no city selected or mismatch
    if (!hasSelectedCity) {
      return {
        grade: "B",
        label: "Grade B: DNS Encrypted",
        description: "NextDNS is active. Set an expected VPN exit city to check location match.",
        colorClass: "text-blue-500",
      };
    }
    // NextDNS ok but city mismatch → Grade B still (NextDNS connected)
    return {
      grade: "B",
      label: "Grade B: DNS Encrypted",
      description: "NextDNS is active but your IP location doesn't match the expected VPN exit node.",
      colorClass: "text-blue-500",
    };
  }
  if (!nextDnsOk && hasSelectedCity && vpnLocationMatch) {
    return {
      grade: "C",
      label: "Grade C: VPN Active, DNS Unencrypted",
      description: "Your VPN exit node matches, but NextDNS is not active — DNS queries are unencrypted.",
      colorClass: "text-yellow-500",
    };
  }
  return {
    grade: "F",
    label: "Grade F: Exposed",
    description: "NextDNS is not active and no VPN location match — DNS queries are unencrypted.",
    colorClass: "text-red-500",
  };
}

function AuditLog({ entries, onReset }: { entries: AuditEntry[]; onReset: () => void }) {
  if (entries.length === 0) return null;
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-400" />
            Audit Log
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 text-xs text-muted-foreground"
            onClick={onReset}
            aria-label="Reset audit and clear verified state"
          >
            <RotateCcw className="w-3 h-3" />
            Reset Audit
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-48 px-6 pb-4">
          <div className="space-y-1 font-mono text-xs">
            {entries.map((entry, i) => (
              <div key={i} className="flex gap-2 text-muted-foreground">
                <span className="text-slate-400 flex-shrink-0">{entry.timestamp}</span>
                <span className="text-foreground font-medium flex-shrink-0">{entry.event}</span>
                <span className="truncate">{entry.statusCode}</span>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}


export function Dashboard() {
  const { ipInfo, nextDns, nextDnsReachable, dnsLeak, dnsLeakEntries, dnsLeakAllSecure, dnsResolverInfo, latency, loading, lastUpdated, autoRefresh, setAutoRefresh, refresh, auditLog } =
    useNetDiagnostics();
  const { theme, toggleTheme } = useTheme();
  const [selectedCity, setSelectedCity] = useState<string>("");

  // Persistent manual verification state
  const { isNextDNSVerified, isDNSLeakVerified, hasDNSLeak, setNextDNSVerified, setDNSLeakVerified, resetAudit } =
    usePersistentAudit();

  // Modal state for NextDNS verification
  const [showNextDnsModal, setShowNextDnsModal] = useState(false);
  // Modal state for DNS leak verification
  const [showDnsLeakModal, setShowDnsLeakModal] = useState(false);

  const getPingLabel = (ms: number | null): string | null => {
    if (ms === null) return null;
    if (ms < 50) return `${ms} ms — Excellent`;
    if (ms < 150) return `${ms} ms — Good`;
    return `${ms} ms — Fair`;
  };

  const validLeakEntries = dnsLeakEntries.filter((e) => e.ip);

  // VPN location match — locale-aware, accent/case-insensitive comparison against the city from IP lookup
  const hasSelectedCity = selectedCity !== "";
  const vpnLocationMatch =
    hasSelectedCity &&
    ipInfo?.city != null &&
    ipInfo.city.localeCompare(selectedCity, undefined, { sensitivity: "base" }) === 0;

  // Anonymity score — incorporates manual verifications
  const nextDnsOk = nextDns.status === "ok" || nextDnsReachable === true;
  const anonymityScore = computeAnonymityScore({
    nextDnsOk,
    vpnLocationMatch,
    hasSelectedCity,
    isNextDNSVerified,
    isDNSLeakVerified,
    hasDNSLeak,
  });

  // Derived badge status for NextDNS card
  const nextDnsConnectStatus: "connected" | "disconnected" | null =
    loading ? null : nextDnsReachable === true ? "connected" : "disconnected";

  // DNS leak badge
  const dnsLeakBadgeStatus: "leak" | "clean" | null = loading
    ? null
    : dnsLeak?.isSameAsPublic
    ? "leak"
    : "clean";

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border/60 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Wifi className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">NetCheck</h1>
              <p className="text-xs text-muted-foreground hidden sm:block">DNS Leak & Network Diagnostic Tool</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {lastUpdated && (
              <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="w-3.5 h-3.5" />
                <span>{lastUpdated.toISOString().replace("T", " ").substring(0, 19)} UTC</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Switch
                id="auto-refresh"
                checked={autoRefresh}
                onCheckedChange={setAutoRefresh}
                aria-label="Auto-refresh every 60 seconds"
              />
              <label htmlFor="auto-refresh" className="text-xs text-muted-foreground cursor-pointer hidden sm:inline">
                Auto (60s)
              </label>
            </div>
            <Button size="sm" variant="outline" onClick={refresh} disabled={loading} className="gap-2">
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={toggleTheme}
              aria-label="Toggle dark mode"
              aria-pressed={theme === "dark"}
              className="w-9 px-0"
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {/* Network Topology */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="w-4 h-4 text-slate-400" />
              Network Path
            </CardTitle>
          </CardHeader>
          <CardContent>
            <NetworkTopology nextDns={nextDns} dnsLeak={dnsLeak} ipInfo={ipInfo} loading={loading} />
          </CardContent>
        </Card>

        {/* Anonymity & Privacy Score */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="w-4 h-4 text-slate-400" />
              Anonymity & Privacy Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center gap-6">
                <Skeleton className="h-16 w-14 rounded-md" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-72" />
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-6">
                <span
                  className={cn(
                    "text-6xl font-black leading-none select-none",
                    anonymityScore.colorClass
                  )}
                  aria-label={`Anonymity grade ${anonymityScore.grade}`}
                >
                  {anonymityScore.grade}
                </span>
                <div>
                  <p className="text-sm font-semibold">{anonymityScore.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{anonymityScore.description}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Diagnostic Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Public Identity Card */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Globe className="w-4 h-4 text-blue-500" />
                Public Identity
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-0">
                <DataRow label="IP Address" value={ipInfo?.ip} loading={loading} />
                <DataRow label="ISP / Org" value={ipInfo?.org || ipInfo?.isp} loading={loading} />
                <DataRow
                  label="Location"
                  value={ipInfo ? `${ipInfo.city}, ${ipInfo.region}, ${ipInfo.country_name}` : null}
                  loading={loading}
                />
                <DataRow label="Timezone" value={ipInfo?.timezone} loading={loading} />
              </div>

              {/* VPN Expected-Location Validator */}
              <div className="pt-1 space-y-2">
                <div className="flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground font-medium">Expected VPN Exit Node</span>
                </div>
                <Select value={selectedCity} onValueChange={setSelectedCity}>
                  <SelectTrigger aria-label="Select expected VPN exit city" className="h-8 text-xs">
                    <SelectValue placeholder="Select a city…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Major Exit Nodes</SelectLabel>
                      {VPN_CITIES.map((city) => (
                        <SelectItem key={city} value={city}>
                          {city}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>

                {/* VPN location badge */}
                {(() => {
                  if (loading && hasSelectedCity) return <Skeleton className="h-6 w-36" />;
                  if (!hasSelectedCity) return null;
                  if (vpnLocationMatch) {
                    return (
                      <span className="inline-flex items-center gap-1.5 rounded-md border border-transparent bg-emerald-500 px-2.5 py-0.5 text-xs font-semibold text-white">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        VPN Exit Verified
                      </span>
                    );
                  }
                  return (
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-transparent bg-red-500 px-2.5 py-0.5 text-xs font-semibold text-white animate-pulse">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Location Mismatch
                    </span>
                  );
                })()}
              </div>
            </CardContent>
          </Card>

          {/* Network Performance Card — immediately after Public Identity */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="w-4 h-4 text-orange-500" />
                Network Performance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-0">
              <DataRow label="Latency (to 1.1.1.1)" value={getPingLabel(latency.pingMs)} loading={loading} />
              <DataRow label="Connection Type" value={latency.connectionType || null} loading={loading} />
            </CardContent>
          </Card>

          {/* NextDNS Status Card */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-base">
                <span className="flex items-center gap-2">
                  <NextDnsIcon status={nextDns.status} loading={loading} />
                  NextDNS Status
                </span>
                <StatusBadge
                  status={nextDnsConnectStatus}
                  loading={loading}
                  verified={isNextDNSVerified}
                />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <DataRow label="Config ID" value={nextDns.configId} loading={loading} />
              <DataRow label="Protocol" value={nextDns.protocol} loading={loading} />
              <DataRow label="Server" value={nextDns.server} loading={loading} />
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2"
                onClick={() => {
                  window.open("https://test.nextdns.io", "_blank", "noopener,noreferrer");
                  setTimeout(() => setShowNextDnsModal(true), 5000);
                }}
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Check Detailed Logs
              </Button>
            </CardContent>
          </Card>

          {/* DNS Leak Test Card */}
          <Card className="shadow-sm md:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-base">
                <span className="flex items-center gap-2">
                  <LeakIcon leak={dnsLeak} loading={loading} />
                  DNS Leak Test
                </span>
                <StatusBadge
                  status={dnsLeakBadgeStatus}
                  loading={loading}
                  verified={isDNSLeakVerified && !hasDNSLeak}
                />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Validation banner */}
              {!loading && dnsLeakAllSecure === true && (
                <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-4 py-3">
                  <ShieldCheck className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">Secure: No Leaks Detected</p>
                    <p className="text-xs text-muted-foreground">
                      All {validLeakEntries.length} resolver(s) confirmed NextDNS infrastructure
                    </p>
                  </div>
                </div>
              )}
              {!loading && dnsLeakAllSecure === false && (
                <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3">
                  <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-red-600 dark:text-red-400">DNS Leak Detected</p>
                    <p className="text-xs text-muted-foreground">
                      {validLeakEntries.filter((e) => e.status === "leak").length} of{" "}
                      {validLeakEntries.length} resolver(s) are not NextDNS
                    </p>
                  </div>
                </div>
              )}

              {/* Resolver table */}
              <DnsResolverTable entries={validLeakEntries} loading={loading} />

              {/* Primary resolver IP */}
              <div className="space-y-0">
                <DataRow label="Primary Resolver" value={dnsResolverInfo?.ip} loading={loading} />
              </div>

              {/* External test link */}
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2"
                onClick={() => {
                  window.open("https://dnsleaktest.com", "_blank", "noopener,noreferrer");
                  setTimeout(() => setShowDnsLeakModal(true), 1000);
                }}
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Launch Full DNS Leak Test
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Audit Log */}
        <AuditLog entries={auditLog} onReset={resetAudit} />

        <p className="text-center text-xs text-muted-foreground">
          Diagnostics powered by NetCheck-BFF on Cloudflare Edge.{" "}
          Deep-packet diagnostics via{" "}
          <a href="https://dnsleaktest.com" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground transition-colors">
            dnsleaktest.com
          </a>
          .
        </p>
      </main>

      {/* NextDNS Verification Modal */}
      <Dialog open={showNextDnsModal} onOpenChange={setShowNextDnsModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-blue-500" />
              Verify NextDNS Status
            </DialogTitle>
            <DialogDescription>
              Did the NextDNS test page show <strong>"All Good"</strong> with your expected configuration?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => {
                setNextDNSVerified(true);
                setShowNextDnsModal(false);
              }}
            >
              <CheckCircle2 className="w-4 h-4 mr-1.5" />
              Yes — Mark Active
            </Button>
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => {
                setNextDNSVerified(false);
                setShowNextDnsModal(false);
              }}
            >
              No — Mark Inactive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DNS Leak Verification Modal */}
      <Dialog open={showDnsLeakModal} onOpenChange={setShowDnsLeakModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-blue-500" />
              Verify DNS Leak Test
            </DialogTitle>
            <DialogDescription>
              On the test page, was NextDNS your <strong>only resolver</strong>? (Or do you trust every ISP shown?)
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => {
                setDNSLeakVerified(true, false);
                setShowDnsLeakModal(false);
              }}
            >
              <CheckCircle2 className="w-4 h-4 mr-1.5" />
              Verified — No Leaks
            </Button>
            <Button
              variant="outline"
              className="w-full sm:w-auto border-yellow-500 text-yellow-600 hover:bg-yellow-500/10"
              onClick={() => {
                setDNSLeakVerified(true, true);
                setShowDnsLeakModal(false);
              }}
            >
              <AlertTriangle className="w-4 h-4 mr-1.5" />
              Unverified — Potential Leak
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

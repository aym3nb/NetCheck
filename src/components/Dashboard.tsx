import { useState } from "react";
import { RefreshCw, Wifi, ShieldCheck, ShieldX, Globe, Activity, Clock, Sun, Moon, AlertTriangle, ExternalLink, MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NetworkTopology } from "@/components/NetworkTopology";
import { useNetDiagnostics } from "@/hooks/useNetDiagnostics";
import { useTheme } from "@/hooks/useTheme";
import type { NextDnsInfo, DnsLeakInfo, AuditEntry } from "@/hooks/useNetDiagnostics";
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

function StatusBadge({ status, loading }: { status: NextDnsInfo["status"] | "leak" | "clean" | null; loading: boolean }) {
  if (loading) return <Skeleton className="h-5 w-16" />;

  const variants: Record<string, { label: string; className: string }> = {
    ok: { label: "Active", className: "bg-emerald-500 text-white border-transparent" },
    "not-using": { label: "Not Configured", className: "bg-secondary text-secondary-foreground border-transparent" },
    blocked: { label: "Blocked", className: "bg-red-500 text-white border-transparent animate-pulse" },
    error: { label: "Error", className: "bg-red-500 text-white border-transparent animate-pulse" },
    loading: { label: "Loading…", className: "bg-secondary text-secondary-foreground border-transparent" },
    manual: { label: "Manual Check Required", className: "bg-yellow-500 text-white border-transparent" },
    leak: { label: "Possible Leak", className: "bg-yellow-500 text-white border-transparent animate-pulse" },
    clean: { label: "No Leak", className: "bg-emerald-500 text-white border-transparent" },
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

type AnonymityGrade = "A" | "C" | "F";

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
  dnsLeakDetected,
}: {
  nextDnsOk: boolean;
  vpnLocationMatch: boolean;
  hasSelectedCity: boolean;
  dnsLeakDetected: boolean;
}): AnonymityScore {
  if (dnsLeakDetected || !nextDnsOk) {
    return {
      grade: "F",
      label: "Grade F: Exposed",
      description: dnsLeakDetected
        ? "DNS leak detected — your resolver is visible to third parties."
        : "NextDNS is not active — DNS queries are unencrypted.",
      colorClass: "text-red-500",
    };
  }
  if (nextDnsOk && hasSelectedCity && vpnLocationMatch) {
    return {
      grade: "A",
      label: "Grade A: Fully Encrypted & Proxied",
      description: "NextDNS is active, no DNS leaks, and your public IP matches the expected VPN exit node.",
      colorClass: "text-emerald-500",
    };
  }
  // nextDNS active but no matched VPN city
  return {
    grade: "C",
    label: "Grade C: Encrypted, No VPN Match",
    description: hasSelectedCity
      ? "NextDNS is active but your IP location doesn't match the expected VPN exit node."
      : "NextDNS is active but no expected VPN location is set.",
    colorClass: "text-yellow-500",
  };
}

function AuditLog({ entries }: { entries: AuditEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="w-4 h-4 text-slate-400" />
          Audit Log
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
  const { ipInfo, nextDns, dnsLeak, dnsLeakEntries, dnsLeakAllSecure, dnsResolverInfo, latency, loading, lastUpdated, autoRefresh, setAutoRefresh, refresh, auditLog } =
    useNetDiagnostics();
  const { theme, toggleTheme } = useTheme();
  const [selectedCity, setSelectedCity] = useState<string>("");

  const getPingLabel = (ms: number | null): string | null => {
    if (ms === null) return null;
    if (ms < 50) return `${ms} ms — Excellent`;
    if (ms < 150) return `${ms} ms — Good`;
    return `${ms} ms — Fair`;
  };

  const validLeakEntries = dnsLeakEntries.filter((e) => e.ip);

  // VPN location match — case-insensitive comparison against the city from IP lookup
  const hasSelectedCity = selectedCity !== "";
  const vpnLocationMatch =
    hasSelectedCity &&
    ipInfo?.city != null &&
    ipInfo.city.toLowerCase() === selectedCity.toLowerCase();

  // Anonymity score — only computed once loading is done
  const nextDnsOk = nextDns.status === "ok";
  const dnsLeakDetected = dnsLeakAllSecure === false;
  const anonymityScore = computeAnonymityScore({
    nextDnsOk,
    vpnLocationMatch,
    hasSelectedCity,
    dnsLeakDetected,
  });

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
                {loading && hasSelectedCity ? (
                  <Skeleton className="h-6 w-36" />
                ) : hasSelectedCity ? (
                  vpnLocationMatch ? (
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-transparent bg-emerald-500 px-2.5 py-0.5 text-xs font-semibold text-white">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      VPN Exit Verified
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-transparent bg-red-500 px-2.5 py-0.5 text-xs font-semibold text-white animate-pulse">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Location Mismatch
                    </span>
                  )
                ) : null}
              </div>
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
                <StatusBadge status={nextDns.status} loading={loading} />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2"
                asChild
              >
                <a href="https://test.nextdns.io" target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-3.5 h-3.5" />
                  Check Detailed Logs
                </a>
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
                <StatusBadge status={loading ? null : dnsLeak?.isSameAsPublic ? "leak" : "clean"} loading={loading} />
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

              {/* Primary resolver IP */}
              <div className="space-y-0">
                <DataRow label="Primary Resolver" value={dnsResolverInfo?.ip} loading={loading} />
              </div>

              {/* External test link */}
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2"
                asChild
              >
                <a href="https://dnsleaktest.com" target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-3.5 h-3.5" />
                  Launch Full DNS Leak Test
                </a>
              </Button>
            </CardContent>
          </Card>

          {/* Network Performance Card */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="w-4 h-4 text-orange-500" />
                Network Performance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-0">
              <DataRow label="Latency (to 1.1.1.1)" value={getPingLabel(latency.pingMs)} loading={loading} />
            </CardContent>
          </Card>
        </div>

        {/* Audit Log */}
        <AuditLog entries={auditLog} />

        <p className="text-center text-xs text-muted-foreground">
          Data fetched from ipapi.co, test.nextdns.io, edns.ip-api.com, and bash.ws — All requests made client-side.{" "}
          Deep-packet diagnostics via{" "}
          <a href="https://dnsleaktest.com" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground transition-colors">
            dnsleaktest.com
          </a>
          .
        </p>
      </main>
    </div>
  );
}

import { RefreshCw, Wifi, ShieldCheck, ShieldX, Globe, Activity, Clock, Lock, Sun, Moon, AlertTriangle, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NetworkTopology } from "@/components/NetworkTopology";
import { useNetDiagnostics } from "@/hooks/useNetDiagnostics";
import { useTheme } from "@/hooks/useTheme";
import type { NextDnsInfo, DnsLeakInfo, DnsLeakEntry, AuditEntry, DnsResolverInfo } from "@/hooks/useNetDiagnostics";
import { cn } from "@/lib/utils";

function DataRow({ label, value, loading }: { label: string; value?: string | null; loading: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 border-b border-border/40 last:border-0">
      <span className="text-sm text-muted-foreground flex-shrink-0">{label}</span>
      {loading ? (
        <Skeleton className="h-4 w-32" />
      ) : (
        <span className="text-sm font-medium text-right break-all">{value || "—"}</span>
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
  if (loading) return <Lock className="w-4 h-4 text-muted-foreground animate-pulse" />;
  if (!leak) return <Lock className="w-4 h-4 text-muted-foreground" />;
  return leak.isSameAsPublic ? (
    <ShieldX className="w-4 h-4 text-yellow-500" />
  ) : (
    <ShieldCheck className="w-4 h-4 text-emerald-500" />
  );
}

function DnsLeakTable({ entries, allSecure, loading }: { entries: DnsLeakEntry[]; allSecure: boolean | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground py-2">No resolver data available.</p>;
  }

  return (
    <div className="space-y-3">
      {/* Master validation banner */}
      {allSecure === true && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-4 py-3">
          <ShieldCheck className="w-5 h-5 text-emerald-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">Secure: No Leaks Detected</p>
            <p className="text-xs text-muted-foreground">All {entries.length} resolver(s) confirmed NextDNS infrastructure</p>
          </div>
        </div>
      )}
      {allSecure === false && (
        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-600 dark:text-red-400">DNS Leak Detected</p>
            <p className="text-xs text-muted-foreground">
              {entries.filter((e) => e.status === "leak").length} of {entries.length} resolver(s) are not NextDNS
            </p>
          </div>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>IP Address</TableHead>
            <TableHead>Location</TableHead>
            <TableHead>ISP / Organization</TableHead>
            <TableHead className="text-right">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => (
            <TableRow key={entry.ip}>
              <TableCell className="font-mono text-xs">{entry.ip}</TableCell>
              <TableCell className="text-xs">
                {entry.countryCode && (
                  <span className="mr-1.5">{countryCodeToFlag(entry.countryCode)}</span>
                )}
                {entry.country}
              </TableCell>
              <TableCell className="text-xs max-w-[180px] truncate">{entry.isp || "—"}</TableCell>
              <TableCell className="text-right">
                {entry.status === "secure" ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    NextDNS
                  </span>
                ) : entry.status === "leak" ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-red-500 px-2 py-0.5 text-xs font-semibold text-white">
                    <AlertTriangle className="w-3 h-3" />
                    LEAKING
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">Unknown</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function DnsResolverOverview({ resolverInfo, loading }: { resolverInfo: DnsResolverInfo | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
    );
  }
  if (!resolverInfo) {
    return <p className="text-sm text-muted-foreground py-1">Resolver data unavailable.</p>;
  }
  return (
    <div className="space-y-0">
      <DataRow label="Resolver IP" value={resolverInfo.ip} loading={false} />
      <DataRow label="Resolver ISP" value={resolverInfo.isp} loading={false} />
      <DataRow label="Location" value={resolverInfo.geo} loading={false} />
    </div>
  );
}

function countryCodeToFlag(code: string): string {
  if (!code || code.length !== 2) return "";
  return code
    .toUpperCase()
    .split("")
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join("");
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

function getNextDnsStatusMessage(nextDns: NextDnsInfo): string {
  if (nextDns.status === "ok") return "Using NextDNS";
  if (nextDns.status === "manual") return "Reachable — Manual verification recommended";
  if (nextDns.status === "blocked") {
    return nextDns.blockReason === "cors"
      ? "Browser / CORS Blocked"
      : "Connection Blocked (Firewall)";
  }
  return "NextDNS Not Configured";
}

export function Dashboard() {
  const { ipInfo, nextDns, dnsLeak, dnsLeakEntries, dnsLeakAllSecure, dnsResolverInfo, latency, loading, lastUpdated, autoRefresh, setAutoRefresh, refresh, auditLog } =
    useNetDiagnostics();
  const { theme, toggleTheme } = useTheme();

  const getPingLabel = (ms: number | null) => {
    if (ms === null) return "—";
    if (ms < 50) return `${ms} ms — Excellent`;
    if (ms < 150) return `${ms} ms — Good`;
    return `${ms} ms — Fair`;
  };

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
            <CardContent className="space-y-0">
              <DataRow label="IP Address" value={ipInfo?.ip} loading={loading} />
              <DataRow label="ISP / Org" value={ipInfo?.org || ipInfo?.isp} loading={loading} />
              <DataRow
                label="Location"
                value={ipInfo ? `${ipInfo.city}, ${ipInfo.region}, ${ipInfo.country_name}` : null}
                loading={loading}
              />
              <DataRow label="Timezone" value={ipInfo?.timezone} loading={loading} />
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
            <CardContent className="space-y-3">
              <div className="space-y-0">
                <DataRow
                  label="Status"
                  value={getNextDnsStatusMessage(nextDns)}
                  loading={loading}
                />
                <DataRow label="Config ID" value={nextDns.configId || "—"} loading={loading} />
                <DataRow label="Protocol" value={nextDns.protocol || "—"} loading={loading} />
                <DataRow label="Server" value={nextDns.server || "—"} loading={loading} />
              </div>
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
            <CardContent className="space-y-4">
              {/* Primary resolver overview from ip-api.com */}
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Primary DNS Resolver</p>
                <DnsResolverOverview resolverInfo={dnsResolverInfo} loading={loading} />
              </div>

              {/* Multi-resolver detail table (bash.ws) */}
              {(loading || dnsLeakEntries.length > 0) && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Multi-Resolver Detail</p>
                  <DnsLeakTable entries={dnsLeakEntries} allSecure={dnsLeakAllSecure} loading={loading} />
                </div>
              )}

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
              <DataRow label="Connection Type" value={latency.connectionType} loading={loading} />
              <DataRow
                label="Quality"
                value={
                  latency.pingMs !== null
                    ? latency.pingMs < 50
                      ? "Excellent"
                      : latency.pingMs < 150
                        ? "Good"
                        : "Fair"
                    : null
                }
                loading={loading}
              />
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

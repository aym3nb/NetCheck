import { RefreshCw, Wifi, ShieldCheck, ShieldX, Globe, Activity, Clock, Lock, Sun, Moon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { NetworkTopology } from "@/components/NetworkTopology";
import { useNetDiagnostics } from "@/hooks/useNetDiagnostics";
import { useTheme } from "@/hooks/useTheme";
import type { NextDnsInfo, DnsLeakInfo, AuditEntry } from "@/hooks/useNetDiagnostics";
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
  const { ipInfo, nextDns, dnsLeak, latency, loading, lastUpdated, autoRefresh, setAutoRefresh, refresh, auditLog } =
    useNetDiagnostics();
  const { theme, toggleTheme } = useTheme();

  const getPingLabel = (ms: number | null) => {
    if (ms === null) return "—";
    if (ms < 50) return `${ms} ms ⚡`;
    if (ms < 150) return `${ms} ms ✓`;
    return `${ms} ms ⚠`;
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
            <CardContent className="space-y-0">
              <DataRow
                label="Status"
                value={
                  nextDns.status === "ok"
                    ? "✓ Using NextDNS"
                    : nextDns.status === "blocked"
                      ? nextDns.blockReason === "cors"
                        ? "⊘ Browser/CORS Blocked"
                        : "⊘ Connection Blocked (Firewall)"
                      : "✗ NextDNS Not Configured"
                }
                loading={loading}
              />
              <DataRow label="Config ID" value={nextDns.configId || "—"} loading={loading} />
              <DataRow label="Protocol" value={nextDns.protocol || "—"} loading={loading} />
              <DataRow label="Server" value={nextDns.server || "—"} loading={loading} />
            </CardContent>
          </Card>

          {/* DNS Security Card */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-base">
                <span className="flex items-center gap-2">
                  <LeakIcon leak={dnsLeak} loading={loading} />
                  DNS Security
                </span>
                <StatusBadge status={loading ? null : dnsLeak?.isSameAsPublic ? "leak" : "clean"} loading={loading} />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-0">
              <DataRow label="Resolver IP" value={dnsLeak?.ip} loading={loading} />
              <DataRow label="Resolver Geo" value={dnsLeak?.geo} loading={loading} />
              <DataRow
                label="Leak Status"
                value={
                  dnsLeak
                    ? dnsLeak.isSameAsPublic
                      ? "⚠ Resolver matches public IP"
                      : "✓ Different resolver detected"
                    : null
                }
                loading={loading}
              />
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
          Data fetched from ipapi.co, test.nextdns.io, and edns.ip-api.com — All requests made client-side
        </p>
      </main>
    </div>
  );
}

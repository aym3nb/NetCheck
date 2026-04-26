import { RefreshCw, Wifi, Shield, Globe, Activity, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useNetDiagnostics } from "@/hooks/useNetDiagnostics";

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

export function Dashboard() {
  const { ipInfo, nextDns, dnsLeak, latency, loading, lastUpdated, autoRefresh, setAutoRefresh, refresh } =
    useNetDiagnostics();

  const formatTime = (date: Date | null) => {
    if (!date) return null;
    return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  };

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
                <span>{formatTime(lastUpdated)}</span>
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
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
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
                  <Shield className="w-4 h-4 text-purple-500" />
                  NextDNS Status
                </span>
                {!loading && (
                  <Badge variant={nextDns.status === "ok" ? "success" : "secondary"}>
                    {nextDns.status === "ok" ? "Active" : "Inactive"}
                  </Badge>
                )}
                {loading && <Skeleton className="h-5 w-16" />}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-0">
              <DataRow
                label="Status"
                value={nextDns.status === "ok" ? "✓ Using NextDNS" : "✗ Not using NextDNS"}
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
                  <Shield className="w-4 h-4 text-green-500" />
                  DNS Security
                </span>
                {!loading && dnsLeak && (
                  <Badge variant={dnsLeak.isSameAsPublic ? "warning" : "success"}>
                    {dnsLeak.isSameAsPublic ? "Possible Leak" : "No Leak"}
                  </Badge>
                )}
                {loading && <Skeleton className="h-5 w-20" />}
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

        <p className="text-center text-xs text-muted-foreground mt-8">
          Data fetched from ipapi.co, test.nextdns.io, and edns.ip-api.com — All requests made client-side
        </p>
      </main>
    </div>
  );
}

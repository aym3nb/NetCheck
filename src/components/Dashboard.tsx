import { useState } from "react";
import { RefreshCw, Wifi, ShieldCheck, Globe, Activity, Clock, Sun, Moon, AlertTriangle, ExternalLink, MapPin, CheckCircle2, RotateCcw, Info } from "lucide-react";
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
import type { AuditEntry } from "@/hooks/useNetDiagnostics";
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
  status: "ready" | "verified" | "leak" | null;
  loading: boolean;
  verified?: boolean;
}) {
  if (loading) return <Skeleton className="h-5 w-16" />;

  if (verified) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-transparent bg-emerald-600 px-2.5 py-0.5 text-xs font-semibold text-white">
        <CheckCircle2 className="w-3 h-3" />
        User Verified
      </span>
    );
  }

  if (status === "leak") {
    return (
      <span className="inline-flex items-center rounded-md border border-transparent bg-yellow-500 px-2.5 py-0.5 text-xs font-semibold text-white animate-pulse">
        Potential Leak
      </span>
    );
  }

  // Default: Ready (blue)
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-transparent bg-blue-500 px-2.5 py-0.5 text-xs font-semibold text-white">
      Ready
    </span>
  );
}

/** Delay before showing the NextDNS verification modal after opening the test page */
const NEXTDNS_MODAL_DELAY_MS = 5000;
/** Delay before showing the DNS leak verification modal after opening the test page */
const DNS_LEAK_MODAL_DELAY_MS = 1000;

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

type AnonymityGrade = "A" | "B" | "F" | "—";

interface AnonymityScore {
  grade: AnonymityGrade;
  label: string;
  description: string;
  colorClass: string;
  isPending: boolean;
}

function computeAnonymityScore({
  isNextDNSVerified,
  isDNSLeakVerified,
  hasDNSLeak,
}: {
  isNextDNSVerified: boolean;
  isDNSLeakVerified: boolean;
  hasDNSLeak: boolean;
}): AnonymityScore {
  // Neither audit completed → Pending
  if (!isNextDNSVerified && !isDNSLeakVerified) {
    return {
      grade: "—",
      label: "Score Pending",
      description: "Complete the manual verifications below to calculate your anonymity grade.",
      colorClass: "text-muted-foreground",
      isPending: true,
    };
  }

  // Reported a leak → F
  if (isDNSLeakVerified && hasDNSLeak) {
    return {
      grade: "F",
      label: "Grade F: Exposed",
      description: "You reported a potential DNS leak — your resolver may be visible to third parties.",
      colorClass: "text-red-500",
      isPending: false,
    };
  }

  // Both verified, no leak → A
  if (isNextDNSVerified && isDNSLeakVerified) {
    return {
      grade: "A",
      label: "Grade A: Fully Verified",
      description: "Manually verified: NextDNS active with no DNS leaks.",
      colorClass: "text-emerald-500",
      isPending: false,
    };
  }

  // Only NextDNS verified → B
  if (isNextDNSVerified) {
    return {
      grade: "B",
      label: "Grade B: DNS Verified",
      description: "NextDNS verified. Complete the DNS leak test to reach Grade A.",
      colorClass: "text-blue-500",
      isPending: false,
    };
  }

  // Only DNS leak verified (no leak) → B
  return {
    grade: "B",
    label: "Grade B: Leak-Free",
    description: "No DNS leaks detected. Verify NextDNS to reach Grade A.",
    colorClass: "text-blue-500",
    isPending: false,
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
  const { ipInfo, latency, loading, lastUpdated, autoRefresh, setAutoRefresh, refresh, auditLog } =
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

  // VPN location match — locale-aware, accent/case-insensitive comparison against the city from IP lookup
  const hasSelectedCity = selectedCity !== "";
  const vpnLocationMatch =
    hasSelectedCity &&
    ipInfo?.city != null &&
    ipInfo.city.localeCompare(selectedCity, undefined, { sensitivity: "base" }) === 0;

  // Anonymity score — manual-only, defaults to Pending
  const anonymityScore = computeAnonymityScore({
    isNextDNSVerified,
    isDNSLeakVerified,
    hasDNSLeak,
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
            <NetworkTopology nextDnsVerified={isNextDNSVerified} ipInfo={ipInfo} loading={loading} />
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
              <div className="space-y-3">
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
                {anonymityScore.isPending && (
                  <div className="flex items-start gap-2 rounded-lg bg-muted/50 border border-border/60 px-3 py-2.5">
                    <Info className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-muted-foreground">
                      Your score will be calculated after you complete the{" "}
                      <strong className="text-foreground">NextDNS</strong> and{" "}
                      <strong className="text-foreground">DNS Security Audit</strong> verifications below.
                    </p>
                  </div>
                )}
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

          {/* Network Performance Card */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="w-4 h-4 text-orange-500" />
                Network Performance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-0">
              <DataRow label="Connection Type" value={latency.connectionType || null} loading={loading} />
            </CardContent>
          </Card>

          {/* NextDNS Status Card */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-base">
                <span className="flex items-center gap-2">
                  <ShieldCheck className={cn("w-4 h-4", isNextDNSVerified ? "text-emerald-500" : "text-muted-foreground")} />
                  NextDNS Status
                </span>
                <StatusBadge
                  status="ready"
                  loading={loading}
                  verified={isNextDNSVerified}
                />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Open the NextDNS test page to confirm your DNS is routed through NextDNS. Then answer the prompt.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2"
                onClick={() => {
                  window.open("https://test.nextdns.io", "_blank", "noopener,noreferrer");
                  setTimeout(() => setShowNextDnsModal(true), NEXTDNS_MODAL_DELAY_MS);
                }}
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Check Detailed Logs
              </Button>
            </CardContent>
          </Card>

          {/* DNS Security Audit Card */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-base">
                <span className="flex items-center gap-2">
                  <ShieldCheck className={cn("w-4 h-4", isDNSLeakVerified && !hasDNSLeak ? "text-emerald-500" : "text-muted-foreground")} />
                  DNS Security Audit
                </span>
                <StatusBadge
                  status={isDNSLeakVerified && hasDNSLeak ? "leak" : "ready"}
                  loading={loading}
                  verified={isDNSLeakVerified && !hasDNSLeak}
                />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Run a full DNS leak test on an external tool to verify no resolvers outside NextDNS are visible. Then answer the prompt.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2"
                onClick={() => {
                  window.open("https://dnsleaktest.com", "_blank", "noopener,noreferrer");
                  setTimeout(() => setShowDnsLeakModal(true), DNS_LEAK_MODAL_DELAY_MS);
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
        <DialogContent className="max-w-sm w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="w-5 h-5 text-blue-500 flex-shrink-0" />
              Did it work?
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed break-words">
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
        <DialogContent className="max-w-sm w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="w-5 h-5 text-blue-500 flex-shrink-0" />
              Did it work?
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed break-words">
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

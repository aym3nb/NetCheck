import { Laptop, Router, Server, Cloud, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { IpInfo } from "@/hooks/useNetDiagnostics";

interface NetworkTopologyProps {
  nextDnsVerified: boolean;
  ipInfo: IpInfo | null;
  loading: boolean;
}

interface NodeProps {
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  highlight?: "blue" | "green" | "yellow" | "default";
}

function TopoNode({ icon, label, sublabel, highlight = "default" }: NodeProps) {
  const highlightClasses = {
    default: "border-border bg-card text-foreground",
    blue: "border-blue-400 bg-blue-500/10 text-blue-600",
    green: "border-emerald-400 bg-emerald-500/10 text-emerald-600",
    yellow: "border-yellow-400 bg-yellow-500/10 text-yellow-600 shadow-yellow-400/30 shadow-[0_0_12px_2px]",
  };

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className={cn(
          "w-12 h-12 rounded-xl border-2 flex items-center justify-center transition-all duration-300",
          highlightClasses[highlight]
        )}
      >
        {icon}
      </div>
      <div className="text-center">
        <p className="text-xs font-medium leading-tight">{label}</p>
        {sublabel && <p className="text-[10px] text-muted-foreground leading-tight">{sublabel}</p>}
      </div>
    </div>
  );
}

interface ConnectorProps {
  color?: "blue" | "green" | "muted";
}

function Connector({ color = "muted" }: ConnectorProps) {
  const colorClasses = {
    blue: "text-blue-400",
    green: "text-emerald-400",
    muted: "text-muted-foreground/40",
  };
  return (
    <div className={cn("flex items-center pb-5", colorClasses[color])}>
      <div className={cn("h-px w-4 sm:w-8", color === "muted" ? "bg-border" : color === "blue" ? "bg-blue-400" : "bg-emerald-400")} />
      <ArrowRight className="w-4 h-4 flex-shrink-0" />
    </div>
  );
}

export function NetworkTopology({ nextDnsVerified, ipInfo, loading }: NetworkTopologyProps) {
  const hasIp = ipInfo !== null;

  return (
    <div className="flex items-center justify-center gap-0 py-2 overflow-x-auto">
      {/* Local Device */}
      <TopoNode
        icon={<Laptop className="w-5 h-5" />}
        label="Device"
        sublabel="You"
        highlight="default"
      />

      <Connector color={loading ? "muted" : nextDnsVerified ? "blue" : "muted"} />

      {/* Router */}
      <TopoNode
        icon={<Router className="w-5 h-5" />}
        label="Router"
        sublabel="Gateway"
        highlight="default"
      />

      <Connector color={loading ? "muted" : nextDnsVerified ? "blue" : "muted"} />

      {/* NextDNS Node */}
      <TopoNode
        icon={<Server className="w-5 h-5" />}
        label="NextDNS"
        sublabel={nextDnsVerified ? "Verified" : "Unverified"}
        highlight={loading ? "default" : nextDnsVerified ? "blue" : "default"}
      />

      <Connector color={loading ? "muted" : hasIp ? "green" : "muted"} />

      {/* The Web */}
      <TopoNode
        icon={<Cloud className="w-5 h-5" />}
        label="The Web"
        sublabel={ipInfo?.country_name || "Internet"}
        highlight={loading ? "default" : hasIp ? "green" : "default"}
      />
    </div>
  );
}

import { useGetStatsSummary, useGetStatsByType, useGetRecentActivity } from "@workspace/api-client-react";
import { Activity, CheckCircle2, XCircle, HelpCircle, Play, RefreshCw, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  isLoading,
}: {
  label: string;
  value?: number;
  icon: React.ElementType;
  color: string;
  isLoading: boolean;
}) {
  return (
    <div
      data-testid={`stat-${label.toLowerCase().replace(/\s/g, "-")}`}
      className="bg-card border border-border rounded p-4 flex items-start gap-3"
    >
      <div className={cn("w-8 h-8 rounded flex items-center justify-center shrink-0", color)}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <div className="text-muted-foreground text-xs">{label}</div>
        {isLoading ? (
          <Skeleton className="h-7 w-16 mt-1" />
        ) : (
          <div className="text-2xl font-bold font-mono">{value?.toLocaleString() ?? "—"}</div>
        )}
      </div>
    </div>
  );
}

const EVENT_ICON: Record<string, React.ElementType> = {
  proxy_access: Eye,
  sync_ok: CheckCircle2,
  sync_broken: XCircle,
  sync_redirected: RefreshCw,
};

const EVENT_COLOR: Record<string, string> = {
  proxy_access: "text-blue-400",
  sync_ok: "text-emerald-400",
  sync_broken: "text-red-400",
  sync_redirected: "text-amber-400",
};

function EventLabel(type: string) {
  const labels: Record<string, string> = {
    proxy_access: "Proxy access",
    sync_ok: "Sync OK",
    sync_broken: "Sync broken",
    sync_redirected: "Redirected",
  };
  return labels[type] ?? type;
}

const SOURCE_COLORS: Record<string, string> = {
  cdn: "bg-blue-500/20 text-blue-300",
  platform: "bg-purple-500/20 text-purple-300",
  storage: "bg-amber-500/20 text-amber-300",
  selfhosted: "bg-slate-500/20 text-slate-300",
};

export default function Dashboard() {
  const { data: summary, isLoading: loadingSummary } = useGetStatsSummary();
  const { data: byType, isLoading: loadingByType } = useGetStatsByType();
  const { data: activity, isLoading: loadingActivity } = useGetRecentActivity({ params: { limit: 15 } });

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Video distribution overview</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Total Videos"
          value={summary?.total}
          icon={Play}
          color="bg-primary/20 text-primary"
          isLoading={loadingSummary}
        />
        <StatCard
          label="Active"
          value={summary?.active}
          icon={CheckCircle2}
          color="bg-emerald-500/20 text-emerald-400"
          isLoading={loadingSummary}
        />
        <StatCard
          label="Broken"
          value={summary?.broken}
          icon={XCircle}
          color="bg-red-500/20 text-red-400"
          isLoading={loadingSummary}
        />
        <StatCard
          label="Total Requests"
          value={summary?.total_requests}
          icon={Activity}
          color="bg-purple-500/20 text-purple-400"
          isLoading={loadingSummary}
        />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* By Type */}
        <div className="bg-card border border-border rounded p-4">
          <h2 className="text-sm font-medium mb-3">By Source Type</h2>
          {loadingByType ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : byType && byType.length > 0 ? (
            <div className="space-y-2">
              {byType.map((item) => {
                const total = byType.reduce((s, r) => s + r.count, 0);
                const pct = total > 0 ? (item.count / total) * 100 : 0;
                return (
                  <div key={item.source_type} data-testid={`type-row-${item.source_type}`}>
                    <div className="flex items-center justify-between mb-1">
                      <Badge className={cn("text-[10px] font-mono uppercase", SOURCE_COLORS[item.source_type])}>
                        {item.source_type}
                      </Badge>
                      <span className="text-sm font-mono">{item.count}</span>
                    </div>
                    <div className="h-1 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm text-center py-4">No videos yet</p>
          )}
        </div>

        {/* Recent Activity */}
        <div className="bg-card border border-border rounded p-4">
          <h2 className="text-sm font-medium mb-3">Recent Activity</h2>
          {loadingActivity ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : activity && activity.length > 0 ? (
            <div className="space-y-1 overflow-y-auto max-h-72">
              {activity.map((event) => {
                const Icon = EVENT_ICON[event.event_type] ?? Activity;
                return (
                  <div
                    key={`${event.event_type}-${event.id}`}
                    data-testid={`activity-event-${event.id}`}
                    className="flex items-start gap-2 py-1.5 border-b border-border/50 last:border-0"
                  >
                    <Icon className={cn("w-3.5 h-3.5 mt-0.5 shrink-0", EVENT_COLOR[event.event_type])} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-muted-foreground truncate">{event.slug}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {EventLabel(event.event_type)}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate">{event.title}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm text-center py-4">No activity yet</p>
          )}
          <div className="mt-3">
            <Link href="/videos">
              <span className="text-xs text-primary hover:underline cursor-pointer">View all videos</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

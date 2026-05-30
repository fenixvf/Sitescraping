import { Link, useLocation } from "wouter";
import { LayoutDashboard, Video, Settings, Activity, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTriggerSync, useGetStatsSummary } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const navItems = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/videos", label: "Videos", icon: Video },
  { path: "/settings", label: "Settings", icon: Settings },
];

function StatusDots() {
  const { data } = useGetStatsSummary();
  if (!data) return null;
  return (
    <div className="flex gap-1.5 items-center">
      {data.active > 0 && (
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title={`${data.active} active`} />
      )}
      {data.broken > 0 && (
        <span className="w-1.5 h-1.5 rounded-full bg-red-400" title={`${data.broken} broken`} />
      )}
      {data.unknown > 0 && (
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title={`${data.unknown} unknown`} />
      )}
    </div>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const sync = useTriggerSync({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries();
        toast({
          title: "Sync complete",
          description: `${data.synced} synced, ${data.failed} failed of ${data.total} total`,
        });
      },
      onError: () => {
        toast({ title: "Sync failed", variant: "destructive" });
      },
    },
  });

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r border-border flex flex-col">
        {/* Logo */}
        <div className="px-4 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-primary flex items-center justify-center">
              <Activity className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <div className="text-sm font-semibold leading-none">VidProxy</div>
              <div className="text-[10px] text-muted-foreground mt-0.5 font-mono">Distribution Platform</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-2 space-y-0.5">
          {navItems.map(({ path, label, icon: Icon }) => {
            const active = path === "/" ? location === "/" : location.startsWith(path);
            return (
              <Link key={path} href={path}>
                <div
                  data-testid={`nav-${label.toLowerCase()}`}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2 rounded text-sm transition-colors cursor-pointer",
                    active
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {label}
                  {path === "/" && <StatusDots />}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Sync button */}
        <div className="p-3 border-t border-border">
          <Button
            data-testid="button-sync-all"
            variant="outline"
            size="sm"
            className="w-full gap-2 text-xs"
            onClick={() => sync.mutate()}
            disabled={sync.isPending}
          >
            <RefreshCw className={cn("w-3 h-3", sync.isPending && "animate-spin")} />
            {sync.isPending ? "Syncing..." : "Sync All"}
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}

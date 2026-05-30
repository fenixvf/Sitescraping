import { useRoute, Link } from "wouter";
import { useGetVideo, useGetVideoStats, useUpdateVideo, getGetVideoQueryKey, getGetVideoStatsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Copy, Check, Activity, Clock, Database, Plus, X, ArrowUpDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  broken: "bg-red-500/20 text-red-400 border-red-500/30",
  unknown: "bg-amber-500/20 text-amber-400 border-amber-500/30",
};

const SOURCE_STYLES: Record<string, string> = {
  cdn: "bg-blue-500/15 text-blue-300",
  platform: "bg-purple-500/15 text-purple-300",
  storage: "bg-amber-500/15 text-amber-300",
  selfhosted: "bg-slate-500/15 text-slate-300",
};

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="flex items-center gap-2 bg-secondary/50 rounded px-3 py-2 font-mono text-xs">
        <span className="flex-1 truncate">{value}</span>
        <button
          data-testid={`button-copy-${label.toLowerCase().replace(/\s/g, "-")}`}
          onClick={() => {
            navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatDate(d: string | null | undefined): string {
  if (!d) return "Never";
  return new Date(d).toLocaleString();
}

function MirrorUrls({ videoId, mirrors }: { videoId: number; mirrors: string[] }) {
  const [newMirror, setNewMirror] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const updateVideo = useUpdateVideo({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetVideoQueryKey(videoId) });
      },
      onError: () => toast({ title: "Erro ao atualizar espelhos", variant: "destructive" }),
    },
  });

  const addMirror = () => {
    const trimmed = newMirror.trim();
    if (!trimmed) return;
    try { new URL(trimmed); } catch { toast({ title: "URL inválida", variant: "destructive" }); return; }
    updateVideo.mutate({ id: videoId, data: { mirror_urls: [...mirrors, trimmed] } });
    setNewMirror("");
  };

  const removeMirror = (url: string) => {
    updateVideo.mutate({ id: videoId, data: { mirror_urls: mirrors.filter((u) => u !== url) } });
  };

  const promoteMirror = (url: string) => {
    updateVideo.mutate({ id: videoId, data: { swap_primary: url } });
    toast({ title: "Servidor principal trocado" });
  };

  return (
    <div className="space-y-2 pt-3 border-t border-border">
      <div className="text-xs font-medium">Servidores Espelho</div>
      {mirrors.length === 0 && (
        <p className="text-xs text-muted-foreground">Nenhum espelho. Adicione abaixo para ter fallback automático.</p>
      )}
      {mirrors.map((url) => (
        <div key={url} className="flex items-center gap-1.5 bg-secondary/30 rounded px-2 py-1.5">
          <span className="flex-1 font-mono text-[10px] truncate text-muted-foreground" title={url}>{url}</span>
          <button
            onClick={() => promoteMirror(url)}
            title="Usar como principal"
            className="text-primary hover:text-primary/70 transition-colors shrink-0"
          >
            <ArrowUpDown className="w-3 h-3" />
          </button>
          <button
            onClick={() => removeMirror(url)}
            title="Remover espelho"
            className="text-muted-foreground hover:text-red-400 transition-colors shrink-0"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
      <div className="flex gap-2">
        <Input
          value={newMirror}
          onChange={(e) => setNewMirror(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addMirror())}
          placeholder="https://mirror.exemplo.com/video.mp4"
          className="h-7 text-xs font-mono"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={addMirror}
          disabled={!newMirror || updateVideo.isPending}
          className="h-7 px-2 shrink-0"
        >
          <Plus className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}

export default function VideoDetail() {
  const [, params] = useRoute("/videos/:id");
  const id = params?.id ? parseInt(params.id, 10) : null;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: video, isLoading: loadingVideo } = useGetVideo(id!, {
    query: { enabled: !!id, queryKey: getGetVideoQueryKey(id!) },
  });

  const { data: stats, isLoading: loadingStats } = useGetVideoStats(id!, {
    query: { enabled: !!id, queryKey: getGetVideoStatsQueryKey(id!) },
  });

  const updateVideo = useUpdateVideo({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetVideoQueryKey(id!) });
        toast({ title: "Status updated" });
      },
    },
  });

  if (!id) return <div className="p-6 text-muted-foreground">Invalid video ID</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/videos">
          <button className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
        </Link>
        {loadingVideo ? (
          <Skeleton className="h-6 w-48" />
        ) : (
          <div>
            <h1 className="text-lg font-semibold">{video?.title}</h1>
            <span className="font-mono text-xs text-muted-foreground">{video?.slug}</span>
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Metadata */}
        <div className="bg-card border border-border rounded p-4 space-y-4">
          <h2 className="text-sm font-medium">Metadata</h2>

          {loadingVideo ? (
            <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
          ) : video ? (
            <>
              <div className="flex items-center gap-2">
                <Badge className={cn("text-[10px] font-mono uppercase border-0", SOURCE_STYLES[video.source_type])}>
                  {video.source_type}
                </Badge>
                <div className="flex items-center gap-2">
                  <Badge className={cn("text-[10px] font-mono capitalize border", STATUS_STYLES[video.status])}>
                    {video.status}
                  </Badge>
                  <Select
                    value={video.status}
                    onValueChange={(v) =>
                      updateVideo.mutate({ id: video.id, data: { status: v as "active" | "broken" | "unknown" } })
                    }
                  >
                    <SelectTrigger data-testid="select-video-status" className="h-6 w-24 text-[10px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="broken">Broken</SelectItem>
                      <SelectItem value="unknown">Unknown</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <CopyField label="Proxy URL" value={video.proxy_url} />

              {video.mime_type && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">MIME Type</div>
                  <span className="font-mono text-xs">{video.mime_type}</span>
                </div>
              )}

              {video.content_length && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Content Length</div>
                  <span className="font-mono text-xs">{formatBytes(video.content_length)}</span>
                </div>
              )}

              {video.tags && video.tags.length > 0 && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Tags</div>
                  <div className="flex gap-1 flex-wrap">
                    {video.tags.map((tag) => (
                      <span key={tag} className="text-xs px-2 py-0.5 bg-secondary rounded font-mono">{tag}</span>
                    ))}
                  </div>
                </div>
              )}

              {video.fallback_url && (
                <CopyField label="Fallback URL" value={video.fallback_url} />
              )}

              <MirrorUrls videoId={video.id} mirrors={video.mirror_urls ?? []} />

              <div className="text-[10px] text-muted-foreground pt-1">
                Added {formatDate(video.created_at)}
              </div>
            </>
          ) : null}
        </div>

        {/* Stats */}
        <div className="bg-card border border-border rounded p-4 space-y-4">
          <h2 className="text-sm font-medium">Access Stats</h2>

          {loadingStats ? (
            <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : stats ? (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-secondary/30 rounded p-3 text-center" data-testid="stat-total-requests">
                  <div className="text-muted-foreground text-[10px] mb-1 flex items-center justify-center gap-1">
                    <Activity className="w-3 h-3" /> Requests
                  </div>
                  <div className="text-xl font-bold font-mono">{stats.total_requests.toLocaleString()}</div>
                </div>
                <div className="bg-secondary/30 rounded p-3 text-center" data-testid="stat-bytes-served">
                  <div className="text-muted-foreground text-[10px] mb-1 flex items-center justify-center gap-1">
                    <Database className="w-3 h-3" /> Served
                  </div>
                  <div className="text-xl font-bold font-mono">{formatBytes(stats.bytes_served)}</div>
                </div>
                <div className="bg-secondary/30 rounded p-3 text-center" data-testid="stat-last-accessed">
                  <div className="text-muted-foreground text-[10px] mb-1 flex items-center justify-center gap-1">
                    <Clock className="w-3 h-3" /> Last Hit
                  </div>
                  <div className="text-xs font-mono">{stats.last_accessed ? new Date(stats.last_accessed).toLocaleDateString() : "Never"}</div>
                </div>
              </div>

              {/* Recent accesses */}
              {stats.recent_accesses.length > 0 && (
                <div>
                  <h3 className="text-xs font-medium mb-2">Recent Accesses</h3>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {stats.recent_accesses.map((a) => (
                      <div
                        key={a.id}
                        data-testid={`access-log-${a.id}`}
                        className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0 text-[10px]"
                      >
                        <span className="font-mono text-muted-foreground">{a.ip ?? "—"}</span>
                        <span className="text-muted-foreground">{formatBytes(a.bytes)}</span>
                        <span className="text-muted-foreground">{new Date(a.accessed_at).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

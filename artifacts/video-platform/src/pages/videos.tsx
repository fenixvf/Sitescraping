import { useState } from "react";
import {
  useListVideos,
  useListFolders,
  getListVideosQueryKey,
  useCreateVideo,
  useDeleteVideo,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Copy, Plus, Trash2, ExternalLink, Check, FolderOpen, RefreshCw, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import { useFolderContext } from "@/components/layout/layout";

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

function formatExpiry(expiresAt: string | null | undefined): string | null {
  if (!expiresAt) return null;
  const d = new Date(expiresAt);
  const diff = d.getTime() - Date.now();
  if (diff < 0) return "Expirado";
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `Expira em ${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Expira em ${hrs}h`;
  return `Expira em ${Math.floor(hrs / 24)}d`;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={copy} className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function AddVideoDialog({ defaultFolderId }: { defaultFolderId?: number | null }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");
  const [refreshUrl, setRefreshUrl] = useState("");
  const [folderId, setFolderId] = useState<string>(defaultFolderId ? String(defaultFolderId) : "none");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: folders } = useListFolders();

  const createVideo = useCreateVideo({
    mutation: {
      onSuccess: (video) => {
        queryClient.invalidateQueries({ queryKey: getListVideosQueryKey() });
        queryClient.invalidateQueries();
        toast({ title: "Vídeo registrado", description: `Proxy: ${video.proxy_url}` });
        setOpen(false);
        setUrl(""); setTitle(""); setTags(""); setRefreshUrl("");
      },
      onError: () => toast({ title: "Erro ao registrar vídeo", variant: "destructive" }),
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    createVideo.mutate({
      data: {
        url,
        title: title || undefined,
        tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
        refresh_url: refreshUrl || null,
        folder_id: folderId !== "none" ? Number(folderId) : null,
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5 text-xs h-8 shrink-0">
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Adicionar vídeo</span>
          <span className="sm:hidden">Adicionar</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md mx-4">
        <DialogHeader>
          <DialogTitle>Registrar link de vídeo</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="url">URL inicial *</Label>
            <Input
              id="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/video.mp4"
              required
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5 text-primary" />
              <Label htmlFor="refresh_url">URL de Refresh <span className="text-muted-foreground font-normal">(opcional)</span></Label>
            </div>
            <Input
              id="refresh_url"
              value={refreshUrl}
              onChange={(e) => setRefreshUrl(e.target.value)}
              placeholder="https://seu-backend.com/get-link"
            />
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Quando o link expirar, o proxy chama essa URL e pega o link novo.
              Responda com <code className="bg-secondary px-1 rounded">{"{ url, expires_in }"}</code> (JSON) ou o link direto.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="title">Título</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Detectado automaticamente da URL"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tags">Tags (separadas por vírgula)</Label>
            <Input
              id="tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="esportes, 4k, ao vivo"
            />
          </div>
          {folders && folders.length > 0 && (
            <div className="space-y-1.5">
              <Label>Pasta</Label>
              <Select value={folderId} onValueChange={setFolderId}>
                <SelectTrigger className="text-xs">
                  <SelectValue placeholder="Sem pasta" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem pasta</SelectItem>
                  {folders.map((f) => (
                    <SelectItem key={f.id} value={String(f.id)}>
                      <span className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: f.color }} />
                        {f.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <Button type="submit" className="w-full" disabled={createVideo.isPending || !url}>
            {createVideo.isPending ? "Registrando..." : "Registrar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function VideoCard({ video, onDelete }: { video: any; onDelete: () => void }) {
  const expiry = formatExpiry(video.url_expires_at);
  const isDynamic = !!video.refresh_url;

  return (
    <div className="border border-border rounded-lg p-4 space-y-3 bg-card hover:bg-card/80 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Link href={`/videos/${video.id}`}>
              <p className="text-sm font-medium hover:text-primary cursor-pointer truncate">{video.title}</p>
            </Link>
            {isDynamic && (
              <RefreshCw className="w-3 h-3 text-primary shrink-0" title="Auto-refresh ativo" />
            )}
          </div>
          <span className="font-mono text-[10px] text-muted-foreground">{video.slug}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Link href={`/videos/${video.id}`}>
            <button className="p-1.5 text-muted-foreground hover:text-foreground transition-colors">
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </Link>
          <button
            className="p-1.5 text-muted-foreground hover:text-red-400 transition-colors"
            onClick={() => { if (confirm("Deletar este vídeo?")) onDelete(); }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Badge className={cn("text-[10px] font-mono uppercase border-0", SOURCE_STYLES[video.source_type])}>
          {video.source_type}
        </Badge>
        <Badge className={cn("text-[10px] font-mono capitalize border", STATUS_STYLES[video.status])}>
          {video.status}
        </Badge>
        {expiry && (
          <span className={cn(
            "flex items-center gap-1 text-[10px] font-mono",
            expiry === "Expirado" ? "text-red-400" : "text-amber-400"
          )}>
            <Clock className="w-2.5 h-2.5" />
            {expiry}
          </span>
        )}
        {video.tags?.map((tag: string) => (
          <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-secondary rounded font-mono">{tag}</span>
        ))}
      </div>

      <div className="flex items-center gap-1.5 bg-secondary/40 rounded px-2 py-1.5">
        <span className="font-mono text-[10px] text-muted-foreground truncate flex-1">{video.proxy_url}</span>
        <CopyButton text={video.proxy_url} />
      </div>
    </div>
  );
}

export default function VideosList() {
  const { activeFolderId, setActiveFolderId } = useFolderContext();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: folders } = useListFolders();

  const params = {
    page,
    limit: 25,
    status: statusFilter !== "all" ? (statusFilter as "active" | "broken" | "unknown") : undefined,
    source_type: sourceFilter !== "all" ? (sourceFilter as "cdn" | "platform" | "storage" | "selfhosted") : undefined,
    folder_id: activeFolderId ?? undefined,
  };

  const { data, isLoading } = useListVideos({ params });

  const deleteVideo = useDeleteVideo({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListVideosQueryKey() });
        queryClient.invalidateQueries();
        toast({ title: "Vídeo deletado" });
      },
    },
  });

  const activeFolder = folders?.find((f) => f.id === activeFolderId);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {activeFolder && (
              <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: activeFolder.color }} />
            )}
            <h1 className="text-base sm:text-lg font-semibold truncate">
              {activeFolder ? activeFolder.name : "Vídeos"}
            </h1>
          </div>
          <p className="text-muted-foreground text-xs sm:text-sm mt-0.5">
            {data?.total ?? "—"} vídeos registrados
            {activeFolder && (
              <button onClick={() => setActiveFolderId(null)} className="ml-2 text-primary hover:underline">
                Ver todos
              </button>
            )}
          </p>
        </div>
        <AddVideoDialog defaultFolderId={activeFolderId} />
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-32 sm:w-36 text-xs h-8">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="active">Ativo</SelectItem>
            <SelectItem value="broken">Quebrado</SelectItem>
            <SelectItem value="unknown">Desconhecido</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sourceFilter} onValueChange={(v) => { setSourceFilter(v); setPage(1); }}>
          <SelectTrigger className="w-36 sm:w-40 text-xs h-8">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            <SelectItem value="cdn">CDN</SelectItem>
            <SelectItem value="platform">Plataforma</SelectItem>
            <SelectItem value="storage">Storage</SelectItem>
            <SelectItem value="selfhosted">Self-hosted</SelectItem>
          </SelectContent>
        </Select>
        {folders && folders.length > 0 && (
          <Select
            value={activeFolderId !== null ? String(activeFolderId) : "all"}
            onValueChange={(v) => { setActiveFolderId(v === "all" ? null : Number(v)); setPage(1); }}
          >
            <SelectTrigger className="w-36 sm:w-40 text-xs h-8">
              <SelectValue placeholder="Pasta" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                <span className="flex items-center gap-2"><FolderOpen className="w-3 h-3" />Todas as pastas</span>
              </SelectItem>
              {folders.map((f) => (
                <SelectItem key={f.id} value={String(f.id)}>
                  <span className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: f.color }} />
                    {f.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Mobile card list */}
      <div className="sm:hidden space-y-3">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="border border-border rounded-lg p-4 space-y-3">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-8 w-full" />
            </div>
          ))
        ) : data?.videos.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            Nenhum vídeo encontrado. Adicione seu primeiro link.
          </div>
        ) : (
          data?.videos.map((video) => (
            <VideoCard
              key={video.id}
              video={video}
              onDelete={() => deleteVideo.mutate({ id: video.id })}
            />
          ))
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block border border-border rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/30 text-left">
              <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">Slug</th>
              <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">Título</th>
              <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">Tipo</th>
              <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">Expiração</th>
              <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">Proxy URL</th>
              <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-border/50">
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                  ))}
                </tr>
              ))
            ) : data?.videos.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground text-sm">
                  Nenhum vídeo encontrado. Adicione seu primeiro link.
                </td>
              </tr>
            ) : (
              data?.videos.map((video) => {
                const expiry = formatExpiry(video.url_expires_at);
                const isDynamic = !!video.refresh_url;
                return (
                  <tr key={video.id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-muted-foreground">{video.slug}</span>
                    </td>
                    <td className="px-4 py-3 max-w-[180px]">
                      <Link href={`/videos/${video.id}`}>
                        <span className="text-xs hover:text-primary cursor-pointer truncate flex items-center gap-1">
                          {video.title}
                          {isDynamic && <RefreshCw className="w-2.5 h-2.5 text-primary shrink-0" />}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={cn("text-[10px] font-mono uppercase border-0", SOURCE_STYLES[video.source_type])}>
                        {video.source_type}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={cn("text-[10px] font-mono capitalize border", STATUS_STYLES[video.status])}>
                        {video.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {expiry ? (
                        <span className={cn(
                          "flex items-center gap-1 text-[10px] font-mono",
                          expiry === "Expirado" ? "text-red-400" : "text-amber-400"
                        )}>
                          <Clock className="w-2.5 h-2.5" />
                          {expiry}
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground/40">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 max-w-[200px]">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[10px] text-muted-foreground truncate">{video.proxy_url}</span>
                        <CopyButton text={video.proxy_url} />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Link href={`/videos/${video.id}`}>
                          <button className="p-1 text-muted-foreground hover:text-foreground transition-colors">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        </Link>
                        <button
                          className="p-1 text-muted-foreground hover:text-red-400 transition-colors"
                          onClick={() => { if (confirm("Deletar este vídeo?")) deleteVideo.mutate({ id: video.id }); }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data && data.total > data.limit && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {(page - 1) * data.limit + 1}–{Math.min(page * data.limit, data.total)} de {data.total}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              Anterior
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page * data.limit >= data.total} onClick={() => setPage((p) => p + 1)}>
              Próximo
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

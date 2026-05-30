import { useState } from "react";
import {
  useListVideos,
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
import { Copy, Plus, Trash2, ExternalLink, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "wouter";

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

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      data-testid="button-copy-proxy-url"
      onClick={copy}
      className="text-muted-foreground hover:text-foreground transition-colors"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function AddVideoDialog() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");
  const [fallbackUrl, setFallbackUrl] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createVideo = useCreateVideo({
    mutation: {
      onSuccess: (video) => {
        queryClient.invalidateQueries({ queryKey: getListVideosQueryKey() });
        queryClient.invalidateQueries();
        toast({ title: "Video registered", description: `Proxy: ${video.proxy_url}` });
        setOpen(false);
        setUrl("");
        setTitle("");
        setTags("");
        setFallbackUrl("");
      },
      onError: () => {
        toast({ title: "Failed to register video", variant: "destructive" });
      },
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
        fallback_url: fallbackUrl || null,
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-add-video" size="sm" className="gap-1.5">
          <Plus className="w-3.5 h-3.5" />
          Add Video
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Register Video Link</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="url">URL *</Label>
            <Input
              id="url"
              data-testid="input-video-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/video.mp4"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              data-testid="input-video-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Auto-detected from URL"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tags">Tags (comma-separated)</Label>
            <Input
              id="tags"
              data-testid="input-video-tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="sports, 4k, live"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fallback">Fallback URL</Label>
            <Input
              id="fallback"
              data-testid="input-video-fallback"
              value={fallbackUrl}
              onChange={(e) => setFallbackUrl(e.target.value)}
              placeholder="https://backup.example.com/video.mp4"
            />
          </div>
          <Button
            data-testid="button-submit-video"
            type="submit"
            className="w-full"
            disabled={createVideo.isPending || !url}
          >
            {createVideo.isPending ? "Registering..." : "Register"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function VideosList() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const params = {
    page,
    limit: 25,
    status: statusFilter !== "all" ? (statusFilter as "active" | "broken" | "unknown") : undefined,
    source_type: sourceFilter !== "all" ? (sourceFilter as "cdn" | "platform" | "storage" | "selfhosted") : undefined,
  };

  const { data, isLoading } = useListVideos({ params });

  const deleteVideo = useDeleteVideo({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListVideosQueryKey() });
        queryClient.invalidateQueries();
        toast({ title: "Video deleted" });
      },
    },
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Videos</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {data?.total ?? "—"} videos registered
          </p>
        </div>
        <AddVideoDialog />
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger data-testid="select-status-filter" className="w-36 text-xs h-8">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="broken">Broken</SelectItem>
            <SelectItem value="unknown">Unknown</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sourceFilter} onValueChange={(v) => { setSourceFilter(v); setPage(1); }}>
          <SelectTrigger data-testid="select-source-filter" className="w-40 text-xs h-8">
            <SelectValue placeholder="Source type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="cdn">CDN</SelectItem>
            <SelectItem value="platform">Platform</SelectItem>
            <SelectItem value="storage">Storage</SelectItem>
            <SelectItem value="selfhosted">Self-hosted</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="border border-border rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/30 text-left">
              <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">Slug</th>
              <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">Title</th>
              <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">Type</th>
              <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">Proxy URL</th>
              <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">Tags</th>
              <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-border/50">
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <Skeleton className="h-4 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : data?.videos.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground text-sm">
                  No videos found. Add your first video link.
                </td>
              </tr>
            ) : (
              data?.videos.map((video) => (
                <tr
                  key={video.id}
                  data-testid={`row-video-${video.id}`}
                  className="border-b border-border/50 hover:bg-secondary/20 transition-colors"
                >
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-muted-foreground">{video.slug}</span>
                  </td>
                  <td className="px-4 py-3 max-w-[180px]">
                    <Link href={`/videos/${video.id}`}>
                      <span className="text-xs hover:text-primary cursor-pointer truncate block">{video.title}</span>
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
                  <td className="px-4 py-3 max-w-[200px]">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[10px] text-muted-foreground truncate">{video.proxy_url}</span>
                      <CopyButton text={video.proxy_url} />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      {video.tags?.slice(0, 2).map((tag) => (
                        <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-secondary rounded font-mono">
                          {tag}
                        </span>
                      ))}
                      {(video.tags?.length ?? 0) > 2 && (
                        <span className="text-[10px] text-muted-foreground">+{(video.tags?.length ?? 0) - 2}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <Link href={`/videos/${video.id}`}>
                        <button
                          data-testid={`button-view-video-${video.id}`}
                          className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      </Link>
                      <button
                        data-testid={`button-delete-video-${video.id}`}
                        className="p-1 text-muted-foreground hover:text-red-400 transition-colors"
                        onClick={() => {
                          if (confirm("Delete this video?")) {
                            deleteVideo.mutate({ id: video.id });
                          }
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data && data.total > data.limit && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Showing {(page - 1) * data.limit + 1}–{Math.min(page * data.limit, data.total)} of {data.total}
          </span>
          <div className="flex gap-2">
            <Button
              data-testid="button-prev-page"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              data-testid="button-next-page"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={page * data.limit >= data.total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

import { useRef, useState, useEffect, useCallback } from "react";
import { useRoute, Link } from "wouter";
import Hls from "hls.js";
import {
  useListVideos,
  useGetVideo,
  useGetVideoStats,
  getGetVideoQueryKey,
  getGetVideoStatsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Play, RefreshCw, Wifi, AlertTriangle, Clock, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

function isHlsMime(mime: string | null | undefined): boolean {
  if (!mime) return false;
  const m = mime.toLowerCase();
  return m.includes("mpegurl") || m.includes("m3u8");
}

interface EventEntry {
  id: number;
  time: string;
  type: "info" | "warn" | "error" | "success" | "refresh";
  message: string;
}

let eventId = 0;

function now() {
  return new Date().toLocaleTimeString("pt-BR", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatCountdown(expiresAt: string | null | undefined): string | null {
  if (!expiresAt) return null;
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff < 0) return "EXPIRADO";
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function ExpiryBadge({ expiresAt }: { expiresAt: string | null | undefined }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!expiresAt) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [expiresAt]);

  if (!expiresAt) return <span className="text-xs text-muted-foreground font-mono">sem expiração</span>;

  const diff = new Date(expiresAt).getTime() - Date.now();
  const expired = diff < 0;
  const soon = diff < 60_000;

  return (
    <span
      className={cn(
        "font-mono text-xs px-2 py-0.5 rounded",
        expired ? "bg-red-500/20 text-red-400" : soon ? "bg-amber-500/20 text-amber-400" : "bg-emerald-500/20 text-emerald-400"
      )}
    >
      {expired ? "⚠ EXPIRADO" : formatCountdown(expiresAt)}
    </span>
  );
}

export default function PlayerPage() {
  const [, params] = useRoute("/player/:id");
  const [selectedId, setSelectedId] = useState<number | null>(params?.id ? parseInt(params.id, 10) : null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [usingHls, setUsingHls] = useState(false);
  const [events, setEvents] = useState<EventEntry[]>([]);
  const [prevRefreshedAt, setPrevRefreshedAt] = useState<string | null | undefined>(undefined);
  const [prevTotalRequests, setPrevTotalRequests] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const { data: videoList } = useListVideos({ page: 1, limit: 100 });

  const { data: video } = useGetVideo(selectedId!, {
    query: {
      enabled: !!selectedId,
      queryKey: getGetVideoQueryKey(selectedId!),
      refetchInterval: 5000,
    },
  });

  const { data: stats } = useGetVideoStats(selectedId!, {
    query: {
      enabled: !!selectedId,
      queryKey: getGetVideoStatsQueryKey(selectedId!),
      refetchInterval: 3000,
    },
  });

  const addEvent = useCallback((type: EventEntry["type"], message: string) => {
    setEvents((prev) => [{ id: eventId++, time: now(), type, message }, ...prev].slice(0, 80));
  }, []);

  // Detect URL refresh
  useEffect(() => {
    if (!video) return;
    const refreshedAt = video.url_refreshed_at;
    if (prevRefreshedAt === undefined) {
      setPrevRefreshedAt(refreshedAt);
      return;
    }
    if (refreshedAt && refreshedAt !== prevRefreshedAt) {
      addEvent("refresh", `🔄 URL renovada pelo proxy! Novo url_refreshed_at: ${new Date(refreshedAt).toLocaleTimeString("pt-BR")}`);
      setPrevRefreshedAt(refreshedAt);
    }
  }, [video?.url_refreshed_at]);

  // Detect new access log entries
  useEffect(() => {
    if (!stats) return;
    if (prevTotalRequests === null) {
      setPrevTotalRequests(stats.total_requests);
      return;
    }
    const delta = stats.total_requests - prevTotalRequests;
    if (delta > 0) {
      addEvent("info", `📡 +${delta} nova(s) requisição(ões) registrada(s) no proxy (total: ${stats.total_requests})`);
      setPrevTotalRequests(stats.total_requests);
    }
  }, [stats?.total_requests]);

  // Helper: attach HLS.js to the video element
  const attachHls = useCallback((el: HTMLVideoElement, src: string) => {
    if (!Hls.isSupported()) {
      addEvent("warn", "⚠ HLS.js não suportado neste browser — tentando nativo");
      el.src = src;
      return;
    }
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    const hls = new Hls({ enableWorker: true, lowLatencyMode: false });
    hlsRef.current = hls;
    hls.loadSource(src);
    hls.attachMedia(el);
    setUsingHls(true);
    addEvent("info", "🎞 HLS.js ativo — carregando playlist...");

    hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
      addEvent("success", `✓ Manifest HLS carregado — ${data.levels.length} qualidade(s) disponível(is)`);
      el.play().catch(() => {});
    });

    hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => {
      const lvl = hls.levels[data.level];
      if (lvl) addEvent("info", `📶 Qualidade: ${lvl.height ? `${lvl.height}p` : "auto"} (${Math.round((lvl.bitrate ?? 0) / 1000)} kbps)`);
    });

    hls.on(Hls.Events.FRAG_LOADED, (_e, data) => {
      addEvent("info", `🧩 Segmento carregado: ${data.frag.sn} (${(data.frag.stats.total / 1024).toFixed(1)} KB)`);
    });

    hls.on(Hls.Events.ERROR, (_e, data) => {
      if (data.fatal) {
        addEvent("error", `✗ HLS.js erro fatal (${data.type}): ${data.details}`);
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          addEvent("warn", "🔄 Tentando recuperar erro de rede...");
          hls.startLoad();
        } else {
          hls.destroy();
          hlsRef.current = null;
          setUsingHls(false);
        }
      } else {
        addEvent("warn", `⚠ HLS.js aviso (${data.details})`);
      }
    });
  }, [addEvent]);

  // Initialize / switch player mode when video changes
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !video?.proxy_url) return;

    const src = video.proxy_url;

    // Destroy any existing HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
      setUsingHls(false);
    }

    // If mime_type tells us it's HLS → go straight to HLS.js
    if (isHlsMime(video.mime_type)) {
      attachHls(el, src);
      return;
    }

    // Otherwise try native; fall back to HLS.js on SRC_NOT_SUPPORTED
    el.src = src;
    el.load();

    const onError = () => {
      if (el.error?.code === 4 && Hls.isSupported()) {
        addEvent("warn", "⚠ Nativo falhou — tentando HLS.js...");
        attachHls(el, src);
      }
    };
    el.addEventListener("error", onError, { once: true });
    return () => el.removeEventListener("error", onError);
  }, [video?.proxy_url, video?.mime_type, attachHls, addEvent]);

  // Attach video element events
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !selectedId) return;

    const handlers: Record<string, () => void> = {
      loadstart: () => addEvent("info", "▶ Iniciando carregamento via proxy..."),
      canplay: () => addEvent("success", "✓ Vídeo pronto para reprodução"),
      playing: () => addEvent("success", "▶ Reproduzindo"),
      pause: () => addEvent("info", "⏸ Pausado"),
      waiting: () => addEvent("warn", "⏳ Buffering / aguardando dados..."),
      stalled: () => addEvent("warn", "⚠ Stall — conexão parou de enviar dados"),
      error: () => {
        if (hlsRef.current) return; // HLS.js handles its own errors
        const code = el.error?.code ?? "?";
        const msg = el.error?.message ?? "desconhecido";
        const labels: Record<number, string> = { 1: "ABORTED", 2: "NETWORK", 3: "DECODE", 4: "SRC_NOT_SUPPORTED" };
        addEvent("error", `✗ Erro (${labels[code as number] ?? code}): ${msg}`);
      },
      ended: () => addEvent("info", "⏹ Reprodução finalizada"),
      seeked: () => addEvent("info", `⏩ Seeked para ${el.currentTime.toFixed(1)}s`),
    };

    for (const [evt, fn] of Object.entries(handlers)) el.addEventListener(evt, fn);
    return () => {
      for (const [evt, fn] of Object.entries(handlers)) el.removeEventListener(evt, fn);
    };
  }, [selectedId, addEvent]);

  // Cleanup HLS on unmount
  useEffect(() => {
    return () => {
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, []);

  const handleVideoSelect = (idStr: string) => {
    const id = parseInt(idStr, 10);
    // Destroy HLS before switching
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    setUsingHls(false);
    setSelectedId(id);
    setEvents([]);
    setPrevRefreshedAt(undefined);
    setPrevTotalRequests(null);
    queryClient.invalidateQueries({ queryKey: getGetVideoQueryKey(id) });
    queryClient.invalidateQueries({ queryKey: getGetVideoStatsQueryKey(id) });
  };

  const handleForceRefresh = () => {
    addEvent("info", "🔃 Forçando nova requisição ao proxy...");
    const el = videoRef.current;
    if (!el || !video?.proxy_url) return;
    if (hlsRef.current) {
      // HLS.js: reload the manifest
      hlsRef.current.stopLoad();
      hlsRef.current.loadSource(video.proxy_url);
      hlsRef.current.startLoad();
      el.play().catch(() => {});
    } else {
      const t = el.currentTime;
      el.load();
      el.currentTime = t;
      el.play().catch(() => {});
    }
  };

  const isExpired = video?.url_expires_at
    ? new Date(video.url_expires_at).getTime() <= Date.now()
    : false;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/videos">
          <button className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
        </Link>
        <div>
          <h1 className="text-base font-semibold">Player de Teste</h1>
          <p className="text-xs text-muted-foreground">Reproduz via proxy e monitora requisições e renovações de URL</p>
        </div>
      </div>

      {/* Video selector */}
      <div className="flex items-center gap-3">
        <Select value={selectedId?.toString() ?? ""} onValueChange={handleVideoSelect}>
          <SelectTrigger className="w-72 text-sm">
            <SelectValue placeholder="Selecionar vídeo..." />
          </SelectTrigger>
          <SelectContent>
            {videoList?.videos.map((v) => (
              <SelectItem key={v.id} value={v.id.toString()}>
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      "w-1.5 h-1.5 rounded-full shrink-0 inline-block",
                      v.status === "active" ? "bg-emerald-400" : v.status === "broken" ? "bg-red-400" : "bg-amber-400"
                    )}
                  />
                  {v.title}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedId && (
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handleForceRefresh}>
            <RefreshCw className="w-3.5 h-3.5" />
            Re-hit proxy
          </Button>
        )}
      </div>

      <div className="grid lg:grid-cols-5 gap-4">
        {/* Left: player + metadata */}
        <div className="lg:col-span-3 space-y-3">
          {/* Video element */}
          <div className="rounded overflow-hidden bg-black aspect-video relative">
            {!selectedId ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground gap-2">
                <Play className="w-12 h-12 opacity-20" />
                <p className="text-xs">Selecione um vídeo acima</p>
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  className="w-full h-full"
                  controls
                  preload="auto"
                />
                {usingHls && (
                  <div className="absolute top-2 right-2 bg-purple-600/80 text-white text-[10px] font-bold px-2 py-0.5 rounded font-mono">
                    HLS.js
                  </div>
                )}
              </>
            )}
          </div>

          {/* Video metadata */}
          {video && (
            <div className="bg-card border border-border rounded p-3 space-y-2 text-xs">
              <div className="font-medium text-sm">{video.title}</div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                <div>
                  <span className="text-muted-foreground">Status:</span>{" "}
                  <span
                    className={cn(
                      "font-mono",
                      video.status === "active" ? "text-emerald-400" : video.status === "broken" ? "text-red-400" : "text-amber-400"
                    )}
                  >
                    {video.status}
                  </span>
                </div>

                <div>
                  <span className="text-muted-foreground">Fonte:</span>{" "}
                  <span className="font-mono">{video.source_type}</span>
                </div>

                <div className="col-span-2">
                  <span className="text-muted-foreground">Proxy URL:</span>{" "}
                  <span className="font-mono text-[10px] break-all text-blue-400">{video.proxy_url}</span>
                </div>

                {video.refresh_url && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Refresh URL:</span>{" "}
                    <span className="font-mono text-[10px] break-all text-purple-400">{video.refresh_url}</span>
                  </div>
                )}

                <div>
                  <span className="text-muted-foreground">Expiração:</span>{" "}
                  <ExpiryBadge expiresAt={video.url_expires_at} />
                </div>

                {video.url_refreshed_at && (
                  <div>
                    <span className="text-muted-foreground">Última renovação:</span>{" "}
                    <span className="font-mono">{new Date(video.url_refreshed_at).toLocaleTimeString("pt-BR")}</span>
                  </div>
                )}
              </div>

              {/* Expiry warning */}
              {isExpired && video.refresh_url && (
                <div className="mt-2 flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded p-2 text-amber-400">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-medium text-[11px]">URL expirada</div>
                    <div className="text-[10px] text-amber-400/80">
                      O proxy vai renovar automaticamente na próxima requisição. Clique em "Re-hit proxy" para forçar.
                    </div>
                  </div>
                </div>
              )}

              {isExpired && !video.refresh_url && (
                <div className="mt-2 flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded p-2 text-red-400">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <div className="text-[11px]">URL expirada e sem refresh_url configurado — o vídeo pode falhar.</div>
                </div>
              )}
            </div>
          )}

          {/* Stats summary */}
          {stats && (
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="bg-card border border-border rounded p-2 text-center">
                <div className="text-muted-foreground text-[10px] flex items-center justify-center gap-1 mb-1">
                  <Activity className="w-3 h-3" /> Total hits
                </div>
                <div className="font-bold font-mono text-lg">{stats.total_requests.toLocaleString()}</div>
              </div>
              <div className="bg-card border border-border rounded p-2 text-center">
                <div className="text-muted-foreground text-[10px] flex items-center justify-center gap-1 mb-1">
                  <Wifi className="w-3 h-3" /> Última req.
                </div>
                <div className="font-mono text-[11px]">
                  {stats.last_accessed ? new Date(stats.last_accessed).toLocaleTimeString("pt-BR") : "—"}
                </div>
              </div>
              <div className="bg-card border border-border rounded p-2 text-center">
                <div className="text-muted-foreground text-[10px] flex items-center justify-center gap-1 mb-1">
                  <Clock className="w-3 h-3" /> Slug
                </div>
                <div className="font-mono text-[11px] truncate">{stats.slug}</div>
              </div>
            </div>
          )}
        </div>

        {/* Right: event log */}
        <div className="lg:col-span-2">
          <div className="bg-card border border-border rounded h-full flex flex-col">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border">
              <span className="text-xs font-medium">Log de eventos</span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground font-mono">{events.length} entradas</span>
                <button
                  onClick={() => setEvents([])}
                  className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  limpar
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1 min-h-[320px] max-h-[480px] font-mono text-[11px]">
              {events.length === 0 ? (
                <div className="text-center text-muted-foreground/40 py-8 text-xs">
                  Selecione e reproduza um vídeo para ver os eventos
                </div>
              ) : (
                events.map((e) => (
                  <div
                    key={e.id}
                    className={cn(
                      "flex gap-2 py-0.5 px-1.5 rounded text-[11px] leading-relaxed",
                      e.type === "error" && "bg-red-500/10 text-red-400",
                      e.type === "warn" && "bg-amber-500/10 text-amber-400",
                      e.type === "success" && "bg-emerald-500/10 text-emerald-400",
                      e.type === "refresh" && "bg-purple-500/10 text-purple-400 font-semibold",
                      e.type === "info" && "text-muted-foreground"
                    )}
                  >
                    <span className="shrink-0 text-muted-foreground/60">{e.time}</span>
                    <span>{e.message}</span>
                  </div>
                ))
              )}
            </div>

            {/* Legend */}
            <div className="border-t border-border px-3 py-2 flex flex-wrap gap-x-3 gap-y-1">
              <span className="text-[10px] text-emerald-400">● player OK</span>
              <span className="text-[10px] text-amber-400">● aviso</span>
              <span className="text-[10px] text-red-400">● erro</span>
              <span className="text-[10px] text-purple-400">● URL renovada</span>
              <span className="text-[10px] text-muted-foreground">● proxy hit</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent accesses table */}
      {stats && stats.recent_accesses.length > 0 && (
        <div className="bg-card border border-border rounded">
          <div className="px-3 py-2 border-b border-border text-xs font-medium">Acessos recentes ao proxy</div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] font-mono">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left px-3 py-1.5">#</th>
                  <th className="text-left px-3 py-1.5">IP</th>
                  <th className="text-left px-3 py-1.5">Bytes</th>
                  <th className="text-left px-3 py-1.5">Horário</th>
                </tr>
              </thead>
              <tbody>
                {stats.recent_accesses.map((a, i) => (
                  <tr key={a.id} className="border-b border-border/40 last:border-0 hover:bg-secondary/20">
                    <td className="px-3 py-1.5 text-muted-foreground/60">{i + 1}</td>
                    <td className="px-3 py-1.5">{a.ip ?? "—"}</td>
                    <td className="px-3 py-1.5">{a.bytes ?? "—"}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">
                      {new Date(a.accessed_at).toLocaleString("pt-BR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

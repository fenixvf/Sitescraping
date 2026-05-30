import { useState } from "react";
import { Eye, EyeOff, Copy, Check, RefreshCw, Globe, Clock, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const API_KEY = import.meta.env.VITE_API_KEY ?? "(configured server-side)";

function MaskedKey({ value }: { value: string }) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const display = revealed
    ? value
    : value.substring(0, 4) + "•".repeat(Math.max(0, value.length - 8)) + value.substring(value.length - 4);

  return (
    <div className="flex items-center gap-2 bg-secondary/50 rounded px-3 py-2 font-mono text-xs">
      <span className="flex-1 truncate" data-testid="text-api-key">{display}</span>
      <button
        data-testid="button-toggle-key-reveal"
        onClick={() => setRevealed((v) => !v)}
        className="text-muted-foreground hover:text-foreground transition-colors"
      >
        {revealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
      </button>
      <button
        data-testid="button-copy-api-key"
        onClick={() => {
          navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="text-muted-foreground hover:text-foreground transition-colors"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border/50 last:border-0">
      <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
      <span className="text-sm text-muted-foreground w-40 shrink-0">{label}</span>
      <span className="font-mono text-xs">{value}</span>
    </div>
  );
}

export default function Settings() {
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Platform configuration and API reference</p>
      </div>

      {/* API Key */}
      <div className="bg-card border border-border rounded p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-medium">API Authentication</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          All API endpoints require a Bearer token. Pass your API key in the{" "}
          <code className="font-mono bg-secondary px-1 py-0.5 rounded text-[10px]">Authorization</code> header.
        </p>

        <div className="space-y-1.5">
          <div className="text-xs text-muted-foreground">API Key</div>
          <MaskedKey value={API_KEY} />
        </div>

        <div className="bg-secondary/30 rounded p-3">
          <div className="text-[10px] text-muted-foreground mb-1.5">Example request</div>
          <pre className="font-mono text-[10px] text-foreground overflow-x-auto whitespace-pre-wrap break-all">
{`curl -H "Authorization: Bearer $API_KEY" \\
  https://your-domain.com/api/videos`}
          </pre>
        </div>
      </div>

      {/* Proxy */}
      <div className="bg-card border border-border rounded p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-medium">Proxy Endpoint</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          The public proxy endpoint forwards requests to origin URLs. No API key required for playback.
        </p>
        <div className="space-y-2">
          <InfoRow icon={Globe} label="Endpoint pattern" value="GET /proxy/v/{slug}" />
          <InfoRow icon={RefreshCw} label="Redirect type" value="302 (temporary)" />
          <InfoRow icon={Globe} label="CORS" value="Enabled for all origins" />
        </div>

        <div className="mt-3 space-y-2">
          <div className="text-xs text-muted-foreground font-medium">Cache-Control by type</div>
          <div className="space-y-1.5 text-xs">
            {[
              { type: "cdn", value: "public, max-age=86400" },
              { type: "platform", value: "no-store" },
              { type: "storage", value: "public, max-age=3600" },
              { type: "selfhosted", value: "public, max-age=3600" },
            ].map(({ type, value }) => (
              <div key={type} className="flex items-center gap-3">
                <Badge className="text-[10px] font-mono uppercase w-20 justify-center bg-secondary border-0">
                  {type}
                </Badge>
                <code className="font-mono text-[10px] text-muted-foreground">{value}</code>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Sync config */}
      <div className="bg-card border border-border rounded p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-medium">Auto-Sync</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          The platform automatically validates all active and unknown links on a schedule.
        </p>
        <div className="space-y-0">
          <InfoRow icon={Clock} label="Interval" value="SYNC_INTERVAL env (default: 900s)" />
          <InfoRow icon={RefreshCw} label="Max redirects" value="MAX_REDIRECTS env (default: 5)" />
          <InfoRow icon={Clock} label="Timeout" value="TIMEOUT_MS env (default: 8000ms)" />
        </div>

        <div className="bg-secondary/30 rounded p-3 mt-2">
          <div className="text-[10px] text-muted-foreground mb-1.5">Trigger manual sync</div>
          <pre className="font-mono text-[10px] text-foreground overflow-x-auto whitespace-pre-wrap break-all">
{`curl -X POST \\
  -H "Authorization: Bearer $API_KEY" \\
  https://your-domain.com/api/sync`}
          </pre>
        </div>
      </div>

      {/* API Reference */}
      <div className="bg-card border border-border rounded p-4 space-y-3">
        <h2 className="text-sm font-medium">API Reference</h2>
        <div className="space-y-1.5">
          {[
            { method: "POST", path: "/api/videos", desc: "Register new video link" },
            { method: "GET", path: "/api/videos", desc: "List videos (page, limit, tag, status, source_type)" },
            { method: "GET", path: "/api/videos/{id}", desc: "Get video details" },
            { method: "PATCH", path: "/api/videos/{id}", desc: "Update video metadata" },
            { method: "DELETE", path: "/api/videos/{id}", desc: "Delete video" },
            { method: "GET", path: "/api/videos/{id}/stats", desc: "Access stats for a video" },
            { method: "POST", path: "/api/sync", desc: "Force re-validation of all active links" },
            { method: "GET", path: "/api/stats/summary", desc: "Dashboard totals" },
            { method: "GET", path: "/api/stats/by-type", desc: "Breakdown by source type" },
            { method: "GET", path: "/api/stats/recent-activity", desc: "Recent proxy and sync events" },
          ].map(({ method, path, desc }, i) => (
            <div key={`${method}-${path}-${i}`} className="flex items-center gap-2 py-1.5 border-b border-border/30 last:border-0 text-xs">
              <Badge
                className={cn_method(method)}
              >
                {method}
              </Badge>
              <code className="font-mono text-[10px] text-muted-foreground w-52 shrink-0">{path}</code>
              <span className="text-muted-foreground text-[10px]">{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function cn_method(method: string): string {
  const map: Record<string, string> = {
    GET: "bg-blue-500/20 text-blue-300 border-0 text-[9px] font-mono w-12 justify-center",
    POST: "bg-emerald-500/20 text-emerald-300 border-0 text-[9px] font-mono w-12 justify-center",
    PATCH: "bg-amber-500/20 text-amber-300 border-0 text-[9px] font-mono w-12 justify-center",
    DELETE: "bg-red-500/20 text-red-300 border-0 text-[9px] font-mono w-12 justify-center",
  };
  return map[method] ?? "bg-secondary text-foreground border-0 text-[9px] font-mono w-12 justify-center";
}

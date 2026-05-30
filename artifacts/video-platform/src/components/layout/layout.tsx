import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Video,
  Settings,
  Activity,
  RefreshCw,
  FolderOpen,
  Plus,
  X,
  Pencil,
  Trash2,
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useTriggerSync,
  useGetStatsSummary,
  useListFolders,
  useCreateFolder,
  useDeleteFolder,
  useUpdateFolder,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const FOLDER_COLORS = [
  "#3b82f6", "#8b5cf6", "#10b981", "#f59e0b",
  "#ef4444", "#06b6d4", "#ec4899", "#84cc16",
];

function ColorDot({ color, selected, onClick }: { color: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-6 h-6 rounded-full border-2 transition-transform",
        selected ? "border-white scale-110" : "border-transparent"
      )}
      style={{ backgroundColor: color }}
    />
  );
}

function FolderModal({
  open,
  onClose,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  initial?: { id: number; name: string; color: string } | null;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState(initial?.color ?? FOLDER_COLORS[0]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createFolder = useCreateFolder({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries();
        toast({ title: "Pasta criada" });
        onClose();
      },
    },
  });

  const updateFolder = useUpdateFolder({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries();
        toast({ title: "Pasta atualizada" });
        onClose();
      },
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (initial) {
      updateFolder.mutate({ id: initial.id, data: { name: name.trim(), color } });
    } else {
      createFolder.mutate({ data: { name: name.trim(), color } });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{initial ? "Editar pasta" : "Nova pasta"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <Input
            placeholder="Nome da pasta"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <div>
            <p className="text-xs text-muted-foreground mb-2">Cor</p>
            <div className="flex gap-2 flex-wrap">
              {FOLDER_COLORS.map((c) => (
                <ColorDot key={c} color={c} selected={color === c} onClick={() => setColor(c)} />
              ))}
            </div>
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={!name.trim() || createFolder.isPending || updateFolder.isPending}
          >
            {initial ? "Salvar" : "Criar pasta"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StatusDots() {
  const { data } = useGetStatsSummary();
  if (!data) return null;
  return (
    <div className="flex gap-1.5 items-center">
      {data.active > 0 && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
      {data.broken > 0 && <span className="w-1.5 h-1.5 rounded-full bg-red-400" />}
      {data.unknown > 0 && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
    </div>
  );
}

function SidebarContent({
  onNavClick,
  activeFolderId,
  setActiveFolderId,
}: {
  onNavClick?: () => void;
  activeFolderId: number | null;
  setActiveFolderId: (id: number | null) => void;
}) {
  const [location] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [folderModal, setFolderModal] = useState<{ open: boolean; edit?: { id: number; name: string; color: string } | null }>({ open: false });

  const { data: folders } = useListFolders();

  const sync = useTriggerSync({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries();
        toast({
          title: "Sync completo",
          description: `${data.synced} ok, ${data.failed} falhou de ${data.total}`,
        });
      },
      onError: () => toast({ title: "Sync falhou", variant: "destructive" }),
    },
  });

  const deleteFolder = useDeleteFolder({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries();
        if (activeFolderId !== null) setActiveFolderId(null);
        toast({ title: "Pasta removida" });
      },
    },
  });

  const navItems = [
    { path: "/", label: "Dashboard", icon: LayoutDashboard },
    { path: "/videos", label: "Vídeos", icon: Video },
    { path: "/settings", label: "Configurações", icon: Settings },
  ];

  return (
    <div className="flex flex-col h-full">
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
      <nav className="p-2 space-y-0.5">
        {navItems.map(({ path, label, icon: Icon }) => {
          const active = path === "/" ? location === "/" : location.startsWith(path);
          return (
            <Link key={path} href={path}>
              <div
                onClick={() => { setActiveFolderId(null); onNavClick?.(); }}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2.5 rounded text-sm transition-colors cursor-pointer",
                  active && activeFolderId === null
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

      {/* Folders */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="flex items-center justify-between px-3 py-1.5">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Pastas</span>
          <button
            onClick={() => setFolderModal({ open: true, edit: null })}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="space-y-0.5">
          {/* "All videos" shortcut */}
          <Link href="/videos">
            <div
              onClick={() => { setActiveFolderId(null); onNavClick?.(); }}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded text-sm transition-colors cursor-pointer group",
                location.startsWith("/videos") && activeFolderId === null
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              )}
            >
              <FolderOpen className="w-3.5 h-3.5 shrink-0" />
              <span className="flex-1 text-xs truncate">Todos os vídeos</span>
            </div>
          </Link>

          {folders?.map((folder) => (
            <Link key={folder.id} href="/videos">
              <div
                onClick={() => { setActiveFolderId(folder.id); onNavClick?.(); }}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded text-sm transition-colors cursor-pointer group",
                  activeFolderId === folder.id
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                )}
              >
                <span
                  className="w-3 h-3 rounded-sm shrink-0"
                  style={{ backgroundColor: folder.color }}
                />
                <span className="flex-1 text-xs truncate">{folder.name}</span>
                <span className="text-[10px] text-muted-foreground/60">{folder.video_count}</span>
                <span className="hidden group-hover:flex items-center gap-0.5 ml-1">
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setFolderModal({ open: true, edit: folder }); }}
                    className="p-0.5 hover:text-foreground"
                  >
                    <Pencil className="w-2.5 h-2.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.preventDefault(); e.stopPropagation();
                      if (confirm(`Remover pasta "${folder.name}"?`)) {
                        deleteFolder.mutate({ id: folder.id });
                      }
                    }}
                    className="p-0.5 hover:text-red-400"
                  >
                    <Trash2 className="w-2.5 h-2.5" />
                  </button>
                </span>
              </div>
            </Link>
          ))}

          {folders?.length === 0 && (
            <p className="text-[11px] text-muted-foreground/50 px-3 py-2">
              Nenhuma pasta ainda
            </p>
          )}
        </div>
      </div>

      {/* Sync button */}
      <div className="p-3 border-t border-border">
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-2 text-xs"
          onClick={() => sync.mutate()}
          disabled={sync.isPending}
        >
          <RefreshCw className={cn("w-3 h-3", sync.isPending && "animate-spin")} />
          {sync.isPending ? "Sincronizando..." : "Sync All"}
        </Button>
      </div>

      <FolderModal
        open={folderModal.open}
        onClose={() => setFolderModal({ open: false })}
        initial={folderModal.edit}
      />
    </div>
  );
}

export type LayoutContext = {
  activeFolderId: number | null;
  setActiveFolderId: (id: number | null) => void;
};

import { createContext, useContext } from "react";
export const FolderContext = createContext<LayoutContext>({
  activeFolderId: null,
  setActiveFolderId: () => {},
});
export const useFolderContext = () => useContext(FolderContext);

export function Layout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeFolderId, setActiveFolderId] = useState<number | null>(null);

  return (
    <FolderContext.Provider value={{ activeFolderId, setActiveFolderId }}>
      <div className="flex min-h-screen bg-background text-foreground">
        {/* Desktop sidebar */}
        <aside className="hidden md:flex w-56 shrink-0 border-r border-border flex-col">
          <SidebarContent activeFolderId={activeFolderId} setActiveFolderId={setActiveFolderId} />
        </aside>

        {/* Mobile overlay sidebar */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div className="absolute inset-0 bg-black/60" onClick={() => setSidebarOpen(false)} />
            <aside className="absolute left-0 top-0 bottom-0 w-64 bg-background border-r border-border flex flex-col">
              <div className="flex items-center justify-end p-2 border-b border-border">
                <button onClick={() => setSidebarOpen(false)} className="p-2 text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <SidebarContent
                  onNavClick={() => setSidebarOpen(false)}
                  activeFolderId={activeFolderId}
                  setActiveFolderId={setActiveFolderId}
                />
              </div>
            </aside>
          </div>
        )}

        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Mobile top bar */}
          <header className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-border bg-background sticky top-0 z-40">
            <button onClick={() => setSidebarOpen(true)} className="text-muted-foreground hover:text-foreground">
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-primary flex items-center justify-center">
                <Activity className="w-3.5 h-3.5 text-primary-foreground" />
              </div>
              <span className="text-sm font-semibold">VidProxy</span>
            </div>
          </header>

          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      </div>
    </FolderContext.Provider>
  );
}

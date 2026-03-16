import { Card, CardContent, CardFooter, CardHeader, CardMedia } from "@ui/Card";
import { DropdownMenu, DropdownMenuItem } from "@ui/DropdownMenu";
import { IconButton } from "@ui/IconButton";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { memo, useCallback, useState } from "react";

interface GraphCardProps {
  name: string;
  nodeCount: number;
  updatedAt: string;
  onClick: () => void;
  onDelete: () => void;
  onRename: () => void;
}

function GraphCardComponent({
  name,
  nodeCount,
  updatedAt,
  onClick,
  onDelete,
  onRename,
}: GraphCardProps) {
  const timeAgo = formatTimeAgo(updatedAt);
  const [menuOpen, setMenuOpen] = useState(false);

  const handleMenuToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen((prev) => !prev);
  }, []);

  const handleDelete = useCallback(() => {
    setMenuOpen(false);
    onDelete();
  }, [onDelete]);

  const handleRename = useCallback(() => {
    setMenuOpen(false);
    onRename();
  }, [onRename]);

  const handleMenuClose = useCallback(() => setMenuOpen(false), []);

  return (
    <Card interactive onClick={onClick}>
      <CardHeader>
        {/* Spacer so the menu stays right-aligned */}
        <span />
        <div
          className={`relative transition-opacity ${menuOpen ? "opacity-100" : "opacity-0 group-hover/card:opacity-100"}`}
        >
          <IconButton onClick={handleMenuToggle} aria-label="Graph options">
            <MoreHorizontal size={14} />
          </IconButton>
          <DropdownMenu open={menuOpen} onClose={handleMenuClose}>
            <DropdownMenuItem onClick={handleRename}>
              <Pencil size={14} />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleDelete}>
              <Trash2 size={14} />
              Delete
            </DropdownMenuItem>
          </DropdownMenu>
        </div>
      </CardHeader>

      <CardMedia>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-emerald-500/60" />
          {middleDots(nodeCount)}
          <div className="h-3 w-3 rounded-full bg-red-500/60" />
        </div>
      </CardMedia>

      <CardContent className="pt-0">
        <h3 className="truncate text-sm font-medium text-zinc-100">{name}</h3>
      </CardContent>

      <CardFooter>
        <span>{nodeCount} nodes</span>
        <span className="mx-1">&middot;</span>
        <span>{timeAgo}</span>
      </CardFooter>
    </Card>
  );
}

export const GraphCard = memo(GraphCardComponent);

const DOT_KEYS = ["dot-a", "dot-b", "dot-c"];
function middleDots(nodeCount: number) {
  const count = Math.min(Math.max(nodeCount - 2, 0), 3);
  return DOT_KEYS.slice(0, count).map((key) => (
    <div key={key} className="h-3 w-3 rounded-full bg-indigo-500/60" />
  ));
}

/** Simple relative time formatting. */
function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

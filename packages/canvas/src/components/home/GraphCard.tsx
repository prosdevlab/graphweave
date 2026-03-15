import { Card, CardContent, CardFooter } from "@ui/Card";
import { memo } from "react";

interface GraphCardProps {
  name: string;
  nodeCount: number;
  updatedAt: string;
  onClick: () => void;
}

function GraphCardComponent({
  name,
  nodeCount,
  updatedAt,
  onClick,
}: GraphCardProps) {
  const timeAgo = formatTimeAgo(updatedAt);

  return (
    <Card interactive onClick={onClick}>
      <CardContent>
        <div className="mb-3 flex h-12 items-center justify-center gap-2">
          <div className="h-3 w-3 rounded-full bg-emerald-500/60" />
          {middleDots(nodeCount)}
          <div className="h-3 w-3 rounded-full bg-red-500/60" />
        </div>
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
    <div key={key} className="h-3 w-3 rounded-full bg-blue-500/60" />
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

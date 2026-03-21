import { ChevronDown, ChevronRight } from "lucide-react";
import { memo, useCallback, useState } from "react";

interface JsonTreeProps {
  data: unknown;
  label?: string;
  badge?: "new" | "modified" | "removed" | "unchanged" | null;
  defaultExpanded?: boolean;
}

const BADGE_STYLES: Record<string, string> = {
  new: "bg-emerald-500/20 text-emerald-400",
  modified: "bg-amber-500/20 text-amber-400",
  removed: "bg-red-500/20 text-red-400",
  unchanged: "bg-zinc-700/30 text-zinc-500",
};

const BADGE_LABEL: Record<string, string> = {
  new: "NEW",
  modified: "~",
  removed: "-",
  unchanged: "=",
};

function JsonTreeNode({
  data,
  label,
  badge,
  defaultExpanded = false,
}: JsonTreeProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const toggle = useCallback(() => setExpanded((e) => !e), []);

  if (data === null || data === undefined) {
    return (
      <Row label={label} badge={badge}>
        <span className="text-zinc-500">null</span>
      </Row>
    );
  }

  if (typeof data === "string") {
    const truncated = data.length > 120 ? `${data.slice(0, 120)}...` : data;
    return (
      <Row label={label} badge={badge}>
        <span className="text-emerald-300">&quot;{truncated}&quot;</span>
      </Row>
    );
  }

  if (typeof data === "number" || typeof data === "boolean") {
    return (
      <Row label={label} badge={badge}>
        <span className="text-amber-300">{String(data)}</span>
      </Row>
    );
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      return (
        <Row label={label} badge={badge}>
          <span className="text-zinc-500">[]</span>
        </Row>
      );
    }
    return (
      <Expandable
        label={label}
        badge={badge}
        summary={`Array(${data.length})`}
        expanded={expanded}
        onToggle={toggle}
      >
        {data.map((item, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: JSON tree indices are stable
          <JsonTreeNode key={i} data={item} label={String(i)} />
        ))}
      </Expandable>
    );
  }

  if (typeof data === "object") {
    const entries = Object.entries(data as Record<string, unknown>);
    if (entries.length === 0) {
      return (
        <Row label={label} badge={badge}>
          <span className="text-zinc-500">{"{}"}</span>
        </Row>
      );
    }
    return (
      <Expandable
        label={label}
        badge={badge}
        summary={`{${entries.length} keys}`}
        expanded={expanded}
        onToggle={toggle}
      >
        {entries.map(([key, val]) => (
          <JsonTreeNode key={key} data={val} label={key} />
        ))}
      </Expandable>
    );
  }

  return (
    <Row label={label} badge={badge}>
      <span className="text-zinc-400">{String(data)}</span>
    </Row>
  );
}

function Row({
  label,
  badge,
  children,
}: {
  label?: string;
  badge?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-1.5 py-0.5 pl-4 font-mono text-[11px]">
      {label != null && <span className="text-zinc-400">{label}:</span>}
      {children}
      {badge && (
        <span
          className={`ml-1 rounded px-1 text-[9px] font-semibold ${BADGE_STYLES[badge] ?? ""}`}
        >
          {BADGE_LABEL[badge] ?? badge}
        </span>
      )}
    </div>
  );
}

function Expandable({
  label,
  badge,
  summary,
  expanded,
  onToggle,
  children,
}: {
  label?: string;
  badge?: string | null;
  summary: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const Icon = expanded ? ChevronDown : ChevronRight;
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full cursor-pointer items-baseline gap-1 py-0.5 pl-1 font-mono text-[11px] hover:bg-zinc-800/50"
      >
        <Icon size={10} className="shrink-0 text-zinc-500" />
        {label != null && <span className="text-zinc-400">{label}:</span>}
        <span className="text-zinc-500">{summary}</span>
        {badge && (
          <span
            className={`ml-1 rounded px-1 text-[9px] font-semibold ${BADGE_STYLES[badge] ?? ""}`}
          >
            {BADGE_LABEL[badge] ?? badge}
          </span>
        )}
      </button>
      {expanded && <div className="pl-3">{children}</div>}
    </div>
  );
}

export const JsonTree = memo(JsonTreeNode);

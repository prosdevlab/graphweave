/**
 * Design tokens for GraphWeave canvas.
 *
 * Minimal set — just enough to keep brand colors, node accents,
 * and semantic colors in one place. Not a full design system.
 *
 * Usage: import { tokens } from "@styles/tokens"
 * These are Tailwind class fragments, not CSS variables.
 */

export const tokens = {
  /** Brand primary — indigo for creative intelligence */
  brand: {
    bg: "bg-indigo-600",
    bgHover: "hover:bg-indigo-700",
    bgActive: "active:bg-indigo-800",
    text: "text-indigo-500",
    textLight: "text-indigo-400",
    border: "border-indigo-500",
    ring: "ring-indigo-500",
    focusBorder: "focus:border-indigo-500",
    focusRing: "focus:ring-indigo-500",
  },

  /** Node type accents — semantic colors */
  node: {
    start: {
      border: "border-emerald-500",
      text: "text-emerald-400",
      bg: "bg-emerald-500/60",
      css: "gw-node-start",
    },
    llm: {
      border: "border-indigo-500",
      text: "text-indigo-400",
      bg: "bg-indigo-500/60",
      css: "gw-node-llm",
    },
    end: {
      border: "border-red-500",
      text: "text-red-400",
      bg: "bg-red-500/60",
      css: "gw-node-end",
    },
  },

  /** Surface colors — dark theme zinc palette */
  surface: {
    base: "bg-zinc-950",
    raised: "bg-zinc-900",
    overlay: "bg-zinc-800",
    border: "border-zinc-800",
    borderLight: "border-zinc-700",
    text: "text-zinc-100",
    textMuted: "text-zinc-400",
    textFaint: "text-zinc-500",
  },

  /** Semantic feedback */
  feedback: {
    error: "text-red-400",
    warning: "text-amber-400",
    success: "text-emerald-400",
  },
} as const;

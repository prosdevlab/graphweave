import type { LucideIcon } from "lucide-react";
import { Brain, Play, Square } from "lucide-react";

export interface ToolbarItem {
  type: string;
  label: string;
  description: string;
  icon: LucideIcon;
  accentBorder: string;
  iconColor: string;
  accentBg: string;
}

export const TOOLBAR_ITEMS: ToolbarItem[] = [
  {
    type: "start",
    label: "Start",
    description: "Entry point of the graph",
    icon: Play,
    accentBorder: "border-l-emerald-500",
    iconColor: "text-emerald-400",
    accentBg: "bg-emerald-500/20",
  },
  {
    type: "llm",
    label: "LLM",
    description: "Call an AI model with a prompt",
    icon: Brain,
    accentBorder: "border-l-indigo-500",
    iconColor: "text-indigo-400",
    accentBg: "bg-indigo-500/20",
  },
  {
    type: "end",
    label: "End",
    description: "Exit point of the graph",
    icon: Square,
    accentBorder: "border-l-red-500",
    iconColor: "text-red-400",
    accentBg: "bg-red-500/20",
  },
];

import { X } from "lucide-react";
import { memo, useCallback, useEffect, useState } from "react";
import { IconButton } from "./IconButton";

type ToastVariant = "error" | "success" | "info";

interface ToastProps {
  message: string;
  variant?: ToastVariant;
  duration?: number;
  onDismiss: () => void;
}

const variantClasses: Record<ToastVariant, string> = {
  error: "border-red-500/30 bg-red-950/90 text-red-200",
  success: "border-emerald-500/30 bg-emerald-950/90 text-emerald-200",
  info: "border-zinc-600 bg-zinc-800/90 text-zinc-200",
};

function ToastComponent({
  message,
  variant = "error",
  duration = 5000,
  onDismiss,
}: ToastProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Trigger enter animation
    requestAnimationFrame(() => setVisible(true));

    if (duration > 0) {
      const timer = setTimeout(() => {
        setVisible(false);
        setTimeout(onDismiss, 200); // Wait for exit animation
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onDismiss]);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    setTimeout(onDismiss, 200);
  }, [onDismiss]);

  return (
    <div
      className={`fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg backdrop-blur-sm transition-all duration-200 ${variantClasses[variant]} ${visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}
      role="alert"
    >
      <span>{message}</span>
      <IconButton onClick={handleDismiss} aria-label="Dismiss">
        <X size={14} />
      </IconButton>
    </div>
  );
}

export const Toast = memo(ToastComponent);

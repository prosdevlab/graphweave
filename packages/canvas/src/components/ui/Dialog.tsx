import { X } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function Dialog({ open, onClose, title, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-900 p-0 text-zinc-100 shadow-xl backdrop:bg-black/50"
    >
      <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
        <h2 className="text-sm font-semibold">{title}</h2>
        <button
          onClick={onClose}
          className="text-zinc-500 hover:text-zinc-300"
          aria-label="Close"
          type="button"
        >
          <X size={16} />
        </button>
      </div>
      <div className="px-6 py-4">{children}</div>
    </dialog>
  );
}

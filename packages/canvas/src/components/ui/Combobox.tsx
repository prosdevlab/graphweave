import { ChevronDown } from "lucide-react";
import { type ChangeEvent, useMemo, useRef, useState } from "react";
import { Command, CommandEmpty, CommandItem, CommandList } from "./Command";
import { Popover, PopoverAnchor, PopoverContent } from "./Popover";

export interface ComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
}

export function Combobox({
  value,
  onChange,
  options,
  placeholder,
  className = "",
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    if (!value) return options;
    const lower = value.toLowerCase();
    return options.filter((o) => o.toLowerCase().includes(lower));
  }, [value, options]);

  if (options.length === 0) {
    return (
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 ${className}`}
      />
    );
  }

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
    if (!open) setOpen(true);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div
          className={`relative flex items-center rounded-md border border-zinc-700 bg-zinc-900 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 ${className}`}
        >
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={handleInputChange}
            placeholder={placeholder}
            onFocus={() => setOpen(true)}
            className="w-full bg-transparent px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none"
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={() => {
              setOpen(!open);
              inputRef.current?.focus();
            }}
            className="flex-shrink-0 px-2 text-zinc-500 hover:text-zinc-300"
            aria-label="Toggle suggestions"
          >
            <ChevronDown size={14} />
          </button>
        </div>
      </PopoverAnchor>
      <PopoverContent
        onOpenAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={() => setOpen(false)}
      >
        <Command shouldFilter={false}>
          <CommandList>
            {filtered.length === 0 ? (
              <CommandEmpty>No suggestions</CommandEmpty>
            ) : (
              filtered.map((option) => (
                <CommandItem
                  key={option}
                  value={option}
                  onSelect={(val) => {
                    onChange(val);
                    setOpen(false);
                    inputRef.current?.focus();
                  }}
                >
                  {option}
                </CommandItem>
              ))
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

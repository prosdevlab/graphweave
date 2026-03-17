import { Command as CommandPrimitive } from "cmdk";
import { type ComponentPropsWithoutRef, forwardRef } from "react";

export const Command = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className = "", ...props }, ref) => (
  <CommandPrimitive
    ref={ref}
    className={`flex flex-col overflow-hidden ${className}`}
    {...props}
  />
));
Command.displayName = "Command";

export const CommandInput = forwardRef<
  HTMLInputElement,
  ComponentPropsWithoutRef<typeof CommandPrimitive.Input>
>(({ className = "", ...props }, ref) => (
  <CommandPrimitive.Input
    ref={ref}
    className={`w-full bg-transparent px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none ${className}`}
    {...props}
  />
));
CommandInput.displayName = "CommandInput";

export const CommandList = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className = "", ...props }, ref) => (
  <CommandPrimitive.List
    ref={ref}
    className={`max-h-40 overflow-y-auto ${className}`}
    {...props}
  />
));
CommandList.displayName = "CommandList";

export const CommandEmpty = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>((props, ref) => (
  <CommandPrimitive.Empty
    ref={ref}
    className="px-3 py-2 text-xs text-zinc-500"
    {...props}
  />
));
CommandEmpty.displayName = "CommandEmpty";

export const CommandItem = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(({ className = "", ...props }, ref) => (
  <CommandPrimitive.Item
    ref={ref}
    className={`cursor-pointer px-3 py-1.5 text-sm text-zinc-300 aria-selected:bg-zinc-800 aria-selected:text-zinc-100 ${className}`}
    {...props}
  />
));
CommandItem.displayName = "CommandItem";

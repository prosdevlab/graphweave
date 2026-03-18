import type { StateField } from "@shared/schema";
import { Button } from "@ui/Button";
import { Input } from "@ui/Input";
import { Select } from "@ui/Select";
import { Plus } from "lucide-react";
import { type FormEvent, useCallback, useState } from "react";

const KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

const TYPE_OPTIONS: StateField["type"][] = [
  "string",
  "number",
  "boolean",
  "list",
  "object",
];

const REDUCER_OPTIONS: { value: StateField["reducer"]; label: string }[] = [
  { value: "replace", label: "Replace (keep latest)" },
  { value: "append", label: "Append (add to list)" },
  { value: "merge", label: "Merge (combine objects)" },
];

interface AddFieldFormProps {
  existingKeys: Set<string>;
  onAdd: (field: StateField) => void;
}

export function AddFieldForm({ existingKeys, onAdd }: AddFieldFormProps) {
  const [key, setKey] = useState("");
  const [type, setType] = useState<StateField["type"]>("string");
  const [reducer, setReducer] = useState<StateField["reducer"]>("replace");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const trimmed = key.trim();
      if (!trimmed) {
        setError("Field key is required");
        return;
      }
      if (!KEY_PATTERN.test(trimmed)) {
        setError("Use lowercase letters, numbers, and underscores");
        return;
      }
      if (existingKeys.has(trimmed)) {
        setError("Field already exists");
        return;
      }
      onAdd({ key: trimmed, type, reducer });
      setKey("");
      setType("string");
      setReducer("replace");
      setError(null);
    },
    [key, type, reducer, existingKeys, onAdd],
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex gap-1.5">
        <Input
          value={key}
          onChange={(e) => {
            setKey(e.target.value);
            setError(null);
          }}
          placeholder="field_name"
          className="flex-1"
        />
      </div>
      <div className="flex gap-1.5">
        <Select
          value={type}
          onChange={(e) => setType(e.target.value as StateField["type"])}
          className="flex-1"
          aria-label="Field type"
        >
          {TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
        <Select
          value={reducer}
          onChange={(e) => setReducer(e.target.value as StateField["reducer"])}
          className="flex-1"
          aria-label="When updated"
        >
          {REDUCER_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </Select>
      </div>
      {error && <p className="text-[10px] text-red-400">{error}</p>}
      <Button type="submit" variant="ghost" className="w-full text-xs">
        <Plus size={12} className="mr-1" />
        Add field
      </Button>
    </form>
  );
}

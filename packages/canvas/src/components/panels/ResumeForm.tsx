import { Button } from "@ui/Button";
import { Input } from "@ui/Input";
import { useState } from "react";

interface ResumeFormProps {
  prompt: string;
  onSubmit: (input: unknown) => void;
}

export function ResumeForm({ prompt, onSubmit }: ResumeFormProps) {
  const [value, setValue] = useState("");

  return (
    <div className="border-t border-zinc-700 pt-3">
      <p className="mb-2 text-sm text-zinc-300">{prompt}</p>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Type your response..."
          className="flex-1"
        />
        <Button
          variant="primary"
          onClick={() => onSubmit(value)}
          disabled={!value.trim()}
        >
          Resume
        </Button>
      </div>
    </div>
  );
}

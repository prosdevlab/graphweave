import type {
  ConditionConfig,
  ConditionNode,
  NodeSchema,
} from "@shared/schema";
import type { EdgeSchema } from "@shared/schema";
import { useGraphStore } from "@store/graphSlice";
import { Input } from "@ui/Input";
import { Select } from "@ui/Select";
import { Textarea } from "@ui/Textarea";
import { type ChangeEvent, memo, useCallback, useMemo } from "react";
import { ConditionBranchEditor } from "./ConditionBranchEditor";

const CONDITION_TYPES = [
  "field_equals",
  "field_contains",
  "field_exists",
  "llm_router",
  "tool_error",
  "iteration_limit",
] as const;

const CONDITION_CONFIG_DEFAULTS: Record<string, ConditionConfig> = {
  field_equals: { type: "field_equals", field: "", value: "", branch: "yes" },
  field_contains: {
    type: "field_contains",
    field: "",
    value: "",
    branch: "yes",
  },
  field_exists: { type: "field_exists", field: "", branch: "yes" },
  llm_router: { type: "llm_router", prompt: "", options: [] },
  tool_error: { type: "tool_error", on_error: "error", on_success: "success" },
  iteration_limit: {
    type: "iteration_limit",
    field: "",
    max: 5,
    exceeded: "exceeded",
    continue: "continue",
  },
};

const EXHAUSTIVE_TYPES = new Set(["tool_error", "iteration_limit"]);

interface ConditionNodeConfigProps {
  node: ConditionNode;
  onChange: (updates: {
    label?: string;
    config?: Partial<ConditionNode["config"]>;
  }) => void;
}

function ConditionNodeConfigComponent({
  node,
  onChange,
}: ConditionNodeConfigProps) {
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);

  const outgoingEdges: EdgeSchema[] = useMemo(
    () => edges.filter((e) => e.source === node.id),
    [edges, node.id],
  );

  const branchOptions = useMemo(
    () =>
      outgoingEdges
        .map((e) => e.condition_branch)
        .filter((b): b is string => !!b),
    [outgoingEdges],
  );

  const conditionType = node.config.condition.type;
  const isExhaustive = EXHAUSTIVE_TYPES.has(conditionType);

  const handleLabelChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      onChange({ label: e.target.value });
    },
    [onChange],
  );

  const handleTypeChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      const newType = e.target.value;
      onChange({
        config: {
          condition: CONDITION_CONFIG_DEFAULTS[newType] as ConditionConfig,
          // preserve branches and default_branch — edge-derived
        },
      });
    },
    [onChange],
  );

  const handleConditionField = useCallback(
    (field: string, value: string | number | string[]) => {
      onChange({
        config: {
          condition: {
            ...node.config.condition,
            [field]: value,
          } as ConditionConfig,
        },
      });
    },
    [onChange, node.config.condition],
  );

  const handleDefaultBranchChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      onChange({ config: { default_branch: e.target.value } });
    },
    [onChange],
  );

  const cond = node.config.condition;

  return (
    <div className="space-y-4">
      <div>
        <label
          htmlFor="node-label"
          className="mb-1 block text-xs font-medium text-zinc-400"
        >
          Label
        </label>
        <Input
          id="node-label"
          value={node.label}
          onChange={handleLabelChange}
          placeholder="Condition"
        />
      </div>

      <div>
        <label
          htmlFor="node-condition-type"
          className="mb-1 block text-xs font-medium text-zinc-400"
        >
          Condition Type
        </label>
        <Select
          id="node-condition-type"
          value={conditionType}
          onChange={handleTypeChange}
        >
          {CONDITION_TYPES.map((t) => (
            <option key={t} value={t}>
              {t.replace(/_/g, " ")}
            </option>
          ))}
        </Select>
      </div>

      {/* field_equals / field_contains / field_exists */}
      {(cond.type === "field_equals" ||
        cond.type === "field_contains" ||
        cond.type === "field_exists") && (
        <>
          <div>
            <label
              htmlFor="cond-field"
              className="mb-1 block text-xs font-medium text-zinc-400"
            >
              Field
            </label>
            <Input
              id="cond-field"
              value={cond.field}
              onChange={(e) => handleConditionField("field", e.target.value)}
              placeholder="state_field"
            />
          </div>
          {(cond.type === "field_equals" || cond.type === "field_contains") && (
            <div>
              <label
                htmlFor="cond-value"
                className="mb-1 block text-xs font-medium text-zinc-400"
              >
                {cond.type === "field_contains" ? "Contains" : "Value"}
              </label>
              <Input
                id="cond-value"
                value={cond.value}
                onChange={(e) => handleConditionField("value", e.target.value)}
                placeholder="expected value"
              />
            </div>
          )}
          <div>
            <label
              htmlFor="cond-branch"
              className="mb-1 block text-xs font-medium text-zinc-400"
            >
              Match Branch
            </label>
            <Input
              id="cond-branch"
              value={cond.branch}
              onChange={(e) => handleConditionField("branch", e.target.value)}
              placeholder="yes"
            />
          </div>
        </>
      )}

      {/* llm_router */}
      {cond.type === "llm_router" && (
        <>
          <div>
            <label
              htmlFor="cond-prompt"
              className="mb-1 block text-xs font-medium text-zinc-400"
            >
              Prompt
            </label>
            <Textarea
              id="cond-prompt"
              value={cond.prompt}
              onChange={(e) => handleConditionField("prompt", e.target.value)}
              rows={3}
              placeholder="Classify the user's intent..."
            />
          </div>
          <div>
            <label
              htmlFor="cond-options"
              className="mb-1 block text-xs font-medium text-zinc-400"
            >
              Options (comma-separated)
            </label>
            <Input
              id="cond-options"
              value={cond.options.join(", ")}
              onChange={(e) =>
                handleConditionField(
                  "options",
                  e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                )
              }
              placeholder="positive, negative, neutral"
            />
          </div>
          <div>
            <label
              htmlFor="cond-routing-model"
              className="mb-1 block text-xs font-medium text-zinc-400"
            >
              Routing Model (optional)
            </label>
            <Input
              id="cond-routing-model"
              value={cond.routing_model ?? ""}
              onChange={(e) =>
                handleConditionField("routing_model", e.target.value)
              }
              placeholder="gpt-4o-mini"
            />
          </div>
        </>
      )}

      {/* tool_error */}
      {cond.type === "tool_error" && (
        <>
          <div>
            <label
              htmlFor="cond-on-error"
              className="mb-1 block text-xs font-medium text-zinc-400"
            >
              On Error Branch
            </label>
            <Input
              id="cond-on-error"
              value={cond.on_error}
              onChange={(e) => handleConditionField("on_error", e.target.value)}
              placeholder="error"
            />
          </div>
          <div>
            <label
              htmlFor="cond-on-success"
              className="mb-1 block text-xs font-medium text-zinc-400"
            >
              On Success Branch
            </label>
            <Input
              id="cond-on-success"
              value={cond.on_success}
              onChange={(e) =>
                handleConditionField("on_success", e.target.value)
              }
              placeholder="success"
            />
          </div>
          <p className="text-xs text-zinc-500">
            This condition always matches exactly one of the two branches.
          </p>
        </>
      )}

      {/* iteration_limit */}
      {cond.type === "iteration_limit" && (
        <>
          <div>
            <label
              htmlFor="cond-iter-field"
              className="mb-1 block text-xs font-medium text-zinc-400"
            >
              Counter Field
            </label>
            <Input
              id="cond-iter-field"
              value={cond.field}
              onChange={(e) => handleConditionField("field", e.target.value)}
              placeholder="iteration_count"
            />
          </div>
          <div>
            <label
              htmlFor="cond-max"
              className="mb-1 block text-xs font-medium text-zinc-400"
            >
              Max Iterations
            </label>
            <Input
              id="cond-max"
              type="number"
              value={cond.max}
              onChange={(e) =>
                handleConditionField(
                  "max",
                  Number.parseInt(e.target.value, 10) || 1,
                )
              }
              min={1}
            />
          </div>
          <div>
            <label
              htmlFor="cond-exceeded"
              className="mb-1 block text-xs font-medium text-zinc-400"
            >
              Exceeded Branch
            </label>
            <Input
              id="cond-exceeded"
              value={cond.exceeded}
              onChange={(e) => handleConditionField("exceeded", e.target.value)}
              placeholder="exceeded"
            />
          </div>
          <div>
            <label
              htmlFor="cond-continue"
              className="mb-1 block text-xs font-medium text-zinc-400"
            >
              Continue Branch
            </label>
            <Input
              id="cond-continue"
              value={cond.continue}
              onChange={(e) => handleConditionField("continue", e.target.value)}
              placeholder="continue"
            />
          </div>
          <p className="text-xs text-zinc-500">
            This condition always matches exactly one of the two branches.
          </p>
        </>
      )}

      {/* Default Branch — hidden for exhaustive types */}
      {!isExhaustive && (
        <div>
          <label
            htmlFor="cond-default-branch"
            className="mb-1 block text-xs font-medium text-zinc-400"
          >
            Default Branch (when condition fails)
          </label>
          <Select
            id="cond-default-branch"
            value={node.config.default_branch}
            onChange={handleDefaultBranchChange}
          >
            <option value="">Select branch…</option>
            {branchOptions.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </Select>
        </div>
      )}

      {/* Outgoing Branches */}
      <div>
        <p className="mb-2 text-xs font-medium text-zinc-400">
          Outgoing Branches
        </p>
        <ConditionBranchEditor
          nodeId={node.id}
          nodes={nodes as NodeSchema[]}
          edges={edges}
        />
      </div>
    </div>
  );
}

export const ConditionNodeConfig = memo(ConditionNodeConfigComponent);

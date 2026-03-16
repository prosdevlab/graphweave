import {
  type ConnectionLineComponentProps,
  getBezierPath,
} from "@xyflow/react";

export function SnapConnectionLine({
  fromX,
  fromY,
  toX,
  toY,
  fromPosition,
  toPosition,
}: ConnectionLineComponentProps) {
  const [path] = getBezierPath({
    sourceX: fromX,
    sourceY: fromY,
    sourcePosition: fromPosition,
    targetX: toX,
    targetY: toY,
    targetPosition: toPosition,
  });

  return (
    <g>
      <path d={path} fill="none" stroke="#52525b" strokeWidth={2} />
    </g>
  );
}

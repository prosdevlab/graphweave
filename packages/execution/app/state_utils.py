"""State utilities — resolve input_map expressions against graph state."""

from __future__ import annotations

from types import SimpleNamespace

import simpleeval
from simpleeval import EvalWithCompoundTypes, NameNotDefined

# Override module-level defaults for resource limits
simpleeval.MAX_POWER = 1000
simpleeval.MAX_STRING_LENGTH = 100_000


class InputMapError(Exception):
    """An input_map expression failed to evaluate."""

    def __init__(self, field: str, expression: str, cause: Exception) -> None:
        self.field = field
        self.expression = expression
        self.cause = cause
        super().__init__(
            f"Failed to resolve input_map field '{field}' "
            f"(expression: {expression!r}): {cause}"
        )


def _to_namespace(obj: object) -> object:
    """Recursively convert dicts to SimpleNamespace for attribute access.

    simpleeval resolves attribute access on objects but not on dicts.
    SimpleNamespace bridges this so expressions like ``messages[-1].content``
    work against a dict-based state.  The original state dict is never mutated.

    Pydantic models (e.g. LangChain HumanMessage, AIMessage) are converted via
    ``model_dump()`` so their fields are accessible as attributes.
    """
    if isinstance(obj, dict):
        return SimpleNamespace(**{k: _to_namespace(v) for k, v in obj.items()})
    if isinstance(obj, list):
        return [_to_namespace(item) for item in obj]
    if hasattr(obj, "model_dump"):
        return _to_namespace(obj.model_dump())
    return obj


def resolve_input_map(input_map: dict[str, str], state: dict) -> dict:
    """Evaluate each expression in *input_map* against *state*.

    Returns a dict mapping each key to the evaluated result.

    Raises:
        InputMapError: If any expression fails to evaluate.
    """
    ns = _to_namespace(state)
    # Build names dict from the namespace's attributes
    names = vars(ns) if isinstance(ns, SimpleNamespace) else {}

    results: dict[str, object] = {}
    for field, expression in input_map.items():
        if not expression:
            continue  # unmapped optional param — skip
        evaluator = EvalWithCompoundTypes(names=names)
        try:
            results[field] = evaluator.eval(expression)
        except (KeyError, NameNotDefined) as exc:
            available = list(names.keys())
            raise InputMapError(
                field,
                expression,
                ValueError(f"{exc} (available fields: {available})"),
            ) from exc
        except Exception as exc:
            raise InputMapError(field, expression, exc) from exc

    return results

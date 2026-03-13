"""GraphSchema to LangGraph StateGraph builder."""


class GraphBuildError(Exception):
    """Raised when a graph cannot be compiled from the schema."""

    def __init__(self, message: str, node_ref: str | None = None):
        super().__init__(message)
        self.node_ref = node_ref


def build_graph(schema: dict, llm_provider: str = "openai"):
    """Build a LangGraph StateGraph from a GraphSchema dict.

    Args:
        schema: A GraphSchema dictionary.
        llm_provider: The LLM provider to use for LLM nodes.

    Returns:
        A compiled LangGraph StateGraph.

    Raises:
        GraphBuildError: If the graph cannot be compiled.
    """
    # TODO: Implement GraphSchema -> StateGraph conversion
    raise NotImplementedError("builder.build_graph not yet implemented")

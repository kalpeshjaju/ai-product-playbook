"""
FILE PURPOSE: Thread-safe LLM cost tracker with per-conversation and per-agent aggregation.

WHY: Without cost tracking, LLM spending is invisible. A single conversation
     costs ~$0.01-0.05 but at scale this adds up. Tracking enables:
     - Per-conversation cost attribution
     - Provider spending breakdown
     - Budget alerts and anomaly detection
     - Per-agent observability (p50, p95, error rate)
HOW: Global singleton records every call. Aggregation by conversation_id,
     provider, or agent. Percentile latency calculation for SLO monitoring.

ADAPTED FROM: job-matchmaker/src/resilience/cost_tracker.py
AUTHOR: Claude Opus 4.6
LAST UPDATED: 2026-02-28
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field

# Default pricing (per 1K tokens) — override via config at runtime
_DEFAULT_PRICING: dict[str, tuple[float, float]] = {
    # model_prefix: (cost_per_1k_prompt, cost_per_1k_completion)
    "deepseek": (0.00015, 0.00045),
    "meta-llama": (0.00018, 0.00018),
    "claude-haiku": (0.001, 0.005),
    "claude-sonnet": (0.003, 0.015),
    "claude-opus": (0.015, 0.075),
    "gpt-4o-mini": (0.00015, 0.0006),
    "gpt-4o": (0.0025, 0.01),
}


def _estimate_cost(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    """Estimate USD cost based on model and token counts."""
    for prefix, (prompt_rate, completion_rate) in _DEFAULT_PRICING.items():
        if prefix in model.lower():
            return (
                (prompt_tokens / 1000) * prompt_rate
                + (completion_tokens / 1000) * completion_rate
            )
    # Unknown model — use conservative default
    return (prompt_tokens / 1000) * 0.003 + (completion_tokens / 1000) * 0.015


@dataclass
class CallRecord:
    """One LLM API call — immutable after creation."""

    provider: str
    model: str
    caller: str  # e.g. "jd_agent", "synthesis", "judge"
    conversation_id: str  # empty for non-conversation calls
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    estimated_cost_usd: float
    duration_ms: float
    success: bool
    timestamp: float = field(default_factory=time.time)


@dataclass
class CostSummary:
    """Aggregated cost data."""

    total_calls: int = 0
    successful_calls: int = 0
    failed_calls: int = 0
    total_prompt_tokens: int = 0
    total_completion_tokens: int = 0
    total_tokens: int = 0
    total_cost_usd: float = 0.0
    total_duration_ms: float = 0.0


@dataclass
class AgentObservability:
    """Per-agent observability metrics for monitoring dashboards.

    WHY: When the system is slow, you need to know WHICH agent is slow.
         When costs spike, you need to know WHICH agent is burning budget.
    """

    agent_name: str
    call_count: int = 0
    error_count: int = 0
    error_rate: float = 0.0
    total_tokens: int = 0
    total_cost_usd: float = 0.0
    avg_latency_ms: float = 0.0
    p50_latency_ms: float = 0.0
    p95_latency_ms: float = 0.0
    max_latency_ms: float = 0.0


class CostTracker:
    """Thread-safe LLM cost tracker with per-conversation and per-agent aggregation.

    EXAMPLE:
        from src.resilience.cost_tracker import cost_tracker

        cost_tracker.record(
            provider="together",
            model="deepseek-ai/DeepSeek-V3.1",
            caller="jd_agent",
            conversation_id="conv-123",
            prompt_tokens=500,
            completion_tokens=200,
            duration_ms=1200.0,
            success=True,
        )

        summary = cost_tracker.conversation_summary("conv-123")
        # CostSummary(total_calls=5, total_cost_usd=0.012, ...)

        report = cost_tracker.observability_report()
        # {"jd_agent": AgentObservability(p95_latency_ms=3200, ...), ...}
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._records: list[CallRecord] = []

    def record(
        self,
        *,
        provider: str,
        model: str,
        caller: str,
        conversation_id: str = "",
        prompt_tokens: int = 0,
        completion_tokens: int = 0,
        duration_ms: float = 0.0,
        success: bool = True,
    ) -> CallRecord:
        """Record a single LLM API call."""
        total = prompt_tokens + completion_tokens
        cost = _estimate_cost(model, prompt_tokens, completion_tokens) if success else 0.0

        record = CallRecord(
            provider=provider,
            model=model,
            caller=caller,
            conversation_id=conversation_id,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total,
            estimated_cost_usd=cost,
            duration_ms=duration_ms,
            success=success,
        )

        with self._lock:
            self._records.append(record)

        return record

    def conversation_summary(self, conversation_id: str) -> CostSummary:
        """Aggregate costs for a specific conversation."""
        with self._lock:
            records = [r for r in self._records if r.conversation_id == conversation_id]
        return self._aggregate(records)

    def session_summary(self) -> CostSummary:
        """Aggregate all costs since tracker creation."""
        with self._lock:
            records = list(self._records)
        return self._aggregate(records)

    def provider_summary(self, provider: str) -> CostSummary:
        """Aggregate costs for a specific provider."""
        with self._lock:
            records = [r for r in self._records if r.provider == provider]
        return self._aggregate(records)

    def caller_summary(self, caller: str) -> CostSummary:
        """Aggregate costs for a specific caller/agent."""
        with self._lock:
            records = [r for r in self._records if r.caller == caller]
        return self._aggregate(records)

    @staticmethod
    def _aggregate(records: list[CallRecord]) -> CostSummary:
        summary = CostSummary()
        for r in records:
            summary.total_calls += 1
            if r.success:
                summary.successful_calls += 1
            else:
                summary.failed_calls += 1
            summary.total_prompt_tokens += r.prompt_tokens
            summary.total_completion_tokens += r.completion_tokens
            summary.total_tokens += r.total_tokens
            summary.total_cost_usd += r.estimated_cost_usd
            summary.total_duration_ms += r.duration_ms
        return summary

    def agent_observability(self, agent_name: str) -> AgentObservability:
        """Per-agent observability metrics with percentile latencies.

        WHY: Identifies which agent is slow or error-prone. The p95 latency
             catches tail latencies that avg_latency hides.
        """
        with self._lock:
            records = [r for r in self._records if r.caller == agent_name]

        if not records:
            return AgentObservability(agent_name=agent_name)

        durations = sorted(r.duration_ms for r in records)
        success_count = sum(1 for r in records if r.success)
        error_count = len(records) - success_count

        return AgentObservability(
            agent_name=agent_name,
            call_count=len(records),
            error_count=error_count,
            error_rate=error_count / len(records) if records else 0.0,
            total_tokens=sum(r.total_tokens for r in records),
            total_cost_usd=sum(r.estimated_cost_usd for r in records),
            avg_latency_ms=sum(durations) / len(durations),
            p50_latency_ms=_percentile(durations, 50),
            p95_latency_ms=_percentile(durations, 95),
            max_latency_ms=max(durations) if durations else 0.0,
        )

    def observability_report(self) -> dict[str, AgentObservability]:
        """Full observability report keyed by agent name."""
        with self._lock:
            agent_names = {r.caller for r in self._records}
        return {name: self.agent_observability(name) for name in sorted(agent_names)}

    def reset(self) -> None:
        """Clear all records. Useful for per-run tracking."""
        with self._lock:
            self._records.clear()


def _percentile(sorted_values: list[float], pct: int) -> float:
    """Compute percentile from pre-sorted values (nearest-rank method)."""
    if not sorted_values:
        return 0.0
    k = max(0, min(len(sorted_values) - 1, int(len(sorted_values) * pct / 100)))
    return sorted_values[k]


# Global singleton
cost_tracker = CostTracker()

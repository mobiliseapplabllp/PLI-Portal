"""Contracts shared by every diagnostic engine.

An engine takes an image path and returns a structured, explainable result.
The API/service layer never cares whether the numbers came from a mock
heuristic or a real pretrained network — it only sees `EngineResult`.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass, field


def severity_for(prob: float) -> str:
    if prob < 0.15:
        return "normal"
    if prob < 0.35:
        return "low"
    if prob < 0.60:
        return "moderate"
    if prob < 0.85:
        return "high"
    return "critical"


_SEVERITY_ORDER = ["normal", "low", "moderate", "high", "critical"]


def max_severity(sevs: list[str]) -> str:
    if not sevs:
        return "normal"
    return max(sevs, key=_SEVERITY_ORDER.index)


@dataclass
class Finding:
    label: str
    probability: float
    severity: str = "normal"

    def __post_init__(self) -> None:
        self.probability = round(float(self.probability), 4)
        if self.severity == "normal":
            self.severity = severity_for(self.probability)


@dataclass
class EngineResult:
    engine: str
    modality: str
    model_source: str
    findings: list[Finding] = field(default_factory=list)
    heatmap_path: str | None = None

    @property
    def positive(self) -> list[Finding]:
        return sorted(
            (f for f in self.findings if f.severity != "normal"),
            key=lambda f: f.probability,
            reverse=True,
        )

    @property
    def top_finding(self) -> Finding | None:
        return self.positive[0] if self.positive else None

    @property
    def max_severity(self) -> str:
        return max_severity([f.severity for f in self.findings])

    def to_dict(self) -> dict:
        return {
            "engine": self.engine,
            "modality": self.modality,
            "model_source": self.model_source,
            "findings": [asdict(f) for f in self.findings],
            "top_finding": self.top_finding.label if self.top_finding else None,
            "max_severity": self.max_severity,
            "heatmap_path": self.heatmap_path,
        }


class DiagnosticEngine(ABC):
    name: str
    modality: str
    model_source: str = "MockEngine"

    @abstractmethod
    def analyze(self, image_path: str, *, heatmap_out: str | None = None) -> EngineResult:
        ...

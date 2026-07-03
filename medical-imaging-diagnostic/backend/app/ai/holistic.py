"""Holistic, whole-profile patient AI.

Assembles EVERYTHING known about a patient — demographics, clinical notes, every
imaging study and its findings, every structured report + assessment category,
and non-imaging labs/documents — into one context, then asks an LLM to reason
over the complete picture and return a narrative assessment, unified problem
list, differential and next-step suggestions.

Reasoning backend: the **Claude CLI** (`claude -p`) invoked as a subprocess, so
it uses the machine's/server's existing Claude authentication (no API key wired
into the app). If the CLI isn't available or errors, it falls back to a
deterministic rules synthesis so the feature always works.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess


# --------------------------------------------------------------- context build
def build_context(*, patient, studies: list[dict], documents: list) -> str:
    """studies: list of {study, diagnostic(dict|None), report(obj|None)}."""
    lines = [
        "PATIENT PROFILE",
        f"Name: {patient.full_name} | MRN: {patient.mrn} | Sex: {patient.sex or '-'} "
        f"| DOB: {patient.date_of_birth or '-'}",
        f"Clinical notes: {patient.notes or '-'}",
        "",
        f"IMAGING STUDIES ({len(studies)}):",
    ]
    for i, it in enumerate(studies, 1):
        st = it["study"]
        diag = it.get("diagnostic")
        rep = it.get("report")
        lines.append(f"  [{i}] {st.modality.value.upper()} — {st.body_part or ''} "
                     f"({st.description or 'n/a'})")
        if diag:
            pos = [f for f in diag["findings"] if f["severity"] != "normal"]
            if pos:
                lines.append("       Findings: " + "; ".join(
                    f"{f['label']} {f['probability']*100:.0f}% ({f['severity']})" for f in pos))
            else:
                lines.append("       Findings: none significant")
            lines.append(f"       Model: {diag['model_source']}")
        if rep and rep.assessment_category:
            lines.append(f"       Assessment: {rep.assessment_category}")

    if documents:
        lines += ["", f"LABS & DOCUMENTS ({len(documents)}):"]
        for d in documents:
            v = f" = {d.value}" if d.value else ""
            lines.append(f"  - [{d.kind}] {d.title}{v}")

    return "\n".join(lines)


_PROMPT = """You are a clinical decision-support assistant reviewing a full patient profile.
Read ALL of the data below (imaging findings, assessments, labs, notes) and reason across it.

{context}

Return ONLY a JSON object (no prose, no markdown fences) with exactly these keys:
  "narrative": a concise 3-5 sentence holistic assessment integrating all findings,
  "problem_list": array of short strings (the active problems),
  "differential": array of {{"condition": string, "rationale": string}},
  "suggestions": array of short strings (recommended next tests / referrals / actions),
  "urgent": boolean (true if anything needs urgent attention).

This is a research/education prototype; be clear findings require physician review."""


# --------------------------------------------------------------- Claude CLI
def _claude_cli(prompt: str, timeout: int = 120) -> str | None:
    """Invoke the Claude CLI in headless print mode. Returns stdout or None."""
    cmd = os.environ.get("CLAUDE_CLI_CMD", "claude")
    if not shutil.which(cmd):
        return None
    try:
        # `-p` = print/headless. Prompt via stdin to avoid arg-length limits.
        proc = subprocess.run(
            [cmd, "-p", "--output-format", "text"],
            input=prompt, capture_output=True, text=True, timeout=timeout,
        )
        if proc.returncode == 0 and proc.stdout.strip():
            return proc.stdout.strip()
    except Exception:
        return None
    return None


def _extract_json(text: str) -> dict | None:
    """Pull the first JSON object out of an LLM response."""
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    try:
        return json.loads(text[start:end + 1])
    except Exception:
        return None


# --------------------------------------------------------------- rules fallback
def _rules_assessment(patient, studies: list[dict], documents: list) -> dict:
    problems, differential, suggestions = [], [], []
    urgent = False
    for it in studies:
        rep = it.get("report")
        diag = it.get("diagnostic")
        if rep and rep.assessment_category:
            problems.append(f"{it['study'].modality.value.upper()}: {rep.assessment_category}")
            cat = rep.assessment_category.lower()
            onco = any(k in cat for k in ("lung-rads 4", "lung-rads 5", "bi-rads 4",
                                          "bi-rads 5", "melanoma", "brain tumour"))
            if onco:
                urgent = True
                differential.append({"condition": rep.assessment_category,
                                     "rationale": "Imaging assessment flagged as suspicious."})
        if diag:
            for f in diag["findings"]:
                if f["severity"] in ("high", "critical"):
                    problems.append(f"{f['label']} ({f['severity']})")
    problems = list(dict.fromkeys(problems))
    if urgent:
        suggestions.append("Expedite specialist referral and tissue diagnosis where indicated.")
    suggestions.append("Correlate imaging with labs and clinical exam; physician review required.")
    narrative = (
        f"Across {len(studies)} imaging study(ies)"
        + (f" and {len(documents)} lab/document(s)" if documents else "")
        + ", "
        + ("multiple suspicious findings are present — see problem list. "
           if problems else "no significant abnormalities were identified. ")
        + "This automated summary is a prototype and requires clinician review."
    )
    return {"narrative": narrative, "problem_list": problems, "differential": differential,
            "suggestions": list(dict.fromkeys(suggestions)), "urgent": urgent}


# --------------------------------------------------------------- public API
def assess_patient(*, patient, studies: list[dict], documents: list) -> dict:
    """Run the holistic assessment. Returns dict + a `source` field."""
    context = build_context(patient=patient, studies=studies, documents=documents)
    raw = _claude_cli(_PROMPT.format(context=context))
    if raw:
        parsed = _extract_json(raw)
        if parsed and "narrative" in parsed:
            parsed.setdefault("problem_list", [])
            parsed.setdefault("differential", [])
            parsed.setdefault("suggestions", [])
            parsed.setdefault("urgent", False)
            parsed["source"] = "claude-cli"
            return parsed
    result = _rules_assessment(patient, studies, documents)
    result["source"] = "rules"
    return result


def cli_available() -> bool:
    return bool(shutil.which(os.environ.get("CLAUDE_CLI_CMD", "claude")))


def chat_stream(*, context: str, question: str):
    """Generator yielding the answer in chunks as the Claude CLI produces them.

    Takes a pre-built `context` STRING (not ORM objects) because it runs after
    the request's DB session has closed — the caller must assemble the context
    while the session is still open. Falls back to a single canned message if the
    CLI is unavailable. The CLI subprocess is terminated if the consumer stops
    early (client disconnect / 'stop generating'), via the finally block."""
    prompt = (
        f"{context}\n\nA clinician asks: \"{question}\"\n\n"
        "Answer concisely based only on the profile above. This is a "
        "research/education prototype; note findings require physician review."
    )
    cmd = os.environ.get("CLAUDE_CLI_CMD", "claude")
    if not shutil.which(cmd):
        yield ("The Claude CLI is not available on this server, so live Q&A is "
               "disabled. Set CLAUDE_CLI_CMD to your `claude` binary to enable it.")
        return
    proc = None
    try:
        proc = subprocess.Popen(
            [cmd, "-p", "--output-format", "text"],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            text=True, bufsize=1,
        )
        proc.stdin.write(prompt)
        proc.stdin.close()
        for line in proc.stdout:          # stream stdout as it arrives
            yield line
    except Exception:
        yield "\n[error contacting the assistant]"
    finally:
        if proc is not None and proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except Exception:
                proc.kill()


def chat(*, patient, studies: list[dict], documents: list, question: str) -> dict:
    """Answer a free-text question about the patient using the Claude CLI.
    Falls back to a canned message if the CLI is unavailable."""
    context = build_context(patient=patient, studies=studies, documents=documents)
    prompt = (
        f"{context}\n\nA clinician asks: \"{question}\"\n\n"
        "Answer concisely based only on the profile above. This is a "
        "research/education prototype; note findings require physician review."
    )
    raw = _claude_cli(prompt)
    if raw:
        return {"answer": raw, "source": "claude-cli"}
    return {
        "answer": ("The Claude CLI is not available on this server, so live Q&A is "
                   "disabled. Set CLAUDE_CLI_CMD to your `claude` binary to enable it. "
                   "Meanwhile, see the AI assessment and structured reports."),
        "source": "unavailable",
    }

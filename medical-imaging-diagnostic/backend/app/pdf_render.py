"""Server-side PDF export of the formal medical report (fpdf2, pure Python).

Mirrors the HTML artifact's structure: letterhead → patient → per-study findings
tables → integrated correlation → sign-off → disclaimer. Returns PDF bytes.
"""
from __future__ import annotations

import json
from datetime import datetime

from fpdf import FPDF

BRAND = (15, 118, 110)          # teal-700
INK = (15, 23, 42)
MUTED = (100, 116, 139)
LINE = (226, 232, 240)
SEV_FILL = {
    "normal": (220, 252, 231), "low": (224, 242, 254), "moderate": (254, 249, 195),
    "high": (255, 237, 213), "critical": (254, 226, 226),
}
SEV_TEXT = {
    "normal": (21, 128, 61), "low": (3, 105, 161), "moderate": (161, 98, 7),
    "high": (194, 65, 12), "critical": (185, 28, 28),
}
MODALITY_TITLE = {
    "xray": "Chest Radiograph", "ct": "CT", "mri": "MRI",
    "fundus": "Fundus Photography", "dermoscopy": "Dermoscopy", "pathology": "Pathology",
}


_TRANSLIT = str.maketrans({
    "—": "-", "–": "-", "→": "->", "‘": "'", "’": "'",
    "“": '"', "”": '"', "…": "...", "·": "-", "•": "-",
    "✓": "OK", "⚠": "!",
})


class ReportPDF(FPDF):
    def normalize_text(self, text):
        # Core fonts are latin-1 only; transliterate common unicode, then drop
        # anything else rather than crashing on dynamic content.
        text = str(text).translate(_TRANSLIT)
        text = text.encode("latin-1", errors="replace").decode("latin-1")
        return super().normalize_text(text)

    def footer(self):
        self.set_y(-14)
        self.set_font("helvetica", "I", 7.5)
        self.set_text_color(*MUTED)
        self.cell(0, 5, f"Page {self.page_no()}/{{nb}} — AI-assisted preliminary report, "
                        "not validated for clinical use.", align="C")


def _sev_chip(pdf: FPDF, sev: str):
    pdf.set_font("helvetica", "B", 8)
    pdf.set_fill_color(*SEV_FILL.get(sev, LINE))
    pdf.set_text_color(*SEV_TEXT.get(sev, INK))
    pdf.cell(24, 5.6, sev.capitalize(), fill=True, align="C")
    pdf.set_text_color(*INK)


def render_patient_pdf(*, org, patient, studies: list[dict], correlation,
                       report_id: str) -> bytes:
    pdf = ReportPDF(format="A4")
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_page()
    pdf.set_margins(16, 14, 16)
    epw = pdf.epw  # effective page width

    # ---- letterhead ----
    pdf.set_font("helvetica", "B", 16)
    pdf.set_text_color(*BRAND)
    pdf.cell(epw * 0.62, 8, org.name)
    pdf.set_font("helvetica", "", 8.5)
    pdf.set_text_color(*MUTED)
    pdf.cell(0, 8, f"Report ID: {report_id}", align="R", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("helvetica", "", 9)
    pdf.cell(epw * 0.62, 5, "Department of Diagnostic Imaging - AI-Assisted Reporting")
    pdf.set_font("helvetica", "", 8.5)
    pdf.cell(0, 5, f"Generated: {datetime.now().strftime('%d %b %Y, %H:%M')}",
             align="R", new_x="LMARGIN", new_y="NEXT")
    pdf.set_draw_color(*BRAND)
    pdf.set_line_width(0.8)
    y = pdf.get_y() + 2
    pdf.line(16, y, 16 + epw, y)
    pdf.set_y(y + 4)

    # ---- patient block ----
    pdf.set_font("helvetica", "B", 9)
    pdf.set_text_color(*MUTED)
    pdf.cell(0, 6, "PATIENT", new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(*INK)
    pdf.set_font("helvetica", "", 10)
    cols = [
        ("Name", patient.full_name), ("MRN", patient.mrn),
        ("Sex", patient.sex or "-"), ("DOB", patient.date_of_birth or "-"),
    ]
    w = epw / 4
    pdf.set_font("helvetica", "", 7.5); pdf.set_text_color(*MUTED)
    for label, _ in cols:
        pdf.cell(w, 4.5, label.upper())
    pdf.ln()
    pdf.set_font("helvetica", "B", 10); pdf.set_text_color(*INK)
    for _, value in cols:
        pdf.cell(w, 6, str(value))
    pdf.ln(9)
    pdf.set_font("helvetica", "", 9.5)
    pdf.multi_cell(0, 5, f"Clinical indication: {patient.notes or '-'}")
    pdf.ln(2)

    # ---- studies ----
    pdf.set_font("helvetica", "B", 9)
    pdf.set_text_color(*MUTED)
    pdf.cell(0, 6, "IMAGING & FINDINGS", new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(*INK)

    for item in studies:
        st = item["study"]
        diag = item.get("diagnostic")
        rep = item.get("report")
        title = MODALITY_TITLE.get(st.modality.value, st.modality.value.upper())

        pdf.set_font("helvetica", "B", 11)
        pdf.cell(0, 7, f"{title} - {st.body_part or ''}", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("helvetica", "I", 8.5)
        pdf.set_text_color(*MUTED)
        pdf.cell(0, 4.5, st.description or "", new_x="LMARGIN", new_y="NEXT")
        pdf.set_text_color(*INK)
        pdf.ln(1.5)

        findings = (diag or {}).get("findings", [])
        pos = sorted([f for f in findings if f["severity"] != "normal"],
                     key=lambda f: f["probability"], reverse=True)
        if not pos:
            pdf.set_font("helvetica", "", 9.5)
            pdf.set_text_color(*SEV_TEXT["normal"])
            pdf.cell(0, 6, "No significant findings on automated analysis.",
                     new_x="LMARGIN", new_y="NEXT")
            pdf.set_text_color(*INK)
        else:
            # table header
            pdf.set_font("helvetica", "B", 7.5)
            pdf.set_text_color(*MUTED)
            pdf.cell(epw * 0.45, 5, "FINDING")
            pdf.cell(epw * 0.30, 5, "PROBABILITY")
            pdf.cell(epw * 0.25, 5, "SEVERITY", new_x="LMARGIN", new_y="NEXT")
            pdf.set_text_color(*INK)
            for f in pos:
                pdf.set_font("helvetica", "", 9.5)
                pdf.cell(epw * 0.45, 6.2, f["label"])
                # probability bar
                bx, by = pdf.get_x(), pdf.get_y() + 1.6
                bar_w = epw * 0.22
                pdf.set_fill_color(241, 245, 249)
                pdf.rect(bx, by, bar_w, 3, style="F")
                pdf.set_fill_color(*SEV_TEXT.get(f["severity"], INK))
                pdf.rect(bx, by, bar_w * min(f["probability"], 1.0), 3, style="F")
                pdf.set_x(bx + bar_w + 2)
                pdf.cell(epw * 0.30 - bar_w - 2, 6.2, f"{f['probability']*100:.0f}%")
                _sev_chip(pdf, f["severity"])
                pdf.ln(6.6)

        if rep and rep.impression:
            pdf.ln(1)
            pdf.set_font("helvetica", "B", 9)
            pdf.cell(22, 5.5, "Impression:")
            pdf.set_font("helvetica", "", 9)
            pdf.multi_cell(0, 5.5, rep.impression)
        if diag:
            pdf.set_font("helvetica", "", 7.5)
            pdf.set_text_color(*MUTED)
            pdf.cell(0, 5, f"Automated analysis: {diag.get('model_source', '-')}",
                     new_x="LMARGIN", new_y="NEXT")
            pdf.set_text_color(*INK)
        pdf.set_draw_color(*LINE); pdf.set_line_width(0.2)
        y = pdf.get_y() + 2
        pdf.line(16, y, 16 + epw, y)
        pdf.set_y(y + 4)

    # ---- correlation ----
    if correlation:
        diff = json.loads(correlation.differential_json)
        recs = json.loads(correlation.recommendations_json)
        pdf.set_font("helvetica", "B", 11)
        pdf.set_text_color(*BRAND)
        pdf.cell(58, 7, "Integrated AI Correlation")
        _sev_chip(pdf, correlation.max_severity.value)
        pdf.ln(9)
        pdf.set_text_color(*INK)
        pdf.set_font("helvetica", "", 9.5)
        pdf.multi_cell(0, 5.2, correlation.summary)
        pdf.ln(1.5)
        if diff:
            pdf.set_font("helvetica", "B", 8); pdf.set_text_color(*MUTED)
            pdf.cell(0, 5, "DIFFERENTIAL CONSIDERATIONS", new_x="LMARGIN", new_y="NEXT")
            pdf.set_text_color(*INK)
            for d in diff:
                pdf.set_font("helvetica", "B", 9.5)
                pdf.cell(epw * 0.7, 5.8, f"- {d['condition']}")
                pdf.set_text_color(*BRAND)
                pdf.cell(0, 5.8, f"{d['confidence']*100:.0f}%", new_x="LMARGIN", new_y="NEXT")
                pdf.set_text_color(*MUTED); pdf.set_font("helvetica", "", 8)
                pdf.cell(0, 4.4, f"   supporting: {', '.join(d['supporting_findings'])}",
                         new_x="LMARGIN", new_y="NEXT")
                pdf.set_text_color(*INK)
        if recs:
            pdf.ln(1)
            pdf.set_font("helvetica", "B", 8); pdf.set_text_color(*MUTED)
            pdf.cell(0, 5, "RECOMMENDATIONS", new_x="LMARGIN", new_y="NEXT")
            pdf.set_text_color(*INK); pdf.set_font("helvetica", "", 9.5)
            for r in recs:
                pdf.multi_cell(0, 5.4, f"-> {r}")

    # ---- sign-off + disclaimer ----
    pdf.ln(10)
    y = pdf.get_y()
    if y > 250:
        pdf.add_page(); y = pdf.get_y() + 6
    pdf.set_draw_color(*INK); pdf.set_line_width(0.3)
    pdf.line(16, y + 10, 16 + epw * 0.42, y + 10)
    pdf.line(16 + epw * 0.56, y + 10, 16 + epw, y + 10)
    pdf.set_y(y + 11)
    pdf.set_font("helvetica", "", 7.5); pdf.set_text_color(*MUTED)
    pdf.cell(epw * 0.42, 4, "AI-assisted preliminary report - not a final interpretation")
    pdf.set_x(16 + epw * 0.56)
    pdf.cell(epw * 0.44, 4, "Reporting radiologist (signature / date)",
             new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)
    pdf.set_font("helvetica", "", 7.5)
    pdf.multi_cell(0, 3.8,
        "Disclaimer: This document was produced by a research/education prototype "
        "(Medical Imaging Diagnostic Assistant). Findings are generated by automated "
        "models (including simulated engines) and are NOT validated for clinical use "
        "and not regulatory-cleared (FDA/CE). It must not be used for diagnosis or "
        "treatment. A qualified physician must review all imaging.")

    return bytes(pdf.output())

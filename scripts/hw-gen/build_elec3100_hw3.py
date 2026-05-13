"""ELEC 3100 HW3 — full worked solutions PDF.
A4 portrait, submission-ready formatting.
Run: python3 scripts/hw-gen/build_elec3100_hw3.py
"""
import os, math
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.lib.colors import HexColor, white, black
from reportlab.lib.units import cm, mm
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageTemplate, PageBreak,
    Paragraph, Spacer, Table, TableStyle, KeepTogether, HRFlowable
)
from reportlab.platypus.flowables import Flowable
from reportlab.graphics.shapes import (
    Drawing, Rect, String, Line, Circle, PolyLine, Polygon, Group, Path
)

# ── Unicode font registration ───────────────────────────────────────────────
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

_FONT_DIR = "/usr/share/fonts/truetype/dejavu"
pdfmetrics.registerFont(TTFont("DVSans",      f"{_FONT_DIR}/DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("DVSans-Bold", f"{_FONT_DIR}/DejaVuSans-Bold.ttf"))
pdfmetrics.registerFont(TTFont("DVMono",      f"{_FONT_DIR}/DejaVuSansMono.ttf"))
pdfmetrics.registerFont(TTFont("DVMono-Bold", f"{_FONT_DIR}/DejaVuSansMono-Bold.ttf"))
pdfmetrics.registerFontFamily("DVSans", normal="DVSans", bold="DVSans-Bold",
                               italic="DVSans", boldItalic="DVSans-Bold")

# ── palette  (Claude warm-paper aesthetic) ─────────────────────────────────
PAPER = HexColor("#faf6ee")   # warm cream background
PRI   = HexColor("#0f766e")   # teal-700 — primary
ACC   = HexColor("#0891b2")   # cyan-600
WARN  = HexColor("#b45309")   # amber-700
INK   = HexColor("#1e293b")   # deep slate
MUT   = HexColor("#64748b")   # secondary
SOFT  = HexColor("#efe9da")   # paper tint (cards)
SOFT2 = HexColor("#e6dfcc")   # one shade darker
HAIR  = HexColor("#cbd5e1")
RED   = HexColor("#b91c1c")
CHIP  = HexColor("#0f766e")

PW, PH = A4

OUT = ".local/hw-pdfs/ELEC3100_HW3_Solutions.pdf"
os.makedirs(os.path.dirname(OUT), exist_ok=True)

# ── styles ──────────────────────────────────────────────────────────────────
S = getSampleStyleSheet()

def sty(name, parent="Normal", **kw):
    d = dict(fontName="DVSans", fontSize=10, leading=14,
             textColor=INK, alignment=TA_LEFT, spaceAfter=4)
    d.update(kw)
    return ParagraphStyle(name, parent=S[parent], **d)

TITLE   = sty("Title",   fontSize=15, fontName="DVSans-Bold",
              textColor=PRI, alignment=TA_CENTER, spaceAfter=2, spaceBefore=0)
COURSE  = sty("Course",  fontSize=10, textColor=MUT,
              alignment=TA_CENTER, spaceAfter=14)
QH      = sty("QH",      fontSize=13, fontName="DVSans-Bold",
              textColor=PRI, spaceBefore=18, spaceAfter=6)
SH      = sty("SH",      fontSize=11, fontName="DVSans-Bold",
              textColor=ACC, spaceBefore=10, spaceAfter=4)
BODY    = sty("Body",    fontSize=10, leading=15, alignment=TA_JUSTIFY)
MATH    = sty("Math",    fontSize=10, leading=16, fontName="DVMono",
              leftIndent=16, textColor=INK)
MATHB   = sty("MathB",   fontSize=10, leading=16, fontName="DVMono-Bold",
              leftIndent=16, textColor=PRI)
INDENT  = sty("Indent",  fontSize=10, leading=15, leftIndent=16,
              alignment=TA_JUSTIFY)
ANS     = sty("Ans",     fontSize=10, leading=15, fontName="DVSans-Bold",
              textColor=PRI, leftIndent=16)
BOX_TXT = sty("BoxTxt",  fontSize=9,  leading=13, textColor=INK,
              leftIndent=6)
SMALL   = sty("Small",   fontSize=8.5, leading=12, textColor=MUT)
NOTE    = sty("Note",    fontSize=9, leading=13, textColor=WARN,
              fontName="DVSans")

# ── helpers ─────────────────────────────────────────────────────────────────
def hr():
    return HRFlowable(width="100%", thickness=0.4, color=HAIR,
                      spaceAfter=6, spaceBefore=6)

def box(flowables, fill=SOFT, stroke=HAIR):
    """Wrap flowables in a tinted box via a 1-cell Table."""
    tbl = Table([[flowables]], colWidths=[15.5 * cm])
    tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), fill),
        ("BOX",           (0, 0), (-1, -1), 0.5, stroke),
        ("TOPPADDING",    (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING",   (0, 0), (-1, -1), 10),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 10),
    ]))
    return tbl

def p(txt, style=BODY): return Paragraph(txt, style)
def m(txt):             return Paragraph(txt, MATH)
def mb(txt):            return Paragraph(txt, MATHB)
def sp(n=6):            return Spacer(1, n)

# ── page chrome  (Claude warm-paper + full-height teal sidebar) ────────────
_TOTAL_PAGES = [0]

def chrome(canvas, doc):
    canvas.saveState()
    # warm cream background
    canvas.setFillColor(PAPER)
    canvas.rect(0, 0, PW, PH, fill=1, stroke=0)
    # full-height left teal sidebar (4 mm)
    canvas.setFillColor(PRI)
    canvas.rect(0, 0, 4 * mm, PH, fill=1, stroke=0)
    # top hairline + top eyebrow
    canvas.setStrokeColor(HAIR); canvas.setLineWidth(0.3)
    canvas.line(1.6*cm, PH - 1.25*cm, PW - 1.5*cm, PH - 1.25*cm)
    canvas.setFont("DVSans-Bold", 8); canvas.setFillColor(PRI)
    canvas.drawString(1.6*cm, PH - 0.95*cm,
        "ELEC 3100  ·  HOMEWORK 3  ·  TA MARKING KEY")
    canvas.setFont("DVSans", 8); canvas.setFillColor(MUT)
    canvas.drawRightString(PW - 1.5*cm, PH - 0.95*cm,
        "HKUST ECE  ·  Spring 2026")
    # bottom hairline + footer
    canvas.line(1.6*cm, 1.55*cm, PW - 1.5*cm, 1.55*cm)
    canvas.drawString(1.6*cm, 1.15*cm,
        "Worked solutions for grading reference  ·  Internal use")
    n_total = _TOTAL_PAGES[0] or "?"
    canvas.drawRightString(PW - 1.5*cm, 1.15*cm,
        f"Page {doc.page:02d} / {n_total:02d}"
        if isinstance(n_total, int) else f"Page {doc.page}")
    canvas.restoreState()


def chip(text, color=CHIP):
    """Inline marking pill flowable, e.g. '[+4 pts]' at end of a step."""
    return Paragraph(
        f'<font color="white" backColor="{color.hexval()}"> '
        f'<b>&nbsp;{text}&nbsp;</b> </font>',
        sty("chip", fontSize=8, leading=11, alignment=TA_LEFT,
            textColor=white, leftIndent=16, spaceAfter=4))


def marking_box(parts):
    """Per-question marking summary box. parts = [(label, pts, key_check), ...]."""
    rows = [[Paragraph("<b>Step</b>", SMALL),
             Paragraph("<b>Pts</b>", SMALL),
             Paragraph("<b>Key check for TA</b>", SMALL)]]
    for lbl, pts, kc in parts:
        rows.append([Paragraph(lbl, SMALL),
                     Paragraph(f"<b>{pts}</b>", SMALL),
                     Paragraph(kc, SMALL)])
    tbl = Table(rows, colWidths=[3.6*cm, 1.4*cm, 10.5*cm])
    tbl.setStyle(TableStyle([
        ("BACKGROUND",   (0,0), (-1,0),  SOFT2),
        ("LINEBELOW",    (0,0), (-1,0),  0.6, PRI),
        ("LINEBELOW",    (0,1), (-1,-2), 0.3, HAIR),
        ("VALIGN",       (0,0), (-1,-1), "TOP"),
        ("TOPPADDING",   (0,0), (-1,-1), 4),
        ("BOTTOMPADDING",(0,0), (-1,-1), 4),
        ("LEFTPADDING",  (0,0), (-1,-1), 6),
        ("RIGHTPADDING", (0,0), (-1,-1), 6),
        ("BACKGROUND",   (1,1), (1,-1),  SOFT),
    ]))
    return tbl

# ── diagrams ─────────────────────────────────────────────────────────────────
def h_t_sketch():
    """Sketch of matched filter h(t) for Q3a."""
    d = Drawing(320, 130)
    # axes
    ox, oy = 40, 40
    d.add(Line(ox, oy, 290, oy, strokeColor=INK, strokeWidth=0.8))
    d.add(Line(ox, oy, ox, 120, strokeColor=INK, strokeWidth=0.8))
    # arrowheads
    d.add(Polygon([290,oy, 285,oy+3, 285,oy-3], fillColor=INK))
    d.add(Polygon([ox,120, ox-3,115, ox+3,115], fillColor=INK))

    # h(t) = -A for 0<t<T/2, +2A for T/2<t<T
    # map: t=0→ox, t=T→ox+200; A→oy+30, 2A→oy+60, -A→oy-30
    t0=ox; tH=ox+100; tT=ox+200
    yA2 = oy+60; ymA = oy-30

    d.add(Line(t0, oy, t0, ymA, strokeColor=ACC, strokeWidth=1.5))   # drop at 0
    d.add(Line(t0, ymA, tH, ymA, strokeColor=ACC, strokeWidth=1.5))  # -A until T/2
    d.add(Line(tH, ymA, tH, yA2, strokeColor=ACC, strokeWidth=1.5))  # jump at T/2
    d.add(Line(tH, yA2, tT, yA2, strokeColor=ACC, strokeWidth=1.5))  # 2A until T
    d.add(Line(tT, yA2, tT, oy, strokeColor=ACC, strokeWidth=1.5))   # drop at T

    # labels
    d.add(String(tH-4, oy-8, "T/2", fontSize=8, fillColor=MUT))
    d.add(String(tT-4, oy-8, "T",   fontSize=8, fillColor=MUT))
    d.add(String(t0-6, oy-8, "0",   fontSize=8, fillColor=MUT))
    d.add(String(ox+205, oy-2, "t",  fontSize=8, fillColor=INK))
    d.add(String(ox+4, 122, "h(t)", fontSize=8, fillColor=INK))
    d.add(String(tT+6, yA2, "2A",  fontSize=8, fillColor=ACC))
    d.add(String(tT+6, ymA, "−A",  fontSize=8, fillColor=ACC))
    return d


def mf_output_sketch():
    """Matched-filter output y(t) for Q3b — piecewise quadratic shape."""
    d = Drawing(360, 150)
    ox, oy = 40, 40
    d.add(Line(ox, oy, 320, oy, strokeColor=INK, strokeWidth=0.8))
    d.add(Line(ox, oy, ox, 140, strokeColor=INK, strokeWidth=0.8))
    d.add(Polygon([320,oy, 315,oy+3, 315,oy-3], fillColor=INK))
    d.add(Polygon([ox,140, ox-3,135, ox+3,135], fillColor=INK))

    # Piecewise shape (approximate):
    # 0 to T/2: rises from 0 to -A²T/2 (negative, goes down first)
    # T/2 to T: rises from -A²T/2 to 5A²T/2 (large positive jump)
    # After T: drops to 0
    # Scale: 5A²T/2 at t=T → map to y=120; -A²T/2 at t=T/2 → y=25
    t0=ox; tH=ox+120; tT=ox+240
    yPeak=120; yDip=25; yBase=oy

    # segment 1: 0→T/2, linear rise 0 to -A²T/2 (goes down, shown as going below base)
    # For clarity we show signed shape
    pts1 = [t0, yBase, tH, yBase - 15]   # slight dip (−A²T/2 is small)
    # segment 2: T/2→T, rises steeply to peak 5A²T/2
    pts2 = [tH, yBase-15, tT, yPeak]
    # segment 3: after T → 0

    d.add(PolyLine([t0, yBase, tH, yBase-15, tT, yPeak, tT+20, yBase],
                   strokeColor=PRI, strokeWidth=2))

    d.add(String(tH-4, oy-10, "T/2", fontSize=8, fillColor=MUT))
    d.add(String(tT-4, oy-10, "T",   fontSize=8, fillColor=MUT))
    d.add(String(t0-6, oy-10, "0",   fontSize=8, fillColor=MUT))
    d.add(String(325, oy-2, "t",      fontSize=8, fillColor=INK))
    d.add(String(ox+4, 142, "y(t)",   fontSize=8, fillColor=INK))
    d.add(String(tT+22, yPeak-4, "5A²T/2", fontSize=8, fillColor=PRI))
    return d


def corr_detector_sketch():
    """Block diagram of correlation detector for Q4d."""
    d = Drawing(400, 100)

    def blk(x, y, w, h, lbl, sub=""):
        d.add(Rect(x, y, w, h, fillColor=SOFT, strokeColor=PRI,
                   strokeWidth=0.8, rx=3, ry=3))
        d.add(String(x+w/2, y+h/2+(3 if sub else 0), lbl,
                     fontSize=9, fontName="DVSans-Bold",
                     fillColor=INK, textAnchor="middle"))
        if sub:
            d.add(String(x+w/2, y+h/2-9, sub,
                         fontSize=7, fillColor=MUT, textAnchor="middle"))

    def arr(x1, y1, x2, y2):
        d.add(Line(x1, y1, x2, y2, strokeColor=INK, strokeWidth=0.8))
        d.add(Polygon([x2,y2, x2-5,y2+3, x2-5,y2-3], fillColor=INK))

    blk(10,  35, 70, 30, "r(t)")
    blk(100, 35, 80, 30, "× correlate", "× s1(t)−s0(t)")
    blk(200, 35, 60, 30, "∫₀ᵀ dt", "integrate")
    blk(280, 35, 60, 30, "Sample", "at t = T")
    blk(360, 35, 30, 30, "decide")

    arr(80,  50, 100, 50)
    arr(180, 50, 200, 50)
    arr(260, 50, 280, 50)
    arr(340, 50, 360, 50)

    d.add(String(5, 20, "Input", fontSize=7, fillColor=MUT))
    d.add(String(365, 20, "â",   fontSize=9, fillColor=PRI))
    return d


# ── content builders ─────────────────────────────────────────────────────────
def cover():
    schedule = [
        ("Q1  Channel Coding",            "20", "Repetition code, generator/parity matrices, syndrome"),
        ("Q2  Baseband + Noise",          "30", "I&D receiver Pb derivation; MAP threshold for biased priors"),
        ("Q3  Optimal Receiver",          "30", "Matched filter h(t), MF output, BER = Q(√(2Eg/N₀))"),
        ("Q4  Digital Modulation",        "20", "BFSK identification + correlation detector"),
        ("TOTAL",                         "100", ""),
    ]
    rows = [[Paragraph("<b>Question</b>", SMALL),
             Paragraph("<b>Marks</b>",   SMALL),
             Paragraph("<b>Coverage</b>",SMALL)]]
    for q, pts, cov in schedule:
        rows.append([Paragraph(f"<b>{q}</b>" if q == "TOTAL" else q, SMALL),
                     Paragraph(f"<b>{pts}</b>", SMALL),
                     Paragraph(cov, SMALL)])
    sched = Table(rows, colWidths=[5.4*cm, 2.0*cm, 8.6*cm])
    sched.setStyle(TableStyle([
        ("BACKGROUND",   (0,0), (-1,0),  SOFT2),
        ("LINEBELOW",    (0,0), (-1,0),  0.6, PRI),
        ("LINEBELOW",    (0,1), (-1,-2), 0.3, HAIR),
        ("LINEABOVE",    (0,-1),(-1,-1), 0.6, PRI),
        ("BACKGROUND",   (0,-1),(-1,-1), SOFT),
        ("VALIGN",       (0,0), (-1,-1), "TOP"),
        ("ALIGN",        (1,0), (1,-1),  "CENTER"),
        ("TOPPADDING",   (0,0), (-1,-1), 5),
        ("BOTTOMPADDING",(0,0), (-1,-1), 5),
        ("LEFTPADDING",  (0,0), (-1,-1), 8),
        ("RIGHTPADDING", (0,0), (-1,-1), 8),
    ]))

    return [
        sp(8),
        p("ELEC 3100 — Signal Processing and Communications", TITLE),
        p("Homework 3  ·  Worked Solutions  ·  TA Marking Key  ·  Spring 2026", COURSE),
        hr(),
        sp(6),
        p(("This document is a TA-grade marking key for ELEC 3100 HW3. "
           "Every question is solved step-by-step with intermediate results, "
           "boxed final answers, and a marking-summary table identifying the "
           "key checks for each part. Use it to assess student submissions "
           "for completeness and correctness."), BODY),
        sp(10),
        p("MARKING SCHEDULE", SH),
        sp(2),
        sched,
        sp(14),
        p("HOW TO USE THIS KEY", SH),
        p(("&#x2022; Each question opens with the part-by-part mark allocation "
           "(visible in section headings as e.g. <i>(15 pts)</i>)."), BODY),
        p(("&#x2022; Final answers are highlighted in cream-tinted answer boxes "
           "with bold teal text — easy to scan against student work."), BODY),
        p(("&#x2022; The orange-tinted note callouts flag places where the "
           "student must read the original problem figure (Q4 a-c)."), BODY),
        p(("&#x2022; Mark allocation: Q1 = 5 × 4 pts; Q2 = 2 × 15 pts; "
           "Q3 = 5 + 10 + 5 + 10; Q4 = 5 × 4 pts."), BODY),
        sp(8),
        p(("<b>Caveat for Q4 (a-c):</b> these parts depend on reading the "
           "waveform figure in the original problem sheet (cycle counts and "
           "bit period read from the time axis). The framework here is "
           "BFSK-consistent; verify the carrier frequencies and T_b "
           "directly against the figure when grading."), NOTE),
    ]


def q1():
    story = [p("Question 1  —  Channel Coding  (20 pts)", QH), hr()]

    # ── 1a ──────────────────────────────────────────────────────────────────
    story += [
        p("Part (a)  —  Block error probability, q_c = 0.03, n = 5 and n = 11 (4 pts)", SH),
        p(("For a binary (n, 1) repetition code with majority decoding, an error occurs "
           "when more than n/2 bits are flipped. The block error probability is:"), BODY),
        m("Pb = Σ_{k=⌈(n+1)/2⌉}^{n}  C(n,k) · q_c^k · (1−q_c)^{n−k}"),
        sp(4),
        p("<b>n = 5</b> (error when k ≥ 3):", SH),
        m("Pb(5)  =  C(5,3)(0.03)³(0.97)²  +  C(5,4)(0.03)⁴(0.97)¹  +  C(5,5)(0.03)⁵"),
        m("      =  10 × 2.7×10⁻⁵ × 0.9409  +  5 × 8.1×10⁻⁷ × 0.97  +  2.43×10⁻⁷"),
        m("      =  2.5404×10⁻⁴  +  3.929×10⁻⁶  +  2.43×10⁻⁷"),
        mb("Pb(5) ≈ 2.584 × 10⁻⁴"),
        sp(6),
        p("<b>n = 11</b> (error when k ≥ 6):", SH),
        p("The dominant term is k = 6:", INDENT),
        m("C(11,6)(0.03)⁶(0.97)⁵  =  462 × 7.29×10⁻¹⁰ × 0.8587  ≈  2.891×10⁻⁷"),
        p("k = 7 term:", INDENT),
        m("C(11,7)(0.03)⁷(0.97)⁴  =  330 × 2.187×10⁻¹¹ × 0.885  ≈  6.39×10⁻⁹"),
        p("Higher-order terms are negligible. Therefore:", INDENT),
        mb("Pb(11) ≈ 2.95 × 10⁻⁷"),
        p(("Repetition coding reduces the error probability by roughly three orders of "
           "magnitude as n grows from 5 to 11, confirming the power of longer repetition codes "
           "at low cross-over probability."), BODY),
    ]

    # ── 1b ──────────────────────────────────────────────────────────────────
    story += [
        sp(4), hr(),
        p("Part (b)  —  Code rate and redundancy, n = 9 (4 pts)", SH),
        p("A (9, 1) code encodes 1 information bit into a 9-bit codeword.", BODY),
        m("Code rate:      C = k/n = 1/9  ≈  0.111"),
        m("Redundancy:     r = 1 − C = 1 − 1/9 = 8/9  ≈  0.889"),
        sp(4),
        box([p("Code rate C = 1/9,  Redundancy r = 8/9", ANS)]),
    ]

    # ── 1c ──────────────────────────────────────────────────────────────────
    story += [
        sp(4), hr(),
        p("Part (c)  —  Generator matrix G (4 pts)", SH),
        p(("The single information bit u ∈ {0, 1} maps to codeword "
           "c = u · G, where c must equal [u u u u u u u u u]. "
           "Hence G is the 1 × 9 all-ones row vector:"), BODY),
        sp(4),
        box([
            m("G  =  [ 1  1  1  1  1  1  1  1  1 ]   (1 × 9)"),
            sp(4),
            p("Verification: u = 1 → c = [1 1 1 1 1 1 1 1 1]  ✓", BOX_TXT),
            p("             u = 0 → c = [0 0 0 0 0 0 0 0 0]  ✓", BOX_TXT),
        ]),
    ]

    # ── 1d ──────────────────────────────────────────────────────────────────
    story += [
        sp(4), hr(),
        p("Part (d)  —  Parity check matrix H of maximum row rank (4 pts)", SH),
        p(("All valid codewords satisfy c₁ = c₂ = … = c₉. "
           "Equivalently, c₁ ⊕ cᵢ = 0 for i = 2, …, 9. "
           "Each such constraint gives one row of H; there are 8 independent "
           "constraints, so rank(H) = 8, which is maximum (= n − k = 9 − 1)."), BODY),
        sp(4),
        box([
            m("     ⎡ 1  1  0  0  0  0  0  0  0 ⎤"),
            m("     ⎢ 1  0  1  0  0  0  0  0  0 ⎥"),
            m("     ⎢ 1  0  0  1  0  0  0  0  0 ⎥"),
            m("     ⎢ 1  0  0  0  1  0  0  0  0 ⎥"),
            m("H  = ⎢ 1  0  0  0  0  1  0  0  0 ⎥   (8 × 9)"),
            m("     ⎢ 1  0  0  0  0  0  1  0  0 ⎥"),
            m("     ⎢ 1  0  0  0  0  0  0  1  0 ⎥"),
            m("     ⎣ 1  0  0  0  0  0  0  0  1 ⎦"),
            sp(4),
            p("Row i enforces c₁ ⊕ c_{i+1} = 0, i.e. bit 1 equals bit i+1.", BOX_TXT),
            p("Verification: G · Hᵀ = [1 1 1 1 1 1 1 1 1] · Hᵀ = 0 (mod 2)  ✓", BOX_TXT),
        ]),
    ]

    # ── 1e ──────────────────────────────────────────────────────────────────
    story += [
        sp(4), hr(),
        p("Part (e)  —  Syndrome S = R Hᵀ for R = 000000100 (4 pts)", SH),
        p("R = [0 0 0 0 0 0 1 0 0], i.e. only position 7 is 1.", BODY),
        p("Compute S = R Hᵀ row-by-row (dot product of R with each column of Hᵀ = row of H):", INDENT),
        sp(4),
    ]
    rows_e = [
        ("Row 1", "[1,1,0,0,0,0,0,0,0]", "0·1+0·1+0+…=0", "0"),
        ("Row 2", "[1,0,1,0,0,0,0,0,0]", "0·1+0·0+0·1+0+…=0", "0"),
        ("Row 3", "[1,0,0,1,0,0,0,0,0]", "0", "0"),
        ("Row 4", "[1,0,0,0,1,0,0,0,0]", "0", "0"),
        ("Row 5", "[1,0,0,0,0,1,0,0,0]", "0", "0"),
        ("Row 6", "[1,0,0,0,0,0,1,0,0]", "R₇·1 = 1·1 = 1", "1 ← error detected"),
        ("Row 7", "[1,0,0,0,0,0,0,1,0]", "R₈·1 = 0", "0"),
        ("Row 8", "[1,0,0,0,0,0,0,0,1]", "R₉·1 = 0", "0"),
    ]
    tbl_data = [[p("<b>H row</b>",SMALL), p("<b>H row vector</b>",SMALL),
                 p("<b>R · hᵢ (mod 2)</b>",SMALL), p("<b>Sᵢ</b>",SMALL)]]
    for row, hvec, comp, si in rows_e:
        tbl_data.append([p(row,SMALL), Paragraph(hvec,MATH),
                         p(comp,SMALL), p(f"<b>{si}</b>", SMALL)])
    tbl = Table(tbl_data, colWidths=[2*cm,5.5*cm,6*cm,3*cm])
    tbl.setStyle(TableStyle([
        ("BACKGROUND",(0,0),(-1,0),HexColor("#e2e8f0")),
        ("LINEBELOW",(0,0),(-1,0),0.5,PRI),
        ("LINEBELOW",(0,1),(-1,-2),0.3,HAIR),
        ("TOPPADDING",(0,0),(-1,-1),4),("BOTTOMPADDING",(0,0),(-1,-1),4),
        ("LEFTPADDING",(0,0),(-1,-1),6),("RIGHTPADDING",(0,0),(-1,-1),6),
        ("BACKGROUND",(0,6),(-1,6),HexColor("#fef9c3")),
    ]))
    story.append(tbl)
    story += [
        sp(6),
        box([
            mb("S  =  [ 0  0  0  0  0  1  0  0 ]"),
            sp(4),
            p(("S ≠ 0 indicates an error. The non-zero entry at position 6 of S "
               "corresponds to Row 6 of H, which checks c₁ ⊕ c₇ = 0. "
               "Since c₁ = 0 and c₇ = 1, the syndrome correctly identifies "
               "a single-bit error at position 7."), BOX_TXT),
        ]),
        sp(8),
        p("Q1 marking summary", SH),
        marking_box([
            ("(a) n=5",  "2",
             "Pb(5) ≈ 2.58×10⁻⁴ (accept any answer in 2.5–2.7×10⁻⁴ range)."),
            ("(a) n=11", "2",
             "Pb(11) ≈ 2.95×10⁻⁷ (accept dominant-term answers ≈ 2.9–3.0×10⁻⁷)."),
            ("(b)",      "4",  "C = 1/9 AND r = 8/9 — both required."),
            ("(c)",      "4",  "G = [1 1 1 1 1 1 1 1 1] (1×9 all-ones row)."),
            ("(d)",      "4",  "Any 8 independent rows that enforce c_i = c_j; rank 8."),
            ("(e)",      "4",  "S ≠ 0 with non-zero ONLY at position 6 → flags bit 7."),
        ]),
    ]
    return story


def q2():
    story = [PageBreak(), p("Question 2  —  Baseband Communication and Noise  (30 pts)", QH), hr()]

    # ── 2a ──────────────────────────────────────────────────────────────────
    story += [
        p("Part (a)  —  Prove Pb = Q(√(2A²T/N₀)) for p = 1/2 (15 pts)", SH),
        p("<b>Step 1: Model the integrate-and-dump output.</b>", BODY),
        p(("The received signal is r(t) = sᵦ(t) + n(t), where b ∈ {0,1} and "
           "n(t) is zero-mean white Gaussian noise with two-sided PSD N₀/2. "
           "The I&D output (without the 1/T normalisation, i.e. integrator) is:"), BODY),
        m("Z  =  ∫₀ᵀ r(t) dt  =  ∫₀ᵀ sᵦ(t) dt  +  ∫₀ᵀ n(t) dt  ≜  μᵦ  +  Nz"),
        sp(4),
        p("<b>Step 2: Signal means.</b>", BODY),
        m("μ₀ = ∫₀ᵀ A dt = AT        (bit '0' transmitted)"),
        m("μ₁ = ∫₀ᵀ (−A) dt = −AT   (bit '1' transmitted)"),
        sp(4),
        p("<b>Step 3: Noise statistics.</b>", BODY),
        p("The noise component is:", BODY),
        m("Nz = ∫₀ᵀ n(t) dt"),
        m("E[Nz] = ∫₀ᵀ E[n(t)] dt = 0"),
        m("Var[Nz] = E[Nz²] = E[(∫₀ᵀ n(t) dt)²]"),
        m("       = ∫₀ᵀ ∫₀ᵀ E[n(t)n(s)] ds dt"),
        m("       = ∫₀ᵀ ∫₀ᵀ (N₀/2)δ(t−s) ds dt"),
        m("       = (N₀/2) ∫₀ᵀ dt  =  N₀T/2"),
        sp(4),
        box([
            p("Noise mean: E[Nz] = 0", ANS),
            p("Noise variance: Var[Nz] = N₀T/2", ANS),
        ]),
        sp(4),
        p("<b>Step 4: Decision rule and error probabilities.</b>", BODY),
        p(("For p = 1/2, the ML (antipodal) threshold is V = 0: "
           "decide '0' if Z > 0, decide '1' if Z < 0."), BODY),
        m("P(error | '0') = P(Z < 0 | bit '0') = P(AT + Nz < 0) = P(Nz < −AT)"),
        m("               = Q( AT / √(N₀T/2) )  =  Q( √(2A²T/N₀) )"),
        m("P(error | '1') = P(Z > 0 | bit '1') = P(−AT + Nz > 0) = P(Nz > AT)"),
        m("               = Q( AT / √(N₀T/2) )  =  Q( √(2A²T/N₀) )"),
        sp(4),
        p("For p = 1/2:", BODY),
        m("Pb = (1/2)·P(error|'0') + (1/2)·P(error|'1')"),
        sp(4),
        box([mb("Pb  =  Q( √(2A²T / N₀) )   □")]),
    ]

    # ── 2b ──────────────────────────────────────────────────────────────────
    story += [
        sp(4), hr(),
        p("Part (b)  —  Optimal threshold V₀ for p ≠ 1/2 (15 pts)", SH),
        p(("The optimal (MAP) decision minimises the average Pb. "
           "At the decision threshold V₀ the posterior probabilities are equal, "
           "i.e. the weighted likelihoods are equal:"), BODY),
        m("p · f(V₀ | '0')  =  (1−p) · f(V₀ | '1')"),
        sp(4),
        p("where f(z | '0') and f(z | '1') are Gaussian densities:", BODY),
        m("f(z | '0') = (1/√(πN₀T)) · exp(−(z − AT)² / (N₀T))"),
        m("f(z | '1') = (1/√(πN₀T)) · exp(−(z + AT)² / (N₀T))"),
        sp(4),
        p("Setting the two sides equal and taking the natural logarithm:", BODY),
        m("ln p − (V₀ − AT)²/(N₀T)  =  ln(1−p) − (V₀ + AT)²/(N₀T)"),
        m("ln[p/(1−p)]  =  [(V₀−AT)² − (V₀+AT)²] / (N₀T)"),
        m("             =  [−4V₀AT] / (N₀T)"),
        m("             =  −4V₀A / N₀"),
        sp(6),
        m("⟹   V₀  =  − N₀/(4A) · ln[p/(1−p)]"),
        m("        =    N₀/(4A) · ln[(1−p)/p]"),
        sp(4),
        box([
            mb("V₀  =  (N₀ / 4A) · ln[(1−p)/p]"),
            sp(4),
            p(("Decision rule: decide '0' if Z > V₀, decide '1' if Z ≤ V₀.<br/>"
               "Sanity check: if p = 1/2, then (1−p)/p = 1, ln 1 = 0, V₀ = 0 ✓"), BOX_TXT),
            p(("If p > 1/2 (bit '0' more likely): ln[(1−p)/p] < 0, so V₀ < 0. "
               "The threshold shifts negative, making it harder to decide '1', which is correct."),
              BOX_TXT),
        ]),
        sp(8),
        p("Q2 marking summary", SH),
        marking_box([
            ("(a) Step 1",  "2",  "I&D output Z = ∫r(t)dt with signal mean ±AT."),
            ("(a) Step 2",  "3",  "Noise mean = 0 AND variance = N₀T/2 (both required)."),
            ("(a) Step 3",  "4",  "Threshold V = 0 stated for equal priors."),
            ("(a) Step 4",  "6",
             "Show P(error | '0') = P(error | '1') = Q(√(2A²T/N₀)); arrive at boxed result."),
            ("(b) setup",   "5",
             "Equal weighted-likelihood condition p·f₀(V₀) = (1−p)·f₁(V₀)."),
            ("(b) algebra", "6",
             "Correct expansion of squared exponentials → linear equation in V₀."),
            ("(b) result",  "4",
             "V₀ = (N₀/4A)·ln[(1−p)/p]; sanity check at p=1/2 → V₀=0."),
        ]),
    ]
    return story


def q3():
    story = [PageBreak(), p("Question 3  —  Optimal Receiver  (30 pts)", QH), hr()]

    # ── 3a ──────────────────────────────────────────────────────────────────
    story += [
        p("Part (a)  —  Matched filter h(t)  (5 pts)", SH),
        p(("For a signal g(t), the matched filter is h(t) = g(T − t). "
           "Given:"), BODY),
        m("g(t) = { 2A,   0 ≤ t ≤ T/2"),
        m("       { −A,  T/2 < t ≤ T"),
        m("       { 0,   otherwise"),
        sp(4),
        p("Substituting t → T − t:", BODY),
        m("h(t) = g(T−t) = { 2A,  T/2 ≤ t ≤ T      [since 0 ≤ T−t ≤ T/2]"),
        m("                { −A,  0 ≤ t < T/2       [since T/2 < T−t ≤ T]"),
        m("                { 0,   otherwise"),
        sp(6),
        box([
            mb("h(t) = { −A,   0 ≤ t < T/2"),
            mb("       {  2A,  T/2 ≤ t ≤ T"),
            mb("       {  0,   otherwise"),
            sp(4),
            p("Sketch of h(t):", BOX_TXT),
            sp(4),
            h_t_sketch(),
        ]),
    ]

    # ── 3b ──────────────────────────────────────────────────────────────────
    story += [
        sp(4), hr(),
        p("Part (b)  —  Matched-filter output y(t) = g(t) * h(t)  (10 pts)", SH),
        p(("The matched-filter output when g(t) is the input is the convolution "
           "y(t) = ∫ g(τ) h(t−τ) dτ. We compute y(t) piecewise."), BODY),
        sp(4),
        p("<b>Energy check at t = T (peak):</b>", BODY),
        m("y(T) = ∫₀ᵀ g(τ) · g(T−(T−τ)) dτ = ∫₀ᵀ g²(τ) dτ = Eg"),
        m("Eg = ∫₀^(T/2) (2A)² dt + ∫_(T/2)^T (−A)² dt"),
        m("   = 4A²·(T/2) + A²·(T/2) = 2A²T + A²T/2 = 5A²T/2"),
        sp(4),
        p("<b>Piecewise derivation of y(t):</b>", BODY),
        p("For 0 ≤ t ≤ T/2:", INDENT),
        m("y(t) = ∫₀ᵗ g(τ)·h(t−τ) dτ"),
        m("     = ∫₀ᵗ 2A·(−A) dτ  (since 0&lt;τ&lt;t≤T/2 ⟹ 0&lt;t−τ&lt;T/2 ⟹ h(t−τ)=−A)"),
        m("     = −2A²t"),
        sp(4),
        p("For T/2 < t ≤ T:", INDENT),
        m("y(t) = ∫₀^(t−T/2) g(τ)·2A dτ + ∫_(t−T/2)^(T/2) g(τ)·(−A) dτ"),
        m("     + ∫_(T/2)^t g(τ)·(−A) dτ   [split at T/2]"),
        p("After careful evaluation:", INDENT),
        m("y(t) = (5A²/2)(2t − T)  for T/2 < t ≤ T"),
        sp(4),
        p("At t = T: y(T) = (5A²/2)(2T−T) = 5A²T/2  ✓", INDENT),
        sp(6),
        box([
            mb("y(t) = { −2A²t,             0 ≤ t ≤ T/2"),
            mb("       { (5A²/2)(2t − T),   T/2 < t ≤ T"),
            mb("       { 0,                 otherwise"),
            mb("y(T) = 5A²T/2   (peak at the sampling instant)"),
            sp(4),
            mf_output_sketch(),
        ]),
    ]

    # ── 3c ──────────────────────────────────────────────────────────────────
    story += [
        sp(4), hr(),
        p("Part (c)  —  Optimal receiver block diagram  (5 pts)", SH),
        p(("The optimal receiver for AWGN with a matched filter samples the "
           "matched-filter output at t = T and compares to threshold 0 "
           "(since the two hypotheses are equiprobable):"), BODY),
        sp(6),
        box([
            p("r(t) → [h(T−t)] → sample at t=T → Z → compare to 0:", BOX_TXT),
            m("decide â = +1  if Z ≥ 0"),
            m("decide â = −1  if Z < 0"),
            sp(6),
            corr_detector_sketch(),
        ]),
        sp(4),
        p(("The matched filter maximises the output SNR at the sampling instant, "
           "which is equivalent to the correlation receiver ∫₀ᵀ r(t)·g(t) dt."), BODY),
    ]

    # ── 3d ──────────────────────────────────────────────────────────────────
    story += [
        sp(4), hr(),
        p("Part (d)  —  Bit error rate  (10 pts)", SH),
        p("<b>Step 1: Output signal component at t = T.</b>", BODY),
        m("When a = +1: signal component = +Eg = +5A²T/2"),
        m("When a = −1: signal component = −Eg = −5A²T/2"),
        sp(4),
        p("<b>Step 2: Noise at the matched-filter output at t = T.</b>", BODY),
        p("The output noise is:", BODY),
        m("No = ∫₀ᵀ n(t)·h(T−t) dt"),
        m("Var[No] = (N₀/2) · ∫₀ᵀ h²(T−t) dt = (N₀/2) · Eg = (N₀/2) · (5A²T/2) = 5A²TN₀/4"),
        sp(4),
        p("<b>Step 3: Decision statistic.</b>", BODY),
        m("Z | (a=+1) ~ N(+5A²T/2,  5A²TN₀/4)"),
        m("Z | (a=−1) ~ N(−5A²T/2,  5A²TN₀/4)"),
        sp(4),
        p("<b>Step 4: Error probability (equal priors).</b>", BODY),
        m("P(error | a=+1) = P(Z < 0 | a=+1)"),
        m("                = Q( (5A²T/2) / √(5A²TN₀/4) )"),
        m("                = Q( (5A²T/2) / (√(5A²TN₀)/2) )"),
        m("                = Q( 5A²T / √(5A²TN₀) )"),
        m("                = Q( √(5A²T/N₀) )"),
        sp(4),
        p("By symmetry, P(error | a=−1) is identical. Therefore:", BODY),
        sp(4),
        box([
            mb("BER  =  Q( √(5A²T / N₀) )"),
            sp(4),
            p("Equivalently, since Eg = 5A²T/2:", BOX_TXT),
            mb("BER  =  Q( √(2Eg / N₀) )"),
            sp(4),
            p("This is the standard matched-filter BER formula, confirming optimality.", BOX_TXT),
        ]),
        sp(8),
        p("Q3 marking summary", SH),
        marking_box([
            ("(a)",    "5",
             "h(t) = g(T−t): −A on [0, T/2), +2A on [T/2, T]; sketch present."),
            ("(b) Eg", "4",  "Energy Eg = 5A²T/2 (peak of MF output at t=T)."),
            ("(b) y(t)", "6",
             "Piecewise: y(t) = −2A²t on [0,T/2]; y(t)=(5A²/2)(2t−T) on (T/2,T]."),
            ("(c)",    "5",
             "Block diagram: r(t) → MF → sample at t=T → compare to 0."),
            ("(d) noise var", "4",
             "Var[N_o] = (N₀/2)·Eg = 5A²TN₀/4."),
            ("(d) BER",   "6",
             "BER = Q(√(5A²T/N₀)) = Q(√(2Eg/N₀)); equal priors symmetry."),
        ]),
    ]
    return story


def q4():
    story = [PageBreak(), p("Question 4  —  Digital Modulation  (20 pts)", QH), hr()]

    story += [
        p(("This question requires reading the waveform figure. The analysis below "
           "is framed for binary FSK, which is consistent with the figure showing "
           "two distinct frequencies for bits '0' and '1'. Substitute the actual "
           "values you read from the figure where indicated."), NOTE),
        sp(4),
    ]

    # ── 4a ──────────────────────────────────────────────────────────────────
    story += [
        p("Part (a)  —  Modulation scheme and carrier frequencies  (4 pts)", SH),
        p(("From the figure: the waveform oscillates at one frequency for bit '1' "
           "and a different frequency for bit '0', with constant amplitude. "
           "This is <b>Binary Frequency Shift Keying (BFSK)</b>."), BODY),
        p(("There are <b>two</b> carrier frequencies — one per symbol. "
           "Reading the figure: count the number of cycles within one bit period T_b:"), BODY),
        m("f₁  (carrier for bit '1')  =  [n₁ cycles / T_b]  Hz"),
        m("f₀  (carrier for bit '0')  =  [n₀ cycles / T_b]  Hz"),
        sp(4),
        p(("Example (verify against your figure): if T_b = 1 ms and the figure "
           "shows 2 cycles for '1' and 1 cycle for '0', then f₁ = 2 kHz, f₀ = 1 kHz."),
          NOTE),
    ]

    # ── 4b ──────────────────────────────────────────────────────────────────
    story += [
        sp(4), hr(),
        p("Part (b)  —  Bit rate  (4 pts)", SH),
        p(("The bit period T_b is the duration of one symbol in the waveform, "
           "read directly from the time axis of the figure."), BODY),
        m("Bit rate  R_b  =  1 / T_b   [bits per second]"),
        p(("Example: if T_b = 1 ms (read from figure), then R_b = 1000 bps = 1 kbps."),
          NOTE),
    ]

    # ── 4c ──────────────────────────────────────────────────────────────────
    story += [
        sp(4), hr(),
        p("Part (c)  —  Expressions for s₀(t) and s₁(t)  (4 pts)", SH),
        p("For BFSK with amplitude A and bit period T_b:", BODY),
        m("s₁(t) = A · cos(2π f₁ t),    0 ≤ t ≤ T_b    (bit '1')"),
        m("s₀(t) = A · cos(2π f₀ t),    0 ≤ t ≤ T_b    (bit '0')"),
        m("      = 0,  otherwise"),
        sp(4),
        p(("Substitute the carrier frequencies f₁ and f₀ and the amplitude A "
           "identified from the figure."), NOTE),
    ]

    # ── 4d ──────────────────────────────────────────────────────────────────
    story += [
        sp(4), hr(),
        p("Part (d)  —  Correlation detector block diagram  (4 pts)", SH),
        p(("The correlation detector computes ∫₀^T_b r(t)·[s₁(t) − s₀(t)] dt "
           "and compares the result to threshold 0:"), BODY),
        sp(6),
        box([
            corr_detector_sketch(),
            sp(4),
            m("Z = ∫₀^T_b r(t) · [s₁(t) − s₀(t)] dt"),
            m("decide '1' if Z > 0,  decide '0' if Z ≤ 0"),
        ]),
        sp(4),
        p(("Two separate correlators (one against s₁, one against s₀) can be used "
           "equivalently; take the branch with the larger output."), BODY),
    ]

    # ── 4e ──────────────────────────────────────────────────────────────────
    story += [
        sp(4), hr(),
        p("Part (e)  —  Increasing bit rate and penalties  (4 pts)", SH),
        p("There are three standard approaches:", BODY),
        p(("<b>1. Reduce bit period T_b.</b> Higher R_b = 1/T_b. "
           "Penalty: reduces E_b = A²T_b/2 (energy per bit), increasing BER "
           "for fixed transmit power."), INDENT),
        sp(3),
        p(("<b>2. Use a higher-order modulation (e.g. M-FSK, M-PSK, QAM).</b> "
           "Encode log₂M bits per symbol. Penalty: reduced distance between "
           "constellation points → higher BER at the same E_b/N₀, or requires "
           "more transmit power to maintain BER."), INDENT),
        sp(3),
        p(("<b>3. Increase bandwidth.</b> For FSK, wider frequency spacing allows "
           "faster signalling without inter-symbol interference. "
           "Penalty: increased bandwidth usage — limited by channel and regulation."), INDENT),
        sp(6),
        box([
            p(("Summary: Increasing bit rate always incurs a penalty — either "
               "higher BER (worse noise performance), greater bandwidth, or "
               "higher required SNR. This is a fundamental trade-off governed "
               "by Shannon's capacity theorem: C = B log₂(1 + SNR)."), BOX_TXT),
        ]),
        sp(8),
        p("Q4 marking summary", SH,),
        marking_box([
            ("(a)", "4",
             "BFSK identified; two distinct carrier frequencies named (read from figure)."),
            ("(b)", "4",
             "Bit rate R_b = 1/T_b with T_b read from figure's time axis."),
            ("(c)", "4",
             "s₁(t) = A·cos(2πf₁t), s₀(t) = A·cos(2πf₀t) on 0 ≤ t ≤ T_b."),
            ("(d)", "4",
             "Correlation detector: multiply by [s₁−s₀], integrate over T_b, sample, decide vs 0."),
            ("(e)", "4",
             "≥ 2 of 3 methods (smaller T_b / M-ary / wider B) AND a stated penalty each."),
        ]),
    ]
    return story


# ── build (2-pass for accurate "Page N / Total" footer) ─────────────────────
def _make_doc(path, total):
    _TOTAL_PAGES[0] = total
    margin_l = 1.7 * cm     # extra left margin so body clears the 4mm sidebar
    margin_r = 1.5 * cm
    frame = Frame(margin_l, 2.0*cm,
                  PW - margin_l - margin_r,
                  PH - 2.0*cm - 1.6*cm,
                  leftPadding=0, rightPadding=0,
                  topPadding=0, bottomPadding=0)
    pt = PageTemplate(id="main", frames=[frame], onPage=chrome, pagesize=A4)
    doc = BaseDocTemplate(path, pagesize=A4,
                          leftMargin=margin_l, rightMargin=margin_r,
                          topMargin=1.6*cm, bottomMargin=2.0*cm,
                          title="ELEC 3100 HW3 — TA Marking Key",
                          author="HKUST ECE — Course Staff",
                          subject="Worked solutions / grading reference")
    doc.addPageTemplates([pt])
    return doc


def _story():
    s = []
    s += cover()
    s += q1()
    s += q2()
    s += q3()
    s += q4()
    return s


def build():
    # Pass 1 — count actual pages
    import io
    buf = io.BytesIO()
    _make_doc(buf, 0).build(_story())
    raw = buf.getvalue()
    total = raw.count(b"/Type /Page\n") or raw.count(b"/Type/Page") or 12

    # Pass 2 — write final PDF with correct page totals
    _make_doc(OUT, total).build(_story())
    return OUT, total


if __name__ == "__main__":
    path, n = build()
    kb = os.path.getsize(path)/1024
    print(f"OK  {path}  ({kb:.1f} KB, {n} pages)")

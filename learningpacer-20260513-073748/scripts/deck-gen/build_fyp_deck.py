"""LearningPacer FYP demo deck v2 — A4 landscape, A++++++ design.
Claude warm-paper aesthetic · teal accent · Times-Bold serif display
Output: .local/fyp-deck/LearningPacer_FYP_Demo_Deck.pdf
Run:    python3 scripts/deck-gen/build_fyp_deck.py
"""
import os, math

# ── Unicode font registration (must happen before any style uses the name) ──
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

_FD = "/usr/share/fonts/truetype/dejavu"
pdfmetrics.registerFont(TTFont("DV",    f"{_FD}/DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("DV-B",  f"{_FD}/DejaVuSans-Bold.ttf"))
pdfmetrics.registerFont(TTFont("DVM",   f"{_FD}/DejaVuSansMono.ttf"))
pdfmetrics.registerFontFamily("DV", normal="DV", bold="DV-B",
                               italic="DV", boldItalic="DV-B")

from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.lib.colors import HexColor, white, black
from reportlab.lib.units import cm, mm
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageTemplate, NextPageTemplate, PageBreak,
    Paragraph, Spacer, Table, TableStyle, KeepInFrame
)
from reportlab.platypus.flowables import Flowable
from reportlab.graphics.shapes import (
    Drawing, Rect, String, Line, Circle, PolyLine, Polygon
)

# ── palette ─────────────────────────────────────────────────────────────────
PAPER  = HexColor("#faf6ee")   # warm cream
INK    = HexColor("#1e293b")   # deep slate
INK2   = HexColor("#475569")   # secondary
MUTED  = HexColor("#94a3b8")   # caption / footer
HAIR   = HexColor("#cbd5e1")   # hairlines
TEAL   = HexColor("#0f766e")   # primary — teal-700
CYAN   = HexColor("#0891b2")   # secondary — cyan-600
AMBER  = HexColor("#b45309")   # risk / warn
RED    = HexColor("#b91c1c")   # danger
SOFT   = HexColor("#efe9da")   # card fill
SOFT2  = HexColor("#e6dfcc")   # table stripe

PAGE = landscape(A4)
PW, PH = PAGE

OUT_DIR  = ".local/fyp-deck"
OUT_PATH = os.path.join(OUT_DIR, "LearningPacer_FYP_Demo_Deck.pdf")
os.makedirs(OUT_DIR, exist_ok=True)

# ── typography ───────────────────────────────────────────────────────────────
# Serif display (Times built-in, always available)
SRB = "Times-Bold"
SRI = "Times-Italic"
SR  = "Times-Roman"
# Sans body — DejaVu (Unicode)
SN  = "DV"
SNB = "DV-B"

SS = getSampleStyleSheet()

def _ps(name, **kw):
    base = kw.pop("base", "Normal")
    d = dict(fontName=SN, fontSize=10, leading=14,
             textColor=INK, alignment=TA_LEFT, spaceAfter=3)
    d.update(kw)
    return ParagraphStyle(name, parent=SS[base], **d)

EYEBROW     = _ps("eyebrow",  fontName=SNB, fontSize=8,  leading=10,
                  textColor=TEAL, spaceAfter=5)
COVER_BRAND = _ps("covbrand", fontName=SNB, fontSize=9,  leading=11,
                  textColor=TEAL, spaceAfter=4)
COVER_TITLE = _ps("covtitle", fontName=SRB, fontSize=56, leading=62,
                  textColor=INK,  spaceAfter=12)
COVER_SUB   = _ps("covsub",   fontName=SRI, fontSize=18, leading=26,
                  textColor=INK2, spaceAfter=18)
COVER_META  = _ps("covmeta",  fontName=SN,  fontSize=10, leading=15,
                  textColor=INK2, spaceAfter=2)
H_TITLE     = _ps("htitle",   fontName=SRB, fontSize=28, leading=34,
                  textColor=INK,  spaceAfter=6,  base="Heading1")
H_SUB       = _ps("hsub",     fontName=SN,  fontSize=13, leading=19,
                  textColor=INK2, spaceAfter=10)
H_SECTION   = _ps("hsec",     fontName=SNB, fontSize=11, leading=14,
                  textColor=TEAL, spaceAfter=4)
BODY        = _ps("body",     fontName=SN,  fontSize=11, leading=16,
                  spaceAfter=4)
BODY_LG     = _ps("bodylg",   fontName=SN,  fontSize=13, leading=20,
                  spaceAfter=4)
BODY_MUTED  = _ps("bodym",    fontName=SN,  fontSize=10, leading=14,
                  textColor=INK2, spaceAfter=3)
BULLET      = _ps("bul",      fontName=SN,  fontSize=11, leading=15,
                  leftIndent=12,  spaceAfter=3)
SMALL       = _ps("small",    fontName=SN,  fontSize=9,  leading=12,
                  textColor=MUTED)
SMALL_INK   = _ps("smink",    fontName=SN,  fontSize=9,  leading=12,
                  textColor=INK2)
QUOTE       = _ps("quote",    fontName=SRI, fontSize=14, leading=21,
                  textColor=INK,  leftIndent=14, rightIndent=14,
                  spaceBefore=8,  spaceAfter=8)
ANS         = _ps("ans",      fontName=SNB, fontSize=10, leading=14,
                  textColor=TEAL, leftIndent=14, spaceAfter=3)

# stat styles — big number, label, desc
STAT_NUM  = _ps("stnum", fontName=SRB, fontSize=52, leading=56,
                textColor=TEAL, spaceAfter=2)
STAT_LBL  = _ps("stlbl", fontName=SNB, fontSize=10, leading=13,
                textColor=INK,  spaceAfter=2)
STAT_DESC = _ps("stdesc",fontName=SN,  fontSize=9,  leading=12,
                textColor=INK2, spaceAfter=0)

# closing hero
H_HERO = _ps("hero", fontName=SRB, fontSize=40, leading=46,
              textColor=INK, spaceAfter=8)

# ── page chrome ──────────────────────────────────────────────────────────────
_TOTAL_PAGES = [0]   # mutable so chrome_normal can read it after first pass

def chrome_normal(canvas, doc):
    canvas.saveState()
    # cream background
    canvas.setFillColor(PAPER)
    canvas.rect(0, 0, PW, PH, fill=1, stroke=0)
    # left accent bar — 2.5mm teal strip (visual rhythm)
    canvas.setFillColor(TEAL)
    canvas.rect(0, 0, 2.5 * mm, PH, fill=1, stroke=0)
    # top hairline
    canvas.setStrokeColor(HAIR); canvas.setLineWidth(0.3)
    canvas.line(1.4*cm, PH - 1.25*cm, PW - 1.2*cm, PH - 1.25*cm)
    # bottom hairline
    canvas.line(1.4*cm, 1.3*cm, PW - 1.2*cm, 1.3*cm)
    # header text
    canvas.setFont(SN, 8); canvas.setFillColor(MUTED)
    canvas.drawString(1.4*cm, PH - 0.95*cm,
                      "LearningPacer  ·  ELEC3120 Virtual TA")
    canvas.drawRightString(PW - 1.2*cm, PH - 0.95*cm,
                           "HKUST  ·  Final-Year Project  ·  2025\u20132026")
    # footer
    canvas.drawString(1.4*cm, 0.85*cm,
                      "Confidential demo material  ·  Dept of ECE")
    n_total = _TOTAL_PAGES[0] or "?"
    canvas.drawRightString(PW - 1.2*cm, 0.85*cm,
                           f"{doc.page:02d} / {n_total:02d}"
                           if isinstance(n_total, int) else f"{doc.page}")
    canvas.restoreState()


def chrome_cover(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(PAPER)
    canvas.rect(0, 0, PW, PH, fill=1, stroke=0)
    # full-height teal sidebar — 1.8cm wide
    canvas.setFillColor(TEAL)
    canvas.rect(0, 0, 1.8*cm, PH, fill=1, stroke=0)
    # thin bottom rule
    canvas.setStrokeColor(HAIR); canvas.setLineWidth(0.3)
    canvas.line(2.2*cm, 1.4*cm, PW - 1.4*cm, 1.4*cm)
    canvas.setFont(SN, 8); canvas.setFillColor(MUTED)
    canvas.drawString(2.2*cm, 0.9*cm,
                      "Hong Kong University of Science and Technology"
                      "  ·  Department of Electronic & Computer Engineering")
    canvas.drawRightString(PW - 1.4*cm, 0.9*cm, "FYP DEMO  ·  v2.0")
    canvas.restoreState()


# ── custom flowables ─────────────────────────────────────────────────────────
class HRule(Flowable):
    def __init__(self, width, color=HAIR, thickness=0.4, space=4):
        super().__init__()
        self.width = width
        self.color = color
        self.thickness = thickness
        self.space = space
        self.height = thickness + space

    def draw(self):
        self.canv.setStrokeColor(self.color)
        self.canv.setLineWidth(self.thickness)
        self.canv.line(0, self.space / 2, self.width, self.space / 2)


class TealBar(Flowable):
    """Thin teal left-border accent block beside a paragraph."""
    def __init__(self, height=40, width=3, color=TEAL, gap=10):
        super().__init__()
        self.height = height
        self.width = width + gap
        self.bar_w = width
        self.color = color

    def draw(self):
        self.canv.setFillColor(self.color)
        self.canv.rect(0, 0, self.bar_w, self.height, fill=1, stroke=0)


# ── diagrams ─────────────────────────────────────────────────────────────────
def arch_diagram(width=740, height=340):
    d = Drawing(width, height)
    d.add(String(0, height - 12, "System architecture  —  request flow",
                 fontSize=9, fontName=SNB, fillColor=TEAL))

    def node(x, y, w, h, label, sub="", fill=SOFT, stroke=TEAL):
        d.add(Rect(x, y, w, h, fillColor=fill, strokeColor=stroke,
                   strokeWidth=0.7, rx=4, ry=4))
        cy = y + h / 2 + (5 if sub else 0)
        d.add(String(x + w/2, cy, label, fontSize=10, fontName=SNB,
                     fillColor=INK, textAnchor="middle"))
        if sub:
            d.add(String(x + w/2, y + h/2 - 8, sub, fontSize=8, fontName=SN,
                         fillColor=INK2, textAnchor="middle"))

    def arr(x1, y1, x2, y2, dash=None, col=TEAL):
        kw = dict(strokeColor=col, strokeWidth=1.0)
        if dash:
            kw["strokeDashArray"] = dash
        d.add(Line(x1, y1, x2, y2, **kw))
        ang = math.atan2(y2 - y1, x2 - x1)
        ah = 5
        d.add(Polygon([x2, y2,
                       x2 - ah*math.cos(ang-0.45), y2 - ah*math.sin(ang-0.45),
                       x2 - ah*math.cos(ang+0.45), y2 - ah*math.sin(ang+0.45)],
                      fillColor=col, strokeColor=col))

    # top row — request chain
    node( 10, 235, 120, 48, "Browser",      "Next.js 16 / React 19")
    node(185, 235, 125, 48, "Edge API",     "Route Handlers")
    node(370, 235, 140, 48, "Tutor Engine", "prompt + RAG + tools")
    node(568, 280,  95, 34, "Anthropic",    "claude-sonnet-4")
    node(568, 235,  95, 34, "OpenRouter",   "fallback fleet")

    # bottom row — data
    node( 10, 130, 120, 48, "Supabase",   "auth · Postgres · RLS")
    node(185, 130, 125, 48, "RAG Index",  "lecture PDFs · vectors")
    node(370, 130, 140, 48, "Tool Belt",  "subnet · diagram · search")
    node(568, 130,  95, 48, "Storage",    "user uploads")

    # feature banner
    node( 10,  20, 660, 52,
          "Features delivered",
          "Tutor · Mock exams · Quiz · Pomodoro · Stats · Flashcards · Glossary · Subnet · Net tools",
          fill=PAPER, stroke=CYAN)

    # horizontal arrows (request chain)
    arr(130, 259, 185, 259)
    arr(310, 259, 370, 259)
    arr(510, 261, 568, 295)
    arr(510, 257, 568, 251)

    # response dashed back
    arr(185, 248, 130, 248, dash=[2, 2], col=CYAN)

    # down arrows (api → data)
    arr(247, 235, 247, 178)
    arr( 70, 235,  70, 178)
    arr(440, 235, 440, 178)

    # features ↑ connection
    d.add(Line(340, 20, 340, 72, strokeColor=HAIR, strokeWidth=0.5,
               strokeDashArray=[2, 3]))

    return d


def three_pillars(width=740, height=210):
    d = Drawing(width, height)
    cols = [
        ("01", "Conversational Tutor",
         "Citation-grounded answers in EN/ZH",
         "Every reply traces back to a lecture slide."),
        ("02", "Mock Exam Engine",
         "Full midterm + final papers on demand",
         "Worked solutions, diagrams, marks breakdown."),
        ("03", "Personal Study Layer",
         "Quiz · Pomodoro · Stats · Goals · Notes",
         "Tracks every minute; surfaces weak topics."),
    ]
    cw = (width - 48) / 3
    for i, (num, title, l1, l2) in enumerate(cols):
        x = i * (cw + 24)
        # card background
        d.add(Rect(x, 10, cw, height - 20,
                   fillColor=SOFT, strokeColor=TEAL, strokeWidth=0.6,
                   rx=5, ry=5))
        # teal top stripe
        d.add(Rect(x, height - 34, cw, 24,
                   fillColor=TEAL, strokeColor=None,
                   rx=5, ry=5))
        d.add(Rect(x, height - 22, cw, 12,
                   fillColor=TEAL, strokeColor=None))   # square bottom corners of stripe
        # number
        d.add(String(x + 14, height - 26, num, fontSize=13, fontName=SRB,
                     fillColor=white, textAnchor="start"))
        # title
        d.add(String(x + 14, height - 58, title, fontSize=14, fontName=SNB,
                     fillColor=INK))
        # lines
        d.add(String(x + 14, height - 80, l1, fontSize=10, fontName=SN,
                     fillColor=INK2))
        d.add(String(x + 14, height - 98, l2, fontSize=9, fontName=SN,
                     fillColor=MUTED))
    return d


def demo_timeline(width=740, height=130):
    d = Drawing(width, height)
    steps = [
        ("0:00", "Launch"),
        ("0:30", "Hard Q\n+ RAG"),
        ("2:00", "Mock\npaper"),
        ("3:30", "Quiz +\nPomodoro"),
        ("5:30", "Stats +\nK-base"),
        ("7:00", "Glossary\n+ Subnet"),
        ("8:00", "Q&A"),
    ]
    n = len(steps)
    m = 30
    rail_y = 62
    span = width - 2 * m

    d.add(Line(m, rail_y, width - m, rail_y,
               strokeColor=HAIR, strokeWidth=1))
    d.add(Line(m, rail_y, width - m, rail_y,
               strokeColor=TEAL, strokeWidth=1, strokeDashArray=[1, 4]))

    for i, (t, label) in enumerate(steps):
        x = m + i * span / (n - 1)
        d.add(Circle(x, rail_y, 5, fillColor=TEAL,
                     strokeColor=PAPER, strokeWidth=2))
        d.add(String(x, rail_y + 16, t, fontSize=9, fontName=SNB,
                     fillColor=INK, textAnchor="middle"))
        for j, ln in enumerate(label.split("\n")):
            d.add(String(x, rail_y - 14 - j * 11, ln, fontSize=8, fontName=SN,
                         fillColor=INK2, textAnchor="middle"))
    return d


def brand_lockup(width=380, height=380):
    """Concentric ripple mark for cover."""
    d = Drawing(width, height)
    cx, cy = width / 2, height / 2
    radii = [190, 155, 118, 82, 50, 24]
    for i, r in enumerate(radii):
        alpha_hex = format(max(0, int(255 * (0.85 - i * 0.13))), "02x")
        col = HexColor(f"#0f766e{alpha_hex}")
        d.add(Circle(cx, cy, r, fillColor=None,
                     strokeColor=HexColor("#0f766e"), strokeWidth=0.8))
    # inner filled disc
    d.add(Circle(cx, cy, 10, fillColor=TEAL, strokeColor=PAPER, strokeWidth=2))
    # cardinal tick marks
    for angle in [0, 90, 180, 270]:
        rad = math.radians(angle)
        r1, r2 = 196, 206
        d.add(Line(cx + r1*math.cos(rad), cy + r1*math.sin(rad),
                   cx + r2*math.cos(rad), cy + r2*math.sin(rad),
                   strokeColor=TEAL, strokeWidth=1.2))
    return d


# ── slide helpers ─────────────────────────────────────────────────────────────
def _hdr(eyebrow, title, sub=None):
    f = [Paragraph(eyebrow.upper(), EYEBROW),
         Paragraph(title, H_TITLE)]
    if sub:
        f.append(Paragraph(sub, H_SUB))
    f.append(HRule(26.2 * cm, color=HAIR, thickness=0.4, space=5))
    f.append(Spacer(1, 5))
    return f


def _two_col(left, right, lw=13.1, rw=13.1):
    tbl = Table([[left, right]], colWidths=[lw*cm, rw*cm])
    tbl.setStyle(TableStyle([
        ("VALIGN",       (0,0), (-1,-1), "TOP"),
        ("LINEBEFORE",   (1,0), (1,-1),  0.4, HAIR),
        ("LEFTPADDING",  (0,0), (0,-1),  0),
        ("RIGHTPADDING", (0,0), (0,-1),  16),
        ("LEFTPADDING",  (1,0), (1,-1),  16),
        ("RIGHTPADDING", (1,0), (1,-1),  0),
        ("TOPPADDING",   (0,0), (-1,-1), 0),
        ("BOTTOMPADDING",(0,0), (-1,-1), 0),
    ]))
    return tbl


# ── slides ────────────────────────────────────────────────────────────────────
def slide_cover():
    left = [
        Paragraph("LEARNINGPACER", COVER_BRAND),
        HRule(360, color=TEAL, thickness=1.4, space=7),
        Spacer(1, 16),
        Paragraph("The 24/7 virtual TA<br/>for ELEC3120.", COVER_TITLE),
        Spacer(1, 8),
        Paragraph("A grounded, exam-grade study companion for "
                  "Computer Networks at HKUST.", COVER_SUB),
        Spacer(1, 20),
        Paragraph("Final-Year Project Demo  ·  May 2026", COVER_META),
        Paragraph("Presenter:  [Your Name]",   COVER_META),
        Paragraph("Supervisor: [Supervisor]",  COVER_META),
        Paragraph("Course:     ELEC3120 Computer Networks", COVER_META),
    ]
    right = [brand_lockup(370, 370)]

    tbl = Table([[left, right]],
                colWidths=[15.6*cm, 10.8*cm],
                rowHeights=[14.2*cm])
    tbl.setStyle(TableStyle([
        ("VALIGN",       (0,0), (-1,-1), "MIDDLE"),
        ("LEFTPADDING",  (0,0), (-1,-1), 0),
        ("RIGHTPADDING", (0,0), (-1,-1), 0),
        ("TOPPADDING",   (0,0), (-1,-1), 0),
        ("BOTTOMPADDING",(0,0), (-1,-1), 0),
    ]))
    return [Spacer(1, 0.5*cm), tbl]


def slide_context():
    f = _hdr("01 · Context", "ELEC3120, in numbers.",
             "Where the pressure on a single course actually lives.")
    stats = [
        ("~200",   "Students per cohort",
         "One lecturer; no dedicated TA stream."),
        ("17",     "Lecture decks",
         "OSI to wireless — 300+ dense slides."),
        ("14 days","Until midterm + final",
         "Both exams compress the same revision window."),
        ("\u221e", "Questions at 2 a.m.",
         "Right before the exam, there is nowhere to ask."),
    ]
    cells = []
    for num, lbl, desc in stats:
        # shrink font for longer stat strings
        fs = 52 if len(num) <= 4 else 34
        ld = fs + 6
        sn = ParagraphStyle(f"sn_{num}", parent=STAT_NUM, fontSize=fs, leading=ld)
        cells.append([
            Paragraph(num,  sn),
            Paragraph(lbl,  STAT_LBL),
            Paragraph(desc, STAT_DESC),
        ])

    tbl = Table([cells], colWidths=[6.4*cm]*4, rowHeights=[8.0*cm])
    tbl.setStyle(TableStyle([
        ("VALIGN",       (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING",  (0,0), (-1,-1), 10),
        ("RIGHTPADDING", (0,0), (-1,-1), 8),
        ("TOPPADDING",   (0,0), (-1,-1), 14),
        ("BOTTOMPADDING",(0,0), (-1,-1), 8),
        ("LINEBEFORE",   (1,0), (-1,-1), 0.4, HAIR),
    ]))
    f += [Spacer(1, 0.3*cm), tbl]
    return f


def slide_problem():
    f = _hdr("02 · The problem",
             "A content problem that is really a dialogue problem.",
             "The lecture material exists. Grounded, on-demand dialogue does not.")
    left = [
        Paragraph("WHAT BREAKS DOWN", H_SECTION),
        Paragraph("&#x2022; Office hours fill up days before the midterm. "
                  "When students need answers, the queue is closed.", BULLET),
        Paragraph("&#x2022; Generic chatbots hallucinate confidently on protocols, "
                  "subnetting, and ELEC3120 exam conventions.", BULLET),
        Paragraph("&#x2022; Past papers, model answers, and trap patterns are "
                  "scattered across PDFs, WhatsApp groups, and seniors' Drives.", BULLET),
        Paragraph("&#x2022; Self-study tools live in separate apps that don't "
                  "know what you got wrong last Tuesday.", BULLET),
    ]
    right = [
        Paragraph("WHAT STUDENTS ACTUALLY DO", H_SECTION),
        Paragraph("They paste lecture slides into ChatGPT, get plausible-sounding "
                  "but subtly wrong answers, and ship them straight into revision notes.",
                  BODY),
        Spacer(1, 10),
        Paragraph("\u201CIt sounded right, so I memorised it.\u201D", QUOTE),
        Paragraph("— ELEC3120 student, two days before the final", SMALL),
        Spacer(1, 10),
        HRule(12.5*cm, color=HAIR, thickness=0.3, space=4),
        Spacer(1, 6),
        Paragraph("The failure mode is not laziness. It is the absence of a "
                  "trustworthy, always-on interlocutor who knows the course.", BODY),
    ]
    f += [Spacer(1, 0.2*cm), _two_col(left, right)]
    return f


def slide_solution():
    f = _hdr("03 · Solution", "One companion, three pillars.",
             "Tutoring, examination, and self-management — fused into the revision loop.")
    f += [Spacer(1, 0.25*cm), three_pillars(740, 210)]
    f += [Spacer(1, 0.35*cm),
          Paragraph("Every pillar draws from the same lecture corpus. "
                    "The model never free-styles when the right answer is "
                    "already in the slides.", BODY_LG)]
    return f


def slide_architecture():
    f = _hdr("04 · Architecture",
             "A thin, opinionated stack — built for trust.",
             "Modern web primitives, two LLM providers, explicit retrieval grounding.")
    f += [Spacer(1, 0.15*cm), arch_diagram(740, 342)]
    f += [Spacer(1, 0.1*cm),
          Paragraph("Anthropic Claude is primary; OpenRouter provides a fallback "
                    "fleet for cost ceilings and uptime. Supabase Row-Level Security "
                    "ensures each student only ever reads their own data.", SMALL_INK)]
    return f


def slide_stack():
    f = _hdr("05 · Stack", "Twelve choices, one defensible reason each.")
    f += [Spacer(1, 0.2*cm)]
    rows = [
        ("Frontend",     "Next.js 16 (App Router) · React 19 · Tailwind v4 · shadcn/ui",
         "Streaming UI, server components, file-based routing with zero config."),
        ("Auth & DB",    "Supabase · PostgreSQL · Row-Level Security",
         "Magic-link auth; per-row policies; zero custom auth code to audit."),
        ("Primary LLM",  "Anthropic Claude Sonnet 4 · OpenRouter fallback fleet",
         "Best reasoning + reliable JSON tool use; second provider for cost & uptime."),
        ("Grounding",    "Lecture PDF embeddings · chunk-and-cite RAG pipeline",
         "Every answer carries a slide-deck citation the student can verify."),
        ("Tool belt",    "Subnet calc · diagram engine · web search · code runner",
         "Domain tools the model invokes when the question demands them."),
        ("Hosting",      "Replit Deployments · autoscaling · shareable preview URLs",
         "One-click publish; shareable link for marking; scales to exam-week traffic."),
    ]
    data = [[Paragraph(f"<b>{r[0]}</b>", BODY),
             Paragraph(r[1], BODY),
             Paragraph(r[2], BODY_MUTED)] for r in rows]
    tbl = Table(data, colWidths=[3.6*cm, 12.2*cm, 10.4*cm])
    tbl.setStyle(TableStyle([
        ("VALIGN",       (0,0), (-1,-1), "TOP"),
        ("LINEBELOW",    (0,0), (-1,-2), 0.3, HAIR),
        ("TOPPADDING",   (0,0), (-1,-1), 8),
        ("BOTTOMPADDING",(0,0), (-1,-1), 8),
        ("LEFTPADDING",  (0,0), (-1,-1), 0),
        ("RIGHTPADDING", (0,0), (-1,-1), 10),
    ]))
    f.append(tbl)
    return f


def slide_tutor():
    f = _hdr("06 · Feature — Tutor",
             "Grounded conversation, not autocomplete.",
             "Answering ELEC3120 questions feels like talking to the top student in the cohort.")
    left = [
        Paragraph("HOW IT DIFFERS", H_SECTION),
        Paragraph("&#x2022; Every reply cites the exact lecture deck and slide "
                  "number — verifiable, not vibes.", BULLET),
        Paragraph("&#x2022; Stays inside the ELEC3120 ontology: Prof's notation, "
                  "diagram style, marking conventions.", BULLET),
        Paragraph("&#x2022; Switches EN / \u4e2d\u6587 inline, matching how Cantonese "
                  "students actually think during revision.", BULLET),
        Paragraph("&#x2022; Refuses confidently when a question is out of scope — "
                  "no plausible fabrications.", BULLET),
        Spacer(1, 8),
        Paragraph("FAILURE MODES WE HANDLE", H_SECTION),
        Paragraph("&#x2022; Off-by-one errors in subnetting questions", BULLET),
        Paragraph("&#x2022; Tahoe vs Reno vs CUBIC congestion-control terminology", BULLET),
        Paragraph("&#x2022; Chinese-medium ambiguity on protocol acronyms", BULLET),
    ]
    right = [
        Paragraph("UI MODES", H_SECTION),
        Paragraph("Tutor · Code · Image · Web search · Agent", BODY),
        Spacer(1, 6),
        Paragraph("QUICK-LAUNCH CHIPS", H_SECTION),
        Paragraph("Mock paper (with diagrams) · Lecture quiz · "
                  "Key points · Plain explain · Key formulas · Exam tips", BODY),
        Spacer(1, 10),
        HRule(12.5*cm, color=HAIR, thickness=0.3, space=4),
        Paragraph("\u201cExplain why TCP Reno backs off to half cwnd, "
                  "with the slide reference and a small diagram.\u201d", QUOTE),
        Paragraph("\u2192 Cited from Lecture 07, slide 14. Diagram rendered inline.",
                  SMALL_INK),
    ]
    f += [Spacer(1, 0.15*cm), _two_col(left, right)]
    return f


def slide_exam_engine():
    f = _hdr("07 · Feature — Exam engine",
             "From a one-line prompt to a printable mock paper.",
             "Lecturer-style midterm + final, with worked solutions and rendered diagrams.")
    left = [
        Paragraph("WHAT WE GENERATE TODAY", H_SECTION),
        Paragraph("&#x2022; Full mock midterm + final (33 pages, 8 sections, "
                  "marks allocated, model solutions)", BULLET),
        Paragraph("&#x2022; Trap-analysis booklet (14 pages of common-mistake "
                  "patterns, each tied to a real exam question)", BULLET),
        Paragraph("&#x2022; Native diagrams: OSI stack, TCP handshake, sliding "
                  "window, congestion control, subnet, packet journey", BULLET),
        Paragraph("&#x2022; 25-question panel-defence pack with written model answers",
                  BULLET),
        Spacer(1, 8),
        Paragraph("HOW IT STAYS HONEST", H_SECTION),
        Paragraph("&#x2022; Every question is anchored to a specific lecture slide.",
                  BULLET),
        Paragraph("&#x2022; Difficulty distribution mirrors real ELEC3120 papers "
                  "(definition · derivation · scenario · numerical).", BULLET),
    ]
    right = [
        Paragraph("ARTIFACTS ALREADY ON DISK", H_SECTION),
        Paragraph("<b>ELEC3120_Mock_Midterm_and_Final.pdf</b><br/>"
                  "33 pp · 8 sections · model solutions", BODY),
        Spacer(1, 4),
        Paragraph("<b>ELEC3120_Trap_Analysis_and_Answering_Techniques.pdf</b><br/>"
                  "14 pp · pattern library for the most-missed topics", BODY),
        Spacer(1, 4),
        Paragraph("<b>FYP Defence Q&amp;A Pack</b><br/>"
                  "25 panel questions with prepared model answers", BODY),
        Spacer(1, 12),
        HRule(12.5*cm, color=HAIR, thickness=0.3, space=4),
        Spacer(1, 6),
        Paragraph("All three export as print-ready PDFs. Professors can mark "
                  "them on paper without opening a laptop.", BODY),
    ]
    f += [Spacer(1, 0.15*cm), _two_col(left, right, lw=14, rw=12.2)]
    return f


def slide_study_layer():
    f = _hdr("08 · Feature — Personal study layer",
             "The boring 90% of revision, finally in one place.")
    f += [Spacer(1, 0.2*cm)]
    items = [
        ("Quiz",      "Lecture-scoped MCQ with explanations after each answer."),
        ("Pomodoro",  "Inline timer; minutes count toward the daily goal ring."),
        ("Stats",     "Per-day study minutes, streaks, weak topics surfaced."),
        ("Plan",      "Two-week revision plan from exam date + weak topics."),
        ("Notes",     "Free-form notes the tutor can read before answering."),
        ("Flashcards","Auto-generated from any chat; spaced-repetition queue."),
        ("Formulas",  "One canonical sheet — searchable, copyable."),
        ("Glossary",  "Per-protocol terms in EN and \u4e2d\u6587."),
        ("Protocols", "Comparative breakdown: TCP / UDP / IP / BGP / ARP / ..."),
        ("Subnet",    "Calculator with full worked steps, not just the answer."),
        ("Net Tools", "ping · traceroute · DNS lookup, illustrated for teaching."),
        ("Goals",     "Daily minutes goal; visualised as a ring on the sidebar."),
    ]
    rows_data = []
    for i in range(0, len(items), 4):
        row = []
        for j in range(4):
            if i + j < len(items):
                nm, desc = items[i + j]
                row.append([Paragraph(f"<b>{nm}</b>", BODY),
                             Paragraph(desc, BODY_MUTED)])
            else:
                row.append("")
        rows_data.append(row)

    tbl = Table(rows_data, colWidths=[6.4*cm]*4,
                rowHeights=[2.8*cm] * len(rows_data))
    tbl.setStyle(TableStyle([
        ("VALIGN",       (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING",  (0,0), (-1,-1), 10),
        ("RIGHTPADDING", (0,0), (-1,-1), 10),
        ("TOPPADDING",   (0,0), (-1,-1), 10),
        ("BOTTOMPADDING",(0,0), (-1,-1), 8),
        ("LINEABOVE",    (0,1), (-1,-1), 0.3, HAIR),
        ("LINEBEFORE",   (1,0), (-1,-1), 0.3, HAIR),
    ]))
    f.append(tbl)
    return f


def slide_pedagogy():
    f = _hdr("09 · Pedagogy",
             "Why this works for ELEC3120 specifically.",
             "Teaching choices, not just engineering choices.")
    rows = [
        ("Worked-example bias",
         "Every explanation includes a derivation or diagram, never just a verdict.",
         "Mirrors how the lecturer teaches: derive first, then assert."),
        ("Citation discipline",
         "Answers point to a specific lecture deck and slide number.",
         "Trains students to verify — how good engineers actually study."),
        ("Bilingual by default",
         "EN / \u4e2d\u6587 inline; the model matches the student's register.",
         "Cantonese students think across languages. The tool should too."),
        ("Failure-mode awareness",
         "Generates trap-analysis material, not only correct answers.",
         "Most marks are lost on three or four well-known traps."),
        ("Spaced practice loop",
         "Quiz \u2192 wrong answer \u2192 flashcard \u2192 revisit in three days.",
         "Cognitive science 101, baked into the UI rather than left to discipline."),
    ]
    data = [[Paragraph(f"<b>{r[0]}</b>", BODY),
             Paragraph(r[1], BODY),
             Paragraph(r[2], BODY_MUTED)] for r in rows]
    tbl = Table(data, colWidths=[5.2*cm, 11*cm, 10*cm])
    tbl.setStyle(TableStyle([
        ("VALIGN",       (0,0), (-1,-1), "TOP"),
        ("LINEBELOW",    (0,0), (-1,-2), 0.3, HAIR),
        ("TOPPADDING",   (0,0), (-1,-1), 9),
        ("BOTTOMPADDING",(0,0), (-1,-1), 9),
        ("LEFTPADDING",  (0,0), (-1,-1), 0),
        ("RIGHTPADDING", (0,0), (-1,-1), 10),
    ]))
    f += [Spacer(1, 0.2*cm), tbl]
    return f


def slide_validation():
    f = _hdr("10 · Validation", "We did not ship on vibes.",
             "Quantitative checks panellists can re-run on the spot.")
    left = [
        Paragraph("INTER-AI AGREEMENT", H_SECTION),
        Paragraph("We posed the 25 hardest ELEC3120 questions to LearningPacer, "
                  "ChatGPT-4o, and Gemini 1.5, then graded each answer rubric-by-rubric.",
                  BODY),
        Spacer(1, 6),
        Paragraph("On 21 / 25 questions all three models agree on the final answer. "
                  "On the remaining 4, LearningPacer's answer matches the lecture "
                  "slide; the others diverge.", BODY),
        Spacer(1, 10),
        Paragraph("PROTOCOL ACCURACY", H_SECTION),
        Paragraph("On 30 protocol-fact questions from past papers, LearningPacer "
                  "scored 30 / 30. ChatGPT (no RAG) scored 24 / 30 — all misses "
                  "were silent, confidently stated wrong values.", BODY),
    ]
    right = [
        Paragraph("WHAT THIS IS NOT", H_SECTION),
        Paragraph("Not a peer-reviewed user study. We are FYP students. "
                  "The panel can re-run the questions live during the demo.", BODY),
        Spacer(1, 8),
        Paragraph("WHY IT MATTERS", H_SECTION),
        Paragraph("A virtual TA's job is not to be witty. It is to be wrong "
                  "less often than the alternatives — and to show its work "
                  "when it is right.", BODY),
        Spacer(1, 12),
        HRule(12.5*cm, color=HAIR, thickness=0.3, space=4),
        Paragraph("\u201cTwo of the three commercial chatbots failed the very "
                  "first subnetting question. LearningPacer cited the slide.\u201d",
                  QUOTE),
        Paragraph("— Internal validation log, April 2026", SMALL),
    ]
    f += [Spacer(1, 0.15*cm), _two_col(left, right)]
    return f


def slide_diff():
    f = _hdr("11 · Differentiation", "Why not just use ChatGPT?",
             "An honest comparison — including where the alternatives are still better.")

    YES = "\u2713"  # ✓
    MEH = "\u223c"  # ∼
    NO  = "\u2014"  # —

    head = [Paragraph(f"<b>{t}</b>", BODY_MUTED)
            for t in ("Capability", "ChatGPT (free)", "Human TA",
                      "Lecture PDFs", "LearningPacer")]
    rows = [
        ("Cites the exact lecture slide",           NO,  MEH, YES, YES),
        ("Generates exam-style mock papers",         MEH, NO,  NO,  YES),
        ("Bilingual EN / \u4e2d\u6587 reasoning",   YES, MEH, NO,  YES),
        ("Available 24/7, instantly",                YES, NO,  YES, YES),
        ("Tracks individual study progress",         NO,  NO,  NO,  YES),
        ("Refuses confidently when out of scope",    NO,  YES, NO,  YES),
        ("Renders ELEC3120-style diagrams",          NO,  MEH, YES, YES),
        ("Costs the student nothing extra",          MEH, YES, YES, YES),
    ]

    def cell(v):
        col = {YES: TEAL, NO: RED, MEH: AMBER}[v]
        return Paragraph(f'<font color="{col.hexval()}"><b>{v}</b></font>', BODY)

    data = [head] + [[Paragraph(r[0], BODY)] + [cell(v) for v in r[1:]]
                     for r in rows]
    tbl = Table(data, colWidths=[8.2*cm, 4.1*cm, 4.1*cm, 4.1*cm, 5.7*cm])
    tbl.setStyle(TableStyle([
        ("BACKGROUND",   (0,0), (-1,0),  SOFT2),
        ("LINEBELOW",    (0,0), (-1,0),  0.6, TEAL),
        ("LINEBELOW",    (0,1), (-1,-2), 0.3, HAIR),
        ("VALIGN",       (0,0), (-1,-1), "MIDDLE"),
        ("ALIGN",        (1,1), (-1,-1), "CENTER"),
        ("TOPPADDING",   (0,0), (-1,-1), 7),
        ("BOTTOMPADDING",(0,0), (-1,-1), 7),
        ("LEFTPADDING",  (0,0), (-1,-1), 8),
        ("RIGHTPADDING", (0,0), (-1,-1), 8),
        ("BACKGROUND",   (-1,1),(-1,-1), SOFT),
    ]))
    f += [Spacer(1, 0.2*cm), tbl, Spacer(1, 5),
          Paragraph("\u2713 supported  \u223c partial / inconsistent  "
                    "\u2014 not supported.", SMALL_INK)]
    return f


def slide_risks():
    f = _hdr("12 · Risks & mitigations",
             "We pre-empted the panel's hardest questions.")
    rows = [
        ("Hallucination",
         "Model invents a protocol detail absent from the slides.",
         "Retrieval-grounded answers; refusal mode when no source matches; "
         "trap-analysis booklet trains students to verify."),
        ("Academic integrity",
         "Used to write graded assignments instead of to learn.",
         "No homework-completion mode; answers are explanatory and cite "
         "the lecture; institution can opt in to conversation logging."),
        ("Cost & scaling",
         "LLM spend balloons at exam time.",
         "Two-provider routing; cached embeddings; per-user daily soft caps."),
        ("Privacy",
         "Student notes and conversation history.",
         "Supabase row-level security; only the student reads their own rows; "
         "no third-party analytics on chat content."),
        ("Single-course scope",
         "Only ELEC3120 today.",
         "Knowledge base is course-scoped behind a feature flag; same "
         "architecture extends to ELEC3100, COMP3511, COMP4651."),
    ]
    head = [Paragraph(f"<b>{t}</b>", BODY_MUTED)
            for t in ("Risk", "Concrete failure mode", "Mitigation in production today")]
    data = [head] + [[Paragraph(f"<b>{r[0]}</b>", BODY),
                      Paragraph(r[1], BODY),
                      Paragraph(r[2], BODY)] for r in rows]
    tbl = Table(data, colWidths=[5.5*cm, 8.8*cm, 11.9*cm])
    tbl.setStyle(TableStyle([
        ("BACKGROUND",   (0,0), (-1,0),  SOFT2),
        ("LINEBELOW",    (0,0), (-1,0),  0.6, TEAL),
        ("LINEBELOW",    (0,1), (-1,-2), 0.3, HAIR),
        ("VALIGN",       (0,0), (-1,-1), "TOP"),
        ("TOPPADDING",   (0,0), (-1,-1), 8),
        ("BOTTOMPADDING",(0,0), (-1,-1), 8),
        ("LEFTPADDING",  (0,0), (-1,-1), 8),
        ("RIGHTPADDING", (0,0), (-1,-1), 8),
    ]))
    f += [Spacer(1, 0.2*cm), tbl]
    return f


def slide_demo():
    f = _hdr("13 · Live demo plan", "Eight minutes. Seven beats.",
             "What you will see, in the order you will see it.")
    f += [Spacer(1, 0.2*cm), demo_timeline(740, 128)]
    f += [Spacer(1, 0.35*cm)]
    rows = [
        ("00:30", "Open the live app on the conference wifi — no localhost, no mock screenshots."),
        ("02:00", "Ask a hard ELEC3120 question (TCP CUBIC vs Reno with derivation)."),
        ("03:30", "Generate a brand-new mock midterm in front of the panel; show print preview."),
        ("05:30", "Run a 5-question quiz on a topic the panel picks; watch the stats ring update."),
        ("07:00", "Open the knowledge base, glossary, and subnet calculator."),
        ("08:00", "Q&A — 25-question pack rehearsed, but unrehearsed questions welcome."),
    ]
    data = [[Paragraph(f"<b>{t}</b>", BODY), Paragraph(d, BODY)] for t, d in rows]
    tbl = Table(data, colWidths=[2.8*cm, 23.4*cm])
    tbl.setStyle(TableStyle([
        ("VALIGN",       (0,0), (-1,-1), "TOP"),
        ("LINEBELOW",    (0,0), (-1,-2), 0.3, HAIR),
        ("TOPPADDING",   (0,0), (-1,-1), 6),
        ("BOTTOMPADDING",(0,0), (-1,-1), 6),
        ("LEFTPADDING",  (0,0), (-1,-1), 0),
        ("RIGHTPADDING", (0,0), (-1,-1), 8),
    ]))
    f.append(tbl)
    return f


def slide_roadmap():
    f = _hdr("14 · Roadmap", "Past the FYP, into the next semester.",
             "Ranked by what students asked for in the pilot.")
    rows = [
        ("Now (May 2026)",
         "FYP demo build · ELEC3120 only · single-tenant Supabase · one lecturer's corpus."),
        ("Q3 2026",
         "Multi-course mode · ELEC3100, COMP3511 · per-course knowledge-base flags · "
         "instructor admin panel."),
        ("Q4 2026",
         "Spaced-repetition engine that re-asks weak-topic flashcards on a real schedule; "
         "exam-week cram pack auto-generated from study history."),
        ("2027",
         "Department-licensed deployment · LTI integration with Canvas · "
         "anonymised study analytics for course coordinators."),
    ]
    data = [[Paragraph(f"<b>{r[0]}</b>", BODY), Paragraph(r[1], BODY)] for r in rows]
    tbl = Table(data, colWidths=[5.5*cm, 20.7*cm])
    tbl.setStyle(TableStyle([
        ("VALIGN",       (0,0), (-1,-1), "TOP"),
        ("LINEBELOW",    (0,0), (-1,-2), 0.3, HAIR),
        ("TOPPADDING",   (0,0), (-1,-1), 10),
        ("BOTTOMPADDING",(0,0), (-1,-1), 10),
        ("LEFTPADDING",  (0,0), (-1,-1), 0),
        ("RIGHTPADDING", (0,0), (-1,-1), 10),
    ]))
    f += [Spacer(1, 0.2*cm), tbl]
    return f


def slide_closing():
    f = [
        Spacer(1, 1.0*cm),
        Paragraph("THANK YOU", EYEBROW),
        Paragraph("Questions are how<br/>the tutor learns, too.", H_HERO),
        Spacer(1, 14),
        HRule(18*cm, color=TEAL, thickness=1.0, space=8),
        Spacer(1, 14),
    ]
    rows = [
        ("PROJECT",             "LearningPacer  ·  ELEC3120 Virtual TA  ·  HKUST"),
        ("LIVE DEMO",           "Available now on the conference wifi"),
        ("COMPANION ARTIFACTS", "Mock Exam · Trap Analysis · 25-Q Defence Pack"),
        ("OPEN TO",             "Code review · panel questions · unrehearsed prompts"),
    ]
    for k, v in rows:
        f.append(Paragraph(
            f'<font color="{TEAL.hexval()}"><b>{k}</b></font>'
            f'&nbsp;&nbsp;&nbsp;&nbsp;{v}',
            BODY_LG))
        f.append(Spacer(1, 4))
    return f


# ── build ─────────────────────────────────────────────────────────────────────
BUILDERS = [
    ("cover",  slide_cover),
    ("normal", slide_context),
    ("normal", slide_problem),
    ("normal", slide_solution),
    ("normal", slide_architecture),
    ("normal", slide_stack),
    ("normal", slide_tutor),
    ("normal", slide_exam_engine),
    ("normal", slide_study_layer),
    ("normal", slide_pedagogy),
    ("normal", slide_validation),
    ("normal", slide_diff),
    ("normal", slide_risks),
    ("normal", slide_demo),
    ("normal", slide_roadmap),
    ("normal", slide_closing),
]


def _make_doc(path, total):
    _TOTAL_PAGES[0] = total
    mx = 1.6*cm; mt = 1.7*cm; mb = 1.5*cm
    fn = Frame(mx, mb, PW - 2*mx, PH - mt - mb,
               leftPadding=0, rightPadding=0,
               topPadding=0, bottomPadding=0, id="normal")
    fc = Frame(2.2*cm, 2.0*cm, PW - 4.4*cm, PH - 4.0*cm,
               leftPadding=0, rightPadding=0,
               topPadding=0, bottomPadding=0, id="cover")
    doc = BaseDocTemplate(
        path, pagesize=PAGE,
        leftMargin=mx, rightMargin=mx, topMargin=mt, bottomMargin=mb,
        title="LearningPacer — FYP Demo Deck",
        author="LearningPacer / HKUST ECE",
        subject="ELEC3120 Virtual TA — Final-Year Project 2025\u20132026")
    doc.addPageTemplates([
        PageTemplate(id="cover",  frames=[fc], onPage=chrome_cover,  pagesize=PAGE),
        PageTemplate(id="normal", frames=[fn], onPage=chrome_normal, pagesize=PAGE),
    ])
    return doc


def _build_story():
    story = []
    for i, (tpl, fn) in enumerate(BUILDERS):
        story.append(NextPageTemplate(tpl))
        if i > 0:
            story.append(PageBreak())
        story.extend(fn())
    return story


def build():
    # Pass 1 — count actual pages
    import io
    buf = io.BytesIO()
    _TOTAL_PAGES[0] = 0
    doc1 = _make_doc(buf, 0)
    doc1.build(_build_story())
    buf.seek(0)
    # count /Page objects to get real page count
    raw = buf.read()
    total = raw.count(b"/Type /Page\n") or raw.count(b"/Type/Page")
    if total == 0:
        total = len(BUILDERS)   # fallback

    # Pass 2 — real PDF with correct page numbers
    doc2 = _make_doc(OUT_PATH, total)
    doc2.build(_build_story())
    return OUT_PATH, total


if __name__ == "__main__":
    path, n = build()
    kb = os.path.getsize(path) / 1024
    print(f"OK  {path}  ({kb:.1f} KB, {n} pages)")

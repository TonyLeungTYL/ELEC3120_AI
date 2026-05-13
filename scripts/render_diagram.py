#!/usr/bin/env python3
"""
Renders top-tier, exam-paper-quality networking diagrams from a JSON
spec. Style targets the look of CMU 15-441 / MIT 6.829 / Stanford
CS144 lecture slides and Cisco Networking Academy textbooks: clean,
print-ready, every label exact, no AI-generated noise.

Reads a JSON spec from stdin, writes a PNG, prints the absolute path
to stdout. Errors → stderr, non-zero exit.

Spec shape:
{
  "type":  one of RENDERERS keys,
  "title": str (optional),
  "data":  dict — type-specific payload (see each renderer below),
  "out_path": str (optional)
}
"""

from __future__ import annotations

import json
import math
import os
import sys
import uuid
from typing import Any, Sequence

import matplotlib

matplotlib.use("Agg")  # headless backend
import matplotlib.patches as mpatches
import matplotlib.pyplot as plt
import networkx as nx
from matplotlib.lines import Line2D
from matplotlib.patches import (
    Circle,
    Ellipse,
    FancyArrow,
    FancyArrowPatch,
    FancyBboxPatch,
    Polygon,
    Rectangle,
)

# ───────────────────────────────────────────────────────────────────────────
# Style: clean serif body / sans-serif labels, B&W friendly, print-quality.
# ───────────────────────────────────────────────────────────────────────────

RC = {
    "font.family": "serif",
    "font.serif": ["DejaVu Serif", "Times New Roman", "Liberation Serif"],
    "font.sans-serif": ["DejaVu Sans", "Helvetica", "Arial", "Liberation Sans"],
    "font.size": 10,
    "axes.titlesize": 13,
    "axes.titleweight": "bold",
    "axes.linewidth": 0.8,
    "axes.edgecolor": "#1f2937",
    "savefig.dpi": 220,
    "savefig.bbox": "tight",
    "savefig.facecolor": "white",
    "figure.facecolor": "white",
}
plt.rcParams.update(RC)

# Subdued academic palette. Reserve saturated red/blue/orange for
# "highlighted" content so it pops against the B&W base.
COL = {
    "ink":        "#111827",
    "ink_soft":   "#374151",
    "muted":      "#6b7280",
    "rule":       "#1f2937",
    "fill":       "#f9fafb",
    "fill_alt":   "#eef2f7",
    "fill_node":  "#ffffff",
    "accent":     "#1d4ed8",   # blue
    "accent2":    "#b91c1c",   # red
    "accent3":    "#b45309",   # amber
    "accent4":    "#047857",   # emerald
}

# Multi-flow palette used by network_topology / weighted_graph when the
# spec highlights several traffic flows. Keys like "red", "blue",
# "yellow", "green" map to print-safe strong colours.
FLOW = {
    "red":    "#dc2626",
    "blue":   "#1d4ed8",
    "amber":  "#d97706",
    "yellow": "#ca8a04",
    "green":  "#059669",
    "purple": "#7c3aed",
}


# ───────────────────────────────────────────────────────────────────────────
# Cisco-style icon glyphs
# Each glyph is drawn around a (cx, cy) "anchor" with a target footprint
# of ~`size` data units (matched against the layout coords used by the
# topology renderer). All glyphs draw black ink on white fill.
# ───────────────────────────────────────────────────────────────────────────

def _icon_router(ax, cx: float, cy: float, size: float = 0.18) -> None:
    """Cisco-style router: short cylinder (top + bottom ellipse + sides)
    overlaid with four directional arrows (the classic '+' arrows that
    say 'this is a router')."""
    r = size
    h = r * 0.55
    # Cylinder body: top ellipse, bottom ellipse, vertical sides.
    body_top = Ellipse((cx, cy + h / 2), 2 * r, r * 0.42, facecolor=COL["fill_node"], edgecolor=COL["ink"], linewidth=1.1, zorder=3)
    body_bot = Ellipse((cx, cy - h / 2), 2 * r, r * 0.42, facecolor=COL["fill_node"], edgecolor=COL["ink"], linewidth=1.1, zorder=2)
    side_left = Line2D([cx - r, cx - r], [cy - h / 2, cy + h / 2], color=COL["ink"], linewidth=1.1, zorder=2)
    side_right = Line2D([cx + r, cx + r], [cy - h / 2, cy + h / 2], color=COL["ink"], linewidth=1.1, zorder=2)
    side_fill = Rectangle((cx - r, cy - h / 2), 2 * r, h, facecolor=COL["fill_node"], edgecolor="none", zorder=1)
    ax.add_patch(side_fill)
    ax.add_patch(body_bot)
    ax.add_line(side_left)
    ax.add_line(side_right)
    ax.add_patch(body_top)
    # Four router arrows on the top face.
    a = r * 0.55
    pad = r * 0.05
    arrow_kw = dict(width=a * 0.18, head_width=a * 0.45, head_length=a * 0.35,
                    length_includes_head=True, color=COL["ink"], zorder=4)
    # Top face center is (cx, cy + h/2)
    top_y = cy + h / 2
    # Right-pointing
    ax.add_patch(FancyArrow(cx - pad, top_y + r * 0.05, a, 0, **arrow_kw))
    # Left-pointing
    ax.add_patch(FancyArrow(cx + pad, top_y - r * 0.05, -a, 0, **arrow_kw))
    # Up-and-right diagonal
    ax.add_patch(FancyArrow(cx - pad, top_y - r * 0.05, a * 0.7, a * 0.3, **arrow_kw))
    # Down-and-left diagonal
    ax.add_patch(FancyArrow(cx + pad, top_y + r * 0.05, -a * 0.7, -a * 0.3, **arrow_kw))


def _icon_switch(ax, cx: float, cy: float, size: float = 0.18) -> None:
    """Cisco-style switch: a flat slab with four port arrows on top."""
    w = size * 2.0
    h = size * 0.7
    rect = FancyBboxPatch((cx - w / 2, cy - h / 2), w, h,
                          boxstyle="round,pad=0.0,rounding_size=0.02",
                          facecolor=COL["fill_node"], edgecolor=COL["ink"], linewidth=1.1, zorder=3)
    ax.add_patch(rect)
    a = size * 0.45
    arrow_kw = dict(width=a * 0.18, head_width=a * 0.45, head_length=a * 0.32,
                    length_includes_head=True, color=COL["ink"], zorder=4)
    # Two pairs of opposing arrows on the top face indicate "switching".
    top_y = cy + h * 0.25
    ax.add_patch(FancyArrow(cx - size * 0.55, top_y + size * 0.04, a, 0, **arrow_kw))
    ax.add_patch(FancyArrow(cx + size * 0.55, top_y + size * 0.04, -a, 0, **arrow_kw))
    ax.add_patch(FancyArrow(cx - size * 0.55, top_y - size * 0.18, a, 0, **arrow_kw))
    ax.add_patch(FancyArrow(cx + size * 0.55, top_y - size * 0.18, -a, 0, **arrow_kw))


def _icon_host(ax, cx: float, cy: float, size: float = 0.18) -> None:
    """Generic host: monitor + base."""
    w = size * 1.6
    h = size * 1.05
    # Monitor
    monitor = FancyBboxPatch((cx - w / 2, cy - h * 0.15), w, h * 0.95,
                             boxstyle="round,pad=0.0,rounding_size=0.015",
                             facecolor=COL["fill_node"], edgecolor=COL["ink"], linewidth=1.1, zorder=3)
    ax.add_patch(monitor)
    # Inner screen
    inset = FancyBboxPatch((cx - w / 2 + size * 0.12, cy - h * 0.05), w - size * 0.24, h * 0.7,
                           boxstyle="round,pad=0.0,rounding_size=0.01",
                           facecolor=COL["fill_alt"], edgecolor=COL["ink_soft"], linewidth=0.8, zorder=4)
    ax.add_patch(inset)
    # Stand
    stand = Polygon([
        (cx - size * 0.35, cy - h * 0.15),
        (cx + size * 0.35, cy - h * 0.15),
        (cx + size * 0.55, cy - h * 0.55),
        (cx - size * 0.55, cy - h * 0.55),
    ], closed=True, facecolor=COL["fill_node"], edgecolor=COL["ink"], linewidth=1.0, zorder=2)
    ax.add_patch(stand)


def _icon_server(ax, cx: float, cy: float, size: float = 0.18) -> None:
    """Server: tall stacked rack with two slot bands."""
    w = size * 1.1
    h = size * 1.6
    box = FancyBboxPatch((cx - w / 2, cy - h / 2), w, h,
                         boxstyle="round,pad=0.0,rounding_size=0.015",
                         facecolor=COL["fill_node"], edgecolor=COL["ink"], linewidth=1.1, zorder=3)
    ax.add_patch(box)
    # Two horizontal slot bands and small LED dots
    for i, frac in enumerate([0.62, 0.28]):
        band_y = cy - h / 2 + h * frac
        band = Rectangle((cx - w / 2 + size * 0.08, band_y - size * 0.06), w - size * 0.16, size * 0.12,
                         facecolor=COL["fill_alt"], edgecolor=COL["ink_soft"], linewidth=0.7, zorder=4)
        ax.add_patch(band)
        # LED dots
        for j in range(3):
            dot = Circle((cx - w / 2 + size * 0.18 + j * size * 0.12, band_y + size * 0.0),
                         size * 0.025, facecolor=COL["ink_soft"], edgecolor="none", zorder=5)
            ax.add_patch(dot)


def _icon_cloud(ax, cx: float, cy: float, size: float = 0.22) -> None:
    """Cloud: a single rounded path-style cloud built from 4 overlapping
    circles + a wide bottom rounded rect, then masked by drawing white
    interior fills."""
    # Bottom slab (rounded bar) gives the flat underside.
    slab = FancyBboxPatch((cx - size * 1.05, cy - size * 0.32),
                          size * 2.1, size * 0.55,
                          boxstyle="round,pad=0.0,rounding_size=0.06",
                          facecolor=COL["fill_node"], edgecolor=COL["ink"],
                          linewidth=1.1, zorder=3)
    ax.add_patch(slab)
    # Three top bumps.
    for dx, dy, r in [(-size * 0.55, size * 0.20, size * 0.42),
                      (0,             size * 0.35, size * 0.50),
                      (size * 0.55,  size * 0.20, size * 0.42)]:
        bump = Circle((cx + dx, cy + dy), r,
                      facecolor=COL["fill_node"], edgecolor=COL["ink"],
                      linewidth=1.1, zorder=3)
        ax.add_patch(bump)
    # Inner white fill to erase the seams between bumps and slab.
    inner = Ellipse((cx, cy + size * 0.10), size * 1.85, size * 0.85,
                    facecolor=COL["fill_node"], edgecolor="none", zorder=3.5)
    ax.add_patch(inner)


def _icon_firewall(ax, cx: float, cy: float, size: float = 0.18) -> None:
    """Firewall: a brick wall pattern."""
    w = size * 1.6
    h = size * 1.0
    box = Rectangle((cx - w / 2, cy - h / 2), w, h,
                    facecolor=COL["fill_node"], edgecolor=COL["ink"], linewidth=1.1, zorder=3)
    ax.add_patch(box)
    rows = 3
    for r in range(rows):
        y = cy - h / 2 + (r + 1) * h / rows
        if r < rows - 1:
            ax.add_line(Line2D([cx - w / 2, cx + w / 2], [y, y], color=COL["ink"], linewidth=0.9, zorder=4))
    # Brick offsets
    for r in range(rows):
        y_low = cy - h / 2 + r * h / rows
        y_high = y_low + h / rows
        offset = (w / 4) if r % 2 == 0 else 0.0
        x = cx - w / 2 + offset
        while x < cx + w / 2:
            if x > cx - w / 2 and x < cx + w / 2:
                ax.add_line(Line2D([x, x], [y_low, y_high], color=COL["ink"], linewidth=0.9, zorder=4))
            x += w / 2


def _icon_user(ax, cx: float, cy: float, size: float = 0.16) -> None:
    """Stick figure user: head circle + shoulder arc."""
    head = Circle((cx, cy + size * 0.4), size * 0.28,
                  facecolor=COL["fill_node"], edgecolor=COL["ink"], linewidth=1.1, zorder=4)
    ax.add_patch(head)
    body = mpatches.FancyArrowPatch(
        (cx - size * 0.55, cy - size * 0.3),
        (cx + size * 0.55, cy - size * 0.3),
        connectionstyle="arc3,rad=-0.6",
        arrowstyle="-",
        color=COL["ink"],
        linewidth=1.2,
        zorder=4,
    )
    ax.add_patch(body)


ICON_DRAWERS = {
    "router": _icon_router,
    "switch": _icon_switch,
    "host": _icon_host,
    "pc": _icon_host,
    "client": _icon_host,
    "server": _icon_server,
    "cloud": _icon_cloud,
    "isp": _icon_cloud,
    "internet": _icon_cloud,
    "firewall": _icon_firewall,
    "user": _icon_user,
}


def _resolve_color(spec: str | None, default: str) -> str:
    if not spec:
        return default
    spec = spec.strip().lower()
    if spec in FLOW:
        return FLOW[spec]
    if spec.startswith("#") or spec.startswith("rgb"):
        return spec
    return default


# ───────────────────────────────────────────────────────────────────────────
# Renderer: network_topology  (Cisco-style icons, optional weighted/coloured paths)
# ───────────────────────────────────────────────────────────────────────────

def render_network_topology(ax, data: dict[str, Any], title: str | None) -> None:
    """
    data = {
      "nodes": [
        {"id": "R1", "label": "R1", "kind": "router"|"switch"|"host"|"server"|"cloud"|"firewall"|"user",
         "ip": "10.0.0.1", "extra": "Eth0/0"   # extra/sub-label printed in italics under the icon
         "pos": [x, y]   # optional explicit coord (data units 0..10)
        }
      ],
      "links": [
        {"from": "R1", "to": "R2",
         "label": "Fa0/0 ↔ Fa0/1",   # printed near the midpoint
         "weight": 5,                # printed at midpoint when no label
         "bandwidth": "1 Gbps",       # printed alongside the line
         "style": "solid"|"dashed",  # default solid
         "color": "blue"|"red"|"amber"|... or "#hex",
         "width": 1.4               # optional override
        }
      ],
      "flows": [
        {"path": ["H1","R1","R2","S1"], "color": "red", "label": "TCP flow", "width": 3.0,
         "offset": 0.04   # perpendicular offset so multiple flows on the same link can be seen
        }
      ],
      "layout": "kamada_kawai" | "spring" | "shell" | "explicit"
    }
    """
    nodes = data.get("nodes", [])
    links = data.get("links", [])
    flows = data.get("flows", [])
    layout = data.get("layout", "kamada_kawai")

    G = nx.Graph()
    for n in nodes:
        G.add_node(n["id"], **n)
    for l in links:
        G.add_edge(l["from"], l["to"], **l)

    # Position resolution. Honour explicit "pos" if every node has one.
    explicit_pos = {n["id"]: tuple(n["pos"]) for n in nodes if n.get("pos")}
    if layout == "explicit" and len(explicit_pos) == len(nodes):
        pos = explicit_pos
    elif layout == "shell":
        pos = nx.shell_layout(G)
    elif layout == "spring":
        pos = nx.spring_layout(G, seed=42, k=3.0 / max(1, math.sqrt(len(nodes))), iterations=200)
    else:
        # kamada_kawai often clusters tree-shaped nets too tight; for
        # small graphs we get a much cleaner picture from spring with a
        # high `k` repulsion. Use kamada_kawai only when explicitly asked.
        try:
            pos = nx.spring_layout(G, seed=42, k=3.0 / max(1, math.sqrt(len(nodes))), iterations=200)
        except Exception:
            pos = nx.kamada_kawai_layout(G)
    # Override individual nodes that pinned a pos.
    for nid, p in explicit_pos.items():
        pos[nid] = p

    # Normalise positions to a fixed bounding box so icon sizes match
    # regardless of layout's natural scale. We aim for a span larger
    # than the icon footprint so labels don't crash into other nodes.
    if pos:
        xs = [p[0] for p in pos.values()]
        ys = [p[1] for p in pos.values()]
        min_x, max_x = min(xs), max(xs)
        min_y, max_y = min(ys), max(ys)
        span_x = max(1e-3, max_x - min_x)
        span_y = max(1e-3, max_y - min_y)
        # Use ~1.4 data units per node along each axis so icons
        # (footprint ~0.6) plus their text labels have breathing room.
        target_x = max(5.0, 1.4 * math.sqrt(len(nodes)) * 1.5)
        target_y = max(4.0, 1.2 * math.sqrt(len(nodes)) * 1.2)
        for nid, (x, y) in list(pos.items()):
            pos[nid] = (
                (x - min_x) / span_x * target_x,
                (y - min_y) / span_y * target_y,
            )

    # ── 1. Base links (drawn first so icons sit above them).
    for u, v, d in G.edges(data=True):
        x1, y1 = pos[u]
        x2, y2 = pos[v]
        color = _resolve_color(d.get("color"), COL["rule"])
        style = d.get("style", "solid")
        width = float(d.get("width", 1.3))
        ls = "--" if style == "dashed" else "-"
        ax.plot([x1, x2], [y1, y2], color=color, linewidth=width, linestyle=ls,
                solid_capstyle="round", zorder=1)
        # Mid-edge label: prefer label > weight > bandwidth
        label_bits: list[str] = []
        if d.get("label"):
            label_bits.append(str(d["label"]))
        if d.get("bandwidth"):
            label_bits.append(str(d["bandwidth"]))
        if d.get("weight") is not None and not d.get("label"):
            label_bits.insert(0, str(d["weight"]))
        if label_bits:
            mx, my = (x1 + x2) / 2, (y1 + y2) / 2
            ax.text(mx, my, "  ".join(label_bits), fontsize=8, ha="center", va="center",
                    color=COL["ink_soft"], family="sans-serif",
                    bbox=dict(facecolor="white", edgecolor="none", pad=1.2), zorder=2)

    # ── 2. Highlighted flows on top of base links.
    if flows:
        for fi, flow in enumerate(flows):
            path = flow.get("path", [])
            if len(path) < 2:
                continue
            color = _resolve_color(flow.get("color"), list(FLOW.values())[fi % len(FLOW)])
            width = float(flow.get("width", 3.2))
            offset = float(flow.get("offset", 0.0))
            for i in range(len(path) - 1):
                a, b = path[i], path[i + 1]
                if a not in pos or b not in pos:
                    continue
                x1, y1 = pos[a]
                x2, y2 = pos[b]
                if offset:
                    # Perpendicular shift so multiple flows are visible.
                    dx, dy = x2 - x1, y2 - y1
                    norm = math.hypot(dx, dy) or 1.0
                    ox, oy = -dy / norm * offset, dx / norm * offset
                    x1, y1, x2, y2 = x1 + ox, y1 + oy, x2 + ox, y2 + oy
                ax.add_patch(FancyArrowPatch(
                    (x1, y1), (x2, y2),
                    arrowstyle="-|>", color=color, linewidth=width,
                    mutation_scale=12, alpha=0.92, zorder=3,
                ))
            # Flow label — drop near the start of the path.
            if flow.get("label"):
                fx, fy = pos[path[0]]
                ax.text(fx, fy + 0.32, str(flow["label"]),
                        fontsize=9, ha="center", va="bottom",
                        color=color, fontweight="bold",
                        bbox=dict(facecolor="white", edgecolor=color, pad=2, boxstyle="round,pad=0.2"),
                        zorder=6)

    # ── 3. Icons + labels.
    for n in nodes:
        nid = n["id"]
        if nid not in pos:
            continue
        x, y = pos[nid]
        kind = (n.get("kind") or "host").lower()
        drawer = ICON_DRAWERS.get(kind, _icon_host)
        size = float(n.get("size", 0.34))  # bigger default for visibility
        drawer(ax, x, y, size=size)
        # Primary label below the icon — pushed clear of icon footprint
        label = n.get("label", nid)
        label_y = y - size * 1.55
        ax.text(x, label_y, label,
                fontsize=10, ha="center", va="top",
                color=COL["ink"], fontweight="bold", family="sans-serif", zorder=6,
                bbox=dict(facecolor="white", edgecolor="none", pad=1))
        # Sub-label (IP / extra) below the primary label
        sub_bits: list[str] = []
        if n.get("ip"):
            sub_bits.append(str(n["ip"]))
        if n.get("extra"):
            sub_bits.append(str(n["extra"]))
        if sub_bits:
            ax.text(x, label_y - 0.30, " / ".join(sub_bits),
                    fontsize=8.5, ha="center", va="top",
                    color=COL["muted"], fontstyle="italic", family="sans-serif", zorder=6,
                    bbox=dict(facecolor="white", edgecolor="none", pad=1))

    # Frame
    ax.set_aspect("equal")
    ax.set_axis_off()
    ax.margins(0.22)
    if title:
        ax.set_title(title, pad=14)


# ───────────────────────────────────────────────────────────────────────────
# Renderer: weighted_graph  (routing / shortest-path style)
# ───────────────────────────────────────────────────────────────────────────

def render_weighted_graph(ax, data: dict[str, Any], title: str | None) -> None:
    """
    Distance-vector / link-state / Dijkstra style diagram.

    data = {
      "nodes": [{"id": "u", "label": "u", "pos": [x, y] (optional)}],
      "edges": [{"from": "u", "to": "v", "weight": 3, "color"?: "...", "width"?: ...}],
      "paths": [{"nodes": ["u","v","w","z"], "color": "red", "label": "shortest u→z", "width": 3.0}]
        # multiple highlighted paths supported (e.g. red traffic + yellow traffic)
    }
    """
    nodes = data.get("nodes", [])
    edges = data.get("edges", [])
    paths = data.get("paths", [])

    G = nx.Graph()
    for n in nodes:
        G.add_node(n["id"], **n)
    for e in edges:
        G.add_edge(e["from"], e["to"], **e)

    explicit_pos = {n["id"]: tuple(n["pos"]) for n in nodes if n.get("pos")}
    if len(explicit_pos) == len(nodes) and nodes:
        pos = explicit_pos
    else:
        try:
            pos = nx.kamada_kawai_layout(G)
        except Exception:
            pos = nx.spring_layout(G, seed=21)
        # Normalise
        xs = [p[0] for p in pos.values()]
        ys = [p[1] for p in pos.values()]
        if xs and ys:
            min_x, max_x = min(xs), max(xs)
            min_y, max_y = min(ys), max(ys)
            span_x = max(1e-3, max_x - min_x)
            span_y = max(1e-3, max_y - min_y)
            for nid in pos:
                x, y = pos[nid]
                pos[nid] = ((x - min_x) / span_x * 4, (y - min_y) / span_y * 4)
        for nid, p in explicit_pos.items():
            pos[nid] = p

    # Edges (base)
    for u, v, d in G.edges(data=True):
        x1, y1 = pos[u]
        x2, y2 = pos[v]
        color = _resolve_color(d.get("color"), COL["rule"])
        width = float(d.get("width", 1.2))
        ax.plot([x1, x2], [y1, y2], color=color, linewidth=width, zorder=1)
        # Weight label
        if d.get("weight") is not None:
            mx, my = (x1 + x2) / 2, (y1 + y2) / 2
            ax.text(mx, my, str(d["weight"]),
                    fontsize=10, ha="center", va="center",
                    color=COL["ink"],
                    bbox=dict(facecolor="white", edgecolor=COL["ink_soft"],
                              boxstyle="round,pad=0.18", linewidth=0.7),
                    zorder=2)

    # Highlighted paths
    for pi, p in enumerate(paths):
        path_nodes = p.get("nodes", [])
        if len(path_nodes) < 2:
            continue
        color = _resolve_color(p.get("color"), list(FLOW.values())[pi % len(FLOW)])
        width = float(p.get("width", 3.5))
        offset = float(p.get("offset", 0.0))
        for i in range(len(path_nodes) - 1):
            a, b = path_nodes[i], path_nodes[i + 1]
            if a not in pos or b not in pos:
                continue
            x1, y1 = pos[a]
            x2, y2 = pos[b]
            if offset:
                dx, dy = x2 - x1, y2 - y1
                norm = math.hypot(dx, dy) or 1.0
                ox, oy = -dy / norm * offset, dx / norm * offset
                x1, y1, x2, y2 = x1 + ox, y1 + oy, x2 + ox, y2 + oy
            ax.add_patch(FancyArrowPatch(
                (x1, y1), (x2, y2),
                arrowstyle="-|>", color=color, linewidth=width,
                mutation_scale=14, alpha=0.92, zorder=3,
            ))
        if p.get("label"):
            fx, fy = pos[path_nodes[0]]
            ax.text(fx - 0.15, fy + 0.45, str(p["label"]),
                    fontsize=9, ha="left", va="bottom", color=color,
                    fontweight="bold",
                    bbox=dict(facecolor="white", edgecolor=color, pad=2,
                              boxstyle="round,pad=0.2"),
                    zorder=6)

    # Nodes (clean circles labelled inside)
    for n in nodes:
        nid = n["id"]
        if nid not in pos:
            continue
        x, y = pos[nid]
        circ = Circle((x, y), 0.28, facecolor=COL["fill_node"],
                      edgecolor=COL["ink"], linewidth=1.4, zorder=4)
        ax.add_patch(circ)
        ax.text(x, y, n.get("label", nid), ha="center", va="center",
                fontsize=11, fontweight="bold", color=COL["ink"],
                family="sans-serif", zorder=5)

    ax.set_aspect("equal")
    ax.set_axis_off()
    ax.margins(0.18)
    if title:
        ax.set_title(title, pad=12)


# ───────────────────────────────────────────────────────────────────────────
# Renderer: sequence_diagram  (with optional activation boxes + notes)
# ───────────────────────────────────────────────────────────────────────────

def render_sequence_diagram(ax, data: dict[str, Any], title: str | None) -> None:
    """
    data = {
      "actors":   ["Client", "Server"],
      "messages": [
        {"from": "Client", "to": "Server", "label": "SYN seq=x",
         "style": "solid"|"dashed",   # response → dashed
         "color": "blue"|"red"|... }   # optional
      ],
      "notes":    [{"after": <int>, "text": "..."}]  # optional
    }
    """
    actors = data.get("actors", [])
    messages = data.get("messages", [])
    notes = data.get("notes", [])

    if len(actors) < 2:
        actors = list(actors) + [f"Actor {i + 1}" for i in range(2 - len(actors))]
    n_actors = len(actors)

    # Layout: per-actor spacing scales with label length so long
    # labels (e.g. "Auth ns.example.com") don't overlap their neighbours.
    # 0.17 ≈ measured width of bold sans char at fontsize=11 in our axes.
    char_w = 0.17
    label_w = [max(1.6, char_w * len(a) + 0.7) for a in actors]
    actor_x: dict[str, float] = {}
    cursor = 0.0
    for i, a in enumerate(actors):
        if i == 0:
            cursor = label_w[0] / 2
        else:
            cursor += (label_w[i - 1] + label_w[i]) / 2 + 0.6
        actor_x[a] = cursor
    n_msgs = len(messages)
    n_notes = len(notes)
    rows = n_msgs + n_notes
    top_y = rows * 1.0 + 1.6
    bottom_y = -0.6

    # Header boxes + lifelines (box width tracks actual label width)
    for i, (a, x) in enumerate(actor_x.items()):
        w = label_w[i]
        box = FancyBboxPatch((x - w / 2, top_y - 0.6), w, 0.7,
                             boxstyle="round,pad=0.04",
                             linewidth=1.2, edgecolor=COL["ink"], facecolor=COL["fill_alt"], zorder=3)
        ax.add_patch(box)
        ax.text(x, top_y - 0.25, a, ha="center", va="center",
                fontsize=11, fontweight="bold", color=COL["ink"], family="sans-serif", zorder=4)
        ax.plot([x, x], [bottom_y, top_y - 0.6], linestyle=(0, (4, 3)),
                color=COL["muted"], linewidth=0.9, zorder=1)

    # Walk message+note timeline together so notes appear in order.
    row = 0
    note_iter = iter(sorted(notes, key=lambda n: n.get("after", 0)))
    next_note = next(note_iter, None)
    for i, msg in enumerate(messages):
        # Insert any notes that should appear *before* this message.
        while next_note and next_note.get("after", 0) < i:
            y = top_y - 1.2 - row * 1.0
            _draw_note(ax, next_note.get("text", ""), y, min(actor_x.values()), max(actor_x.values()))
            row += 1
            next_note = next(note_iter, None)

        y = top_y - 1.2 - row * 1.0
        x_from = actor_x.get(msg["from"], 0)
        x_to = actor_x.get(msg["to"], actor_x[actors[-1]])
        label = msg.get("label", "")
        style = msg.get("style", "solid")
        color = _resolve_color(msg.get("color"), COL["ink"])
        ls = "--" if style == "dashed" else "-"
        if x_from == x_to:
            # Self-loop on one actor
            ax.add_patch(FancyArrowPatch(
                (x_from + 0.05, y),
                (x_from + 0.05, y - 0.55),
                connectionstyle="arc3,rad=-1.0",
                arrowstyle="-|>", color=color, linewidth=1.4,
                linestyle=ls, mutation_scale=12, zorder=4,
            ))
            ax.text(x_from + 0.6, y - 0.3, label,
                    fontsize=9, va="center", ha="left", color=COL["ink"],
                    family="sans-serif")
        else:
            ax.add_patch(FancyArrowPatch(
                (x_from, y), (x_to, y),
                arrowstyle="-|>", color=color, linewidth=1.5,
                linestyle=ls, mutation_scale=12, zorder=4,
            ))
            mid_x = (x_from + x_to) / 2
            ax.text(mid_x, y + 0.18, label,
                    fontsize=9, ha="center", va="bottom", color=COL["ink"],
                    family="sans-serif",
                    bbox=dict(facecolor="white", edgecolor="none", pad=1.5))
        row += 1

    # Trailing notes
    while next_note:
        y = top_y - 1.2 - row * 1.0
        _draw_note(ax, next_note.get("text", ""), y, min(actor_x.values()), max(actor_x.values()))
        row += 1
        next_note = next(note_iter, None)

    ax.set_xlim(-1.3, max(actor_x.values()) + 1.3)
    ax.set_ylim(bottom_y - 0.8, top_y + 0.4)
    ax.set_aspect("auto")
    ax.set_axis_off()
    if title:
        ax.set_title(title, pad=12)


def _draw_note(ax, text: str, y: float, x_min: float, x_max: float) -> None:
    if not text:
        return
    # Span the full lifeline width.
    x0 = x_min - 0.9
    x1 = x_max + 0.9
    rect = FancyBboxPatch((x0, y - 0.32), x1 - x0, 0.55,
                          boxstyle="round,pad=0.04",
                          linewidth=1.0, edgecolor=COL["accent"],
                          facecolor="#eff6ff", zorder=3)
    ax.add_patch(rect)
    ax.text((x0 + x1) / 2, y - 0.05, text,
            fontsize=9, ha="center", va="center", color=COL["accent"],
            fontstyle="italic", family="sans-serif", zorder=4)


# ───────────────────────────────────────────────────────────────────────────
# Renderer: osi_stack  (vertical layered architecture)
# ───────────────────────────────────────────────────────────────────────────

def render_osi_stack(ax, data: dict[str, Any], title: str | None) -> None:
    """
    data = {
      "layers":    [{"name": "Application", "examples": "HTTP, DNS"}, ...],
      "highlight": ["Transport"],          # optional, blue accent
      "show_numbers": true                 # default true
    }
    """
    layers = data.get("layers", [])
    highlight = set(data.get("highlight", []))
    show_numbers = data.get("show_numbers", True)
    n = len(layers)

    box_w = 4.5
    box_h = 0.9
    gap = 0.14
    total_h = n * (box_h + gap)

    for i, layer in enumerate(layers):
        y = total_h - (i + 1) * (box_h + gap)
        is_hl = layer.get("name") in highlight
        face = "#dbeafe" if is_hl else COL["fill_alt"]
        edge = COL["accent"] if is_hl else COL["ink"]
        rect = FancyBboxPatch((0, y), box_w, box_h,
                              boxstyle="round,pad=0.02",
                              linewidth=1.4, edgecolor=edge, facecolor=face, zorder=2)
        ax.add_patch(rect)
        if show_numbers:
            ax.text(0.25, y + box_h / 2, f"{n - i}",
                    ha="left", va="center", fontsize=10, color=COL["muted"],
                    family="sans-serif")
        ax.text(box_w / 2, y + box_h / 2, layer.get("name", ""),
                ha="center", va="center", fontsize=12, fontweight="bold",
                color=COL["ink"], family="sans-serif")
        if layer.get("examples"):
            ax.text(box_w + 0.2, y + box_h / 2, str(layer["examples"]),
                    ha="left", va="center", fontsize=9.5, color=COL["ink_soft"],
                    fontstyle="italic", family="sans-serif")

    ax.set_xlim(-0.4, box_w + 4)
    ax.set_ylim(-0.4, total_h + 0.4)
    ax.set_aspect("auto")
    ax.set_axis_off()
    if title:
        ax.set_title(title, pad=10)


# ───────────────────────────────────────────────────────────────────────────
# Renderer: tcp_state  (FSM)
# ───────────────────────────────────────────────────────────────────────────

def render_tcp_state(ax, data: dict[str, Any], title: str | None) -> None:
    """
    Finite-state machine diagram (e.g. TCP congestion-control FSM with
    Slow Start / Congestion Avoidance / Fast Recovery).

    Each transition can use either a flat `label`, or split it into
    `condition` (drawn above a horizontal bar) and `action` (drawn below
    in italic — supports newline `\\n` for multi-line code-style actions).

    data = {
      "states": [
        {"id": "ss",  "label": "Slow start",          "pos": [0.0, 1.0]},
        {"id": "ca",  "label": "Congestion avoidance","pos": [1.4, 1.0]},
        {"id": "fr",  "label": "Fast recovery",       "pos": [0.7, 0.0]}
      ],
      "transitions": [
        {"from": "ss", "to": "ca", "condition": "cwnd >= ssthresh",
         "action": ""},
        {"from": "ca", "to": "fr", "condition": "dupACKcount == 3",
         "action": "ssthresh = cwnd/2\\ncwnd = ssthresh + 3*MSS\\nretransmit"},
        {"from": "fr", "to": "ca", "condition": "new ACK",
         "action": "cwnd = ssthresh\\ndupACKcount = 0"},
        {"from": "ss", "to": "ss", "condition": "duplicate ACK",
         "action": "dupACKcount++"}     # self-loop
      ],
      "initial": "ss",
      "initial_label": "cwnd=1 MSS\\nssthresh=64KB\\ndupACKcount=0"
    }
    """
    states = data.get("states", [])
    transitions = data.get("transitions", [])

    if not states:
        return

    # Position resolution. For 3-state FSMs with no explicit positions,
    # use a clean equilateral triangle (the canonical TCP-CC layout).
    explicit_pos: dict[str, tuple[float, float]] = {
        s["id"]: tuple(s["pos"]) for s in states if s.get("pos")
    }
    if len(explicit_pos) == len(states):
        pos = explicit_pos
    elif len(states) == 3:
        # Wider triangle — gives breathing room for transition labels.
        pos = {
            states[0]["id"]: (-2.4,  1.4),
            states[1]["id"]: ( 2.4,  1.4),
            states[2]["id"]: ( 0.0, -1.6),
        }
    elif len(states) == 2:
        pos = {states[0]["id"]: (-1.8, 0.0), states[1]["id"]: (1.8, 0.0)}
    else:
        # Generic placement: circle layout for the rest
        n = len(states)
        pos = {
            s["id"]: (2.2 * math.cos(2 * math.pi * i / n + math.pi / 2),
                      2.2 * math.sin(2 * math.pi * i / n + math.pi / 2))
            for i, s in enumerate(states)
        }
    for sid, p in explicit_pos.items():
        pos[sid] = p

    state_radius = 0.46

    # ── 1. Self-loops first (drawn behind so they don't cover state).
    self_loop_offsets: dict[str, int] = {}
    for t in transitions:
        if t["from"] == t["to"]:
            self_loop_offsets[t["from"]] = self_loop_offsets.get(t["from"], 0) + 1
    self_loop_seen: dict[str, int] = {}
    # ── 2. Group bidirectional pairs so we can offset them in opposite arcs.
    edge_pairs: dict[frozenset, list[dict]] = {}
    for t in transitions:
        if t["from"] == t["to"]:
            continue
        key = frozenset({t["from"], t["to"]})
        edge_pairs.setdefault(key, []).append(t)

    # Draw inter-state transitions
    for pair_key, pair in edge_pairs.items():
        for idx, t in enumerate(pair):
            x1, y1 = pos[t["from"]]
            x2, y2 = pos[t["to"]]
            # Curve direction depends on order in pair
            rad = 0.18 if idx == 0 else -0.18
            ax.add_patch(FancyArrowPatch(
                (x1, y1), (x2, y2),
                connectionstyle=f"arc3,rad={rad}",
                arrowstyle="-|>", color=COL["accent"], linewidth=1.4,
                mutation_scale=14,
                shrinkA=state_radius * 72, shrinkB=state_radius * 72,
                zorder=2,
            ))
            _draw_fsm_label(ax, x1, y1, x2, y2, rad, t)

    # Draw self-loops
    for t in transitions:
        if t["from"] != t["to"]:
            continue
        cx, cy = pos[t["from"]]
        slot = self_loop_seen.get(t["from"], 0)
        self_loop_seen[t["from"]] = slot + 1
        # Compass positions chosen for maximum separation when multiple
        # self-loops emanate from the same state.
        angles_deg = [135, 45, -135, -45, 90, -90, 180, 0]
        ang = math.radians(angles_deg[slot % len(angles_deg)])
        # Draw the loop as a tight arc with arrow
        ax.add_patch(FancyArrowPatch(
            (cx + state_radius * math.cos(ang - 0.30),
             cy + state_radius * math.sin(ang - 0.30)),
            (cx + state_radius * math.cos(ang + 0.30),
             cy + state_radius * math.sin(ang + 0.30)),
            connectionstyle="arc3,rad=2.4",
            arrowstyle="-|>", color=COL["accent"], linewidth=1.3,
            mutation_scale=12,
            zorder=2,
        ))
        # Label well outside the loop so it never overlaps with another.
        lbl_dist = state_radius + 1.05
        lbl_x = cx + lbl_dist * math.cos(ang)
        lbl_y = cy + lbl_dist * math.sin(ang)
        _draw_fsm_block_label(ax, lbl_x, lbl_y, t,
                              ha="center", va="center")

    # ── 3. State circles + labels (above edges)
    for s in states:
        x, y = pos[s["id"]]
        circ = Circle((x, y), state_radius,
                      facecolor="#dbeafe", edgecolor=COL["accent"],
                      linewidth=1.6, zorder=4)
        ax.add_patch(circ)
        # Wrap state label across two lines if it has a space
        lbl = s.get("label", s["id"])
        wrapped = lbl.replace(" ", "\n", 1) if len(lbl) > 10 else lbl
        ax.text(x, y, wrapped, ha="center", va="center",
                fontsize=9.5, fontweight="bold", color=COL["ink"],
                family="sans-serif", zorder=5)

    # ── 4. Initial-state arrow (entry to FSM). Pick an entry direction
    # that doesn't collide with any self-loop on that state.
    initial = data.get("initial")
    initial_label = data.get("initial_label", "")
    if initial and initial in pos:
        ix, iy = pos[initial]
        used = self_loop_seen.get(initial, 0)
        # Pick a free compass slot opposite to the densest self-loop side.
        entry_options = [
            (-1.6, -0.0),   # straight WEST
            (-1.5, -1.1),   # SW
            ( 0.0, -1.6),   # SOUTH
            ( 1.5, -1.1),   # SE
        ]
        ent_dx, ent_dy = entry_options[min(used, len(entry_options) - 1)]
        sx, sy = ix + ent_dx, iy + ent_dy
        # Tip of arrow lands on the state circle's edge along the dx,dy axis.
        ang = math.atan2(-ent_dy, -ent_dx)
        tx, ty = ix + state_radius * math.cos(ang), iy + state_radius * math.sin(ang)
        ax.add_patch(FancyArrowPatch(
            (sx, sy), (tx, ty),
            arrowstyle="-|>", color=COL["ink"], linewidth=1.2,
            linestyle=(0, (4, 3)), mutation_scale=12, zorder=3,
        ))
        if initial_label:
            # Anchor the label box on the side away from the state.
            ha = "right" if ent_dx < 0 else "left"
            ax.text(sx + (-0.08 if ent_dx < 0 else 0.08), sy, initial_label,
                    ha=ha, va="center", fontsize=8.5, color=COL["ink"],
                    family="monospace", zorder=4,
                    bbox=dict(facecolor="white", edgecolor=COL["rule"],
                              boxstyle="round,pad=0.30", linewidth=0.8))

    ax.set_aspect("equal")
    ax.set_axis_off()
    ax.margins(0.10)
    if title:
        ax.set_title(title, pad=12, fontsize=14, fontweight="bold")


def _draw_fsm_label(ax, x1: float, y1: float, x2: float, y2: float,
                    rad: float, t: dict[str, Any]) -> None:
    """Place a transition label at the midpoint of an arc, perpendicular
    to the chord and offset on the curved side. Adds a minimum offset so
    short edges still get a readable gap from the chord line."""
    mx, my = (x1 + x2) / 2, (y1 + y2) / 2
    dx, dy = x2 - x1, y2 - y1
    length = math.hypot(dx, dy) or 1.0
    # Perpendicular unit vector (rotated 90° CCW)
    px, py = -dy / length, dx / length
    # Offset proportional to curvature, with a generous floor so short
    # edges aren't crammed onto the chord line. Bidirectional pairs use
    # opposite signs so their labels land on opposite sides of the chord.
    raw = rad * length * 1.05
    sign = 1 if rad >= 0 else -1
    offset = sign * max(0.85, abs(raw))
    lx, ly = mx + px * offset, my + py * offset
    _draw_fsm_block_label(ax, lx, ly, t, ha="center", va="center")


def _draw_fsm_block_label(ax, x: float, y: float, t: dict[str, Any],
                          ha: str = "center", va: str = "center") -> None:
    """Draw a transition label as condition (above) + action (below italic).
    Falls back to flat `label` if condition/action aren't supplied."""
    cond = t.get("condition", "")
    action = t.get("action", "")
    if not cond and not action:
        # Backward-compatible flat label
        lbl = t.get("label", "")
        if not lbl:
            return
        ax.text(x, y, lbl, ha=ha, va=va, fontsize=8, color=COL["ink_soft"],
                family="sans-serif",
                bbox=dict(facecolor="white", edgecolor="none", pad=1.5),
                zorder=6)
        return
    # Block-style: condition on top, separator line, action below in italic.
    parts: list[tuple[str, dict[str, Any]]] = []
    if cond:
        parts.append((cond, dict(fontsize=8.5, color=COL["ink"],
                                  fontweight="bold", family="monospace")))
    if action:
        parts.append((action, dict(fontsize=8, color=COL["accent"],
                                    fontstyle="italic", family="sans-serif")))
    # Compose as a single multi-line string then style line-by-line via
    # multiple text() calls so we can keep different fonts/colors.
    line_h = 0.10
    n_lines = sum(len(p[0].split("\n")) for p in parts)
    # Add a thin rule between condition and action by drawing a faint line.
    total_h = n_lines * line_h
    cur_y = y + total_h / 2
    for i, (txt, style) in enumerate(parts):
        for line in txt.split("\n"):
            ax.text(x, cur_y, line, ha=ha, va="top",
                    bbox=dict(facecolor="white", edgecolor="none", pad=1.0),
                    zorder=6, **style)
            cur_y -= line_h
        if i == 0 and len(parts) > 1:
            # Faint separator between condition and action blocks
            sep_w = max(0.35, 0.05 * max(len(s) for s in txt.split("\n")))
            ax.plot([x - sep_w / 2, x + sep_w / 2], [cur_y + 0.02, cur_y + 0.02],
                    color=COL["rule"], linewidth=0.6, zorder=6)


# ───────────────────────────────────────────────────────────────────────────
# Renderer: leaky_bucket  (traffic shaping / rate limiting)
# ───────────────────────────────────────────────────────────────────────────

def render_leaky_bucket(ax, data: dict[str, Any], title: str | None) -> None:
    """
    Leaky-bucket / token-bucket traffic-shaping diagram.
    Bursty packets arrive on the upper-left; the bucket holds up to
    `capacity`; constant-rate output drips out the bottom-right.

    data = {
      "capacity":      8,
      "occupied":      5,
      "arriving":      [{"label": "P1"}, {"label": "P2"}, {"label": "P3"}],
      "outflow_rate":  "constant 1 pkt / RTT",
      "overflow":      0,                  # if > 0, draw spilling packets
      "mode":          "leaky"             # or "token"
    }
    """
    capacity = int(data.get("capacity", 8))
    occupied = int(data.get("occupied", capacity // 2))
    arriving = data.get("arriving", []) or []
    outflow_rate = data.get("outflow_rate", "constant rate")
    overflow = int(data.get("overflow", 0))
    mode = (data.get("mode") or "leaky").lower()

    # Bucket geometry — trapezoidal "pail" shape
    bx, by = 0.0, 0.0          # bottom-centre of bucket
    bw_top, bw_bot = 2.0, 1.4  # widths (top wider than bottom — pail)
    bh = 2.2                   # height

    # Bucket walls (no top — open)
    left_wall = [(bx - bw_top / 2, by + bh), (bx - bw_bot / 2, by)]
    right_wall = [(bx + bw_top / 2, by + bh), (bx + bw_bot / 2, by)]
    floor = [(bx - bw_bot / 2, by), (bx + bw_bot / 2, by)]
    for seg in [left_wall, right_wall, floor]:
        (x1, y1), (x2, y2) = seg
        ax.plot([x1, x2], [y1, y2], color=COL["accent2"], linewidth=2.6, zorder=3)

    # Water level (occupied tokens / packets) — drawn as polygon inside the pail
    if capacity > 0:
        frac = max(0.0, min(1.0, occupied / capacity))
        water_y = by + bh * frac
        # Interpolate widths at water_y
        w_at = lambda y: bw_bot + (bw_top - bw_bot) * (y - by) / bh
        wb = w_at(by); wt = w_at(water_y)
        water_pts = [
            (bx - wb / 2, by),
            (bx + wb / 2, by),
            (bx + wt / 2, water_y),
            (bx - wt / 2, water_y),
        ]
        ax.add_patch(Polygon(water_pts, closed=True,
                              facecolor="#bfdbfe", edgecolor="none",
                              alpha=0.85, zorder=2))
        # Draw 'token-like' shapes inside if mode=token
        if mode == "token":
            for i in range(occupied):
                tx = bx - bw_bot / 4 + (i % 3) * (bw_bot / 4)
                ty = by + 0.18 + (i // 3) * 0.32
                ax.add_patch(Circle((tx, ty), 0.10,
                                     facecolor=COL["accent3"],
                                     edgecolor=COL["ink"], linewidth=0.7,
                                     zorder=4))
        ax.text(bx, water_y + 0.06,
                f"{occupied}/{capacity} {'tokens' if mode=='token' else 'pkts'}",
                ha="center", va="bottom", fontsize=9, color=COL["ink"],
                fontweight="bold", family="sans-serif", zorder=5)

    # Arriving packets (bursty) above the bucket
    for i, p in enumerate(arriving):
        ax_x = bx - 1.6 + i * 0.55
        ay = by + bh + 0.7 + (i % 2) * 0.22  # vertical jitter for "bursty"
        rect = Rectangle((ax_x, ay), 0.42, 0.32,
                          facecolor=COL["fill_alt"], edgecolor=COL["ink"],
                          linewidth=1.0, zorder=4)
        # Slight rotation makes them look tumbling
        from matplotlib import transforms as _tx
        tr = _tx.Affine2D().rotate_deg_around(ax_x + 0.21, ay + 0.16,
                                                (-1) ** i * 12) + ax.transData
        rect.set_transform(tr)
        ax.add_patch(rect)
        ax.text(ax_x + 0.21, ay + 0.16, p.get("label", "P"),
                ha="center", va="center", fontsize=8.5, color=COL["ink"],
                fontweight="bold", family="sans-serif", zorder=5,
                transform=tr)

    if arriving:
        ax.annotate(
            "Bursty inflow",
            xy=(bx - 0.4, by + bh + 0.55),
            xytext=(bx - 2.1, by + bh + 1.4),
            fontsize=10, color=COL["accent3"], fontweight="bold",
            family="sans-serif",
            arrowprops=dict(arrowstyle="->", color=COL["accent3"], lw=1.2),
            ha="center",
        )

    # Overflow packets spilling over the rim
    for i in range(overflow):
        sx = bx + bw_top / 2 + 0.15 + i * 0.32
        sy = by + bh - 0.05 - i * 0.12
        ax.add_patch(Rectangle((sx, sy), 0.34, 0.26,
                                facecolor="#fecaca", edgecolor=COL["accent2"],
                                linewidth=1.0, zorder=4))
    if overflow:
        ax.text(bx + bw_top / 2 + 0.5, by + bh + 0.25,
                f"{overflow} dropped (overflow)",
                ha="left", va="bottom", fontsize=9, color=COL["accent2"],
                fontweight="bold", family="sans-serif")

    # Bottom drip / constant outflow arrow
    drip_x = bx + bw_bot / 2 + 0.1
    ax.add_patch(FancyArrowPatch(
        (drip_x, by + 0.02),
        (drip_x + 1.2, by + 0.02),
        arrowstyle="-|>", color=COL["accent"], linewidth=1.6,
        mutation_scale=14, zorder=3,
    ))
    ax.text(drip_x + 1.3, by + 0.02, outflow_rate,
            ha="left", va="center", fontsize=10, color=COL["accent"],
            fontweight="bold", family="sans-serif")
    ax.text(drip_x + 1.3, by - 0.25, "constant outflow",
            ha="left", va="center", fontsize=8.5, color=COL["muted"],
            fontstyle="italic", family="sans-serif")

    ax.set_xlim(bx - 2.6, drip_x + 3.4)
    ax.set_ylim(by - 0.7, by + bh + 1.9)
    ax.set_aspect("equal")
    ax.set_axis_off()
    if title:
        ax.set_title(title, pad=14)


# ───────────────────────────────────────────────────────────────────────────
# Renderer: subnet_tree  (hierarchy: VLSM, DNS, AS structure)
# ───────────────────────────────────────────────────────────────────────────

def render_subnet_tree(ax, data: dict[str, Any], title: str | None) -> None:
    root = data.get("root", {})
    G = nx.DiGraph()
    pos: dict[str, tuple[float, float]] = {}
    labels: dict[str, str] = {}
    counter = {"i": 0}

    def add(node: dict[str, Any], depth: int, x_range: tuple[float, float]) -> str:
        nid = f"n{counter['i']}"
        counter["i"] += 1
        labels[nid] = node.get("label", "")
        x_mid = (x_range[0] + x_range[1]) / 2
        pos[nid] = (x_mid, -depth * 1.3)
        G.add_node(nid)
        children = node.get("children", []) or []
        if children:
            width = (x_range[1] - x_range[0]) / len(children)
            for i, ch in enumerate(children):
                child_range = (x_range[0] + i * width, x_range[0] + (i + 1) * width)
                child_id = add(ch, depth + 1, child_range)
                G.add_edge(nid, child_id)
        return nid

    add(root, 0, (0.0, 12.0))

    # Edges (drawn from parent box bottom to child box top, with right-angle)
    for u, v in G.edges():
        x1, y1 = pos[u]
        x2, y2 = pos[v]
        # Vertical drop, then horizontal, then vertical rise (orthogonal)
        mid_y = (y1 + y2) / 2
        ax.plot([x1, x1], [y1 - 0.22, mid_y], color=COL["ink"], linewidth=1.0, zorder=1)
        ax.plot([x1, x2], [mid_y, mid_y], color=COL["ink"], linewidth=1.0, zorder=1)
        ax.plot([x2, x2], [mid_y, y2 + 0.22], color=COL["ink"], linewidth=1.0, zorder=1)

    for nid, (x, y) in pos.items():
        text = labels[nid]
        rect = FancyBboxPatch((x - 1.55, y - 0.22), 3.1, 0.45,
                              boxstyle="round,pad=0.04",
                              linewidth=1.1, edgecolor=COL["ink"],
                              facecolor=COL["fill_alt"], zorder=3)
        ax.add_patch(rect)
        ax.text(x, y, text, ha="center", va="center",
                fontsize=9.5, color=COL["ink"], family="sans-serif", zorder=4)

    ax.set_aspect("auto")
    ax.set_axis_off()
    ax.margins(0.10)
    if title:
        ax.set_title(title, pad=12)


# ───────────────────────────────────────────────────────────────────────────
# Renderer: protocol_stack  (side-by-side encapsulation)
# ───────────────────────────────────────────────────────────────────────────

def render_protocol_stack(ax, data: dict[str, Any], title: str | None) -> None:
    columns = data.get("columns", [])
    arrows = data.get("arrows", [])

    box_w = 2.5
    box_h = 0.75
    gap = 0.14
    col_gap = 1.7

    col_x: dict[int, float] = {}
    max_layers = 0
    for ci, col in enumerate(columns):
        x = ci * (box_w + col_gap)
        col_x[ci] = x
        layers = col.get("layers", [])
        max_layers = max(max_layers, len(layers))
        ax.text(x + box_w / 2, len(layers) * (box_h + gap) + 0.3, col.get("label", ""),
                ha="center", va="bottom", fontsize=11, fontweight="bold",
                color=COL["ink"], family="sans-serif")
        for li, layer in enumerate(layers):
            y = (len(layers) - 1 - li) * (box_h + gap)
            rect = FancyBboxPatch((x, y), box_w, box_h,
                                  boxstyle="round,pad=0.02",
                                  linewidth=1.2, edgecolor=COL["ink"],
                                  facecolor=COL["fill_alt"], zorder=2)
            ax.add_patch(rect)
            ax.text(x + box_w / 2, y + box_h / 2, layer,
                    ha="center", va="center", fontsize=10,
                    color=COL["ink"], family="sans-serif")

    for arr in arrows:
        c1, l1 = arr["from"]
        c2, l2 = arr["to"]
        n1 = len(columns[c1]["layers"])
        n2 = len(columns[c2]["layers"])
        x1 = col_x[c1] + box_w
        y1 = (n1 - 1 - l1) * (box_h + gap) + box_h / 2
        x2 = col_x[c2]
        y2 = (n2 - 1 - l2) * (box_h + gap) + box_h / 2
        style = "<->" if arr.get("bi", True) else "-|>"
        ax.add_patch(FancyArrowPatch((x1, y1), (x2, y2),
                                     arrowstyle=style, color=COL["accent"],
                                     linewidth=1.3, linestyle="--",
                                     mutation_scale=12, zorder=3))
        if arr.get("label"):
            ax.text((x1 + x2) / 2, (y1 + y2) / 2 + 0.18, arr["label"],
                    ha="center", fontsize=8.5, color=COL["accent"],
                    fontstyle="italic", family="sans-serif",
                    bbox=dict(facecolor="white", edgecolor="none", pad=1))

    total_w = len(columns) * (box_w + col_gap)
    ax.set_xlim(-0.4, total_w)
    ax.set_ylim(-0.5, max_layers * (box_h + gap) + 0.9)
    ax.set_aspect("auto")
    ax.set_axis_off()
    if title:
        ax.set_title(title, pad=10)


# ───────────────────────────────────────────────────────────────────────────
# Renderer: packet_format  (RFC-style header byte/bit field layout)
# ───────────────────────────────────────────────────────────────────────────

def render_packet_format(ax, data: dict[str, Any], title: str | None) -> None:
    """
    Draws an RFC-style header field layout. Each row spans `bits_per_row`
    bits (default 32) and contains 1+ fields, each consuming a number of
    bits. Columns at the top show bit positions.

    data = {
      "bits_per_row": 32,
      "rows": [
        [{"name": "Source Port",      "bits": 16},
         {"name": "Destination Port", "bits": 16}],
        [{"name": "Sequence Number",  "bits": 32}],
        [{"name": "Acknowledgement Number", "bits": 32}],
        [{"name": "Data Offset", "bits": 4},
         {"name": "Reserved",    "bits": 6},
         {"name": "Flags",       "bits": 6},
         {"name": "Window Size", "bits": 16}]
      ]
    }
    """
    bits_per_row = int(data.get("bits_per_row", 32))
    rows: list[list[dict[str, Any]]] = data.get("rows", [])

    cell_w = 0.38
    row_h = 0.85
    total_w = bits_per_row * cell_w
    n_rows = len(rows)
    top_y = n_rows * row_h

    # Bit-position scale across the top
    for b in range(bits_per_row + 1):
        x = b * cell_w
        # tick
        ax.plot([x, x], [top_y + 0.1, top_y + 0.25], color=COL["ink"], linewidth=0.7)
        # label every 4 bits
        if b % 4 == 0:
            ax.text(x, top_y + 0.32, str(b), ha="center", va="bottom",
                    fontsize=7.5, color=COL["muted"], family="sans-serif")

    # Header label
    ax.text(-0.35, top_y + 0.32, "bit", ha="right", va="bottom",
            fontsize=8, color=COL["muted"], family="sans-serif", fontstyle="italic")

    # Row outlines + field cells
    for ri, row_fields in enumerate(rows):
        row_top = top_y - ri * row_h
        row_bot = row_top - row_h
        # row index on the left
        ax.text(-0.25, (row_top + row_bot) / 2, f"{ri * 4} ",
                ha="right", va="center", fontsize=8, color=COL["muted"],
                family="sans-serif")
        x_cursor = 0
        total_bits = sum(int(f.get("bits", 0)) for f in row_fields)
        if total_bits != bits_per_row:
            # Soft warning on the diagram itself
            ax.text(total_w + 0.2, (row_top + row_bot) / 2,
                    f"⚠ {total_bits}/{bits_per_row} bits",
                    ha="left", va="center", fontsize=7.5, color=COL["accent2"],
                    fontstyle="italic", family="sans-serif")

        for f in row_fields:
            bits = int(f.get("bits", 0))
            w = bits * cell_w
            rect = Rectangle((x_cursor, row_bot), w, row_h,
                             facecolor=COL["fill_alt"], edgecolor=COL["ink"],
                             linewidth=1.0, zorder=2)
            ax.add_patch(rect)
            name = f.get("name", "")
            label = f"{name}\n({bits} bits)" if name else f"{bits} bits"
            ax.text(x_cursor + w / 2, (row_top + row_bot) / 2,
                    label, ha="center", va="center", fontsize=9,
                    color=COL["ink"], family="sans-serif")
            x_cursor += w

    ax.set_xlim(-0.6, total_w + 0.6)
    ax.set_ylim(-0.4, top_y + 0.9)
    ax.set_aspect("equal")
    ax.set_axis_off()
    if title:
        ax.set_title(title, pad=12)


# ───────────────────────────────────────────────────────────────────────────
# Renderer: queueing_diagram  (FIFO / RED / tail-drop)
# ───────────────────────────────────────────────────────────────────────────

def render_queueing_diagram(ax, data: dict[str, Any], title: str | None) -> None:
    """
    A queue with arriving packets on the left, queued packets in the
    middle, an outgoing pipe on the right, and an optional dropped
    packet falling below.

    data = {
      "label":         "FIFO with tail-drop",     # optional caption above
      "slots":         8,                         # queue capacity
      "occupied":      6,                         # how many slots filled
      "arriving":      [{"label": "P9"}],         # 0+ packets arriving
      "drop":          true,                      # show dropped packet
      "outgoing":      "next to transmit",        # right-side label
      "annotations":   [                          # optional pointer arrows
        {"text": "Free buffers", "target_slot": 1, "where": "below"},
        {"text": "Queued packets", "target_slot": 4, "where": "below"}
      ]
    }
    """
    slots = int(data.get("slots", 8))
    occupied = int(data.get("occupied", slots // 2))
    arriving = data.get("arriving", [])
    drop = bool(data.get("drop", False))
    outgoing = data.get("outgoing", "Next to transmit")
    annotations = data.get("annotations", [])
    label = data.get("label")

    cell_w = 0.7
    cell_h = 1.0
    total_w = slots * cell_w
    base_x = 1.6
    base_y = 0

    # Arriving packet(s) on left
    for i, p in enumerate(arriving):
        ax.add_patch(Rectangle((base_x - 1.2 - i * 0.85, base_y), 0.65, cell_h,
                               facecolor=COL["fill_alt"], edgecolor=COL["ink"],
                               linewidth=1.1))
        ax.text(base_x - 1.2 - i * 0.85 + 0.32, base_y + cell_h / 2,
                p.get("label", "P"), ha="center", va="center",
                fontsize=10, fontweight="bold", color=COL["ink"], family="sans-serif")
    if arriving:
        ax.text(base_x - 0.95, base_y + cell_h + 0.25, "Arriving packet",
                ha="center", va="bottom", fontsize=9, fontstyle="italic",
                color=COL["muted"], family="sans-serif")
        # Arrow into the queue
        ax.add_patch(FancyArrowPatch(
            (base_x - 0.5, base_y + cell_h / 2),
            (base_x - 0.05, base_y + cell_h / 2),
            arrowstyle="-|>", color=COL["ink"], linewidth=1.2,
            mutation_scale=10,
        ))

    # Queue slots (left side empty, right side filled — packets queue
    # at the tail and depart at the head, which is on the right).
    for s in range(slots):
        x = base_x + s * cell_w
        # Filled iff this slot is among the LAST `occupied` slots.
        is_filled = s >= slots - occupied
        face = COL["fill_alt"] if is_filled else "white"
        rect = Rectangle((x, base_y), cell_w, cell_h,
                         facecolor=face, edgecolor=COL["ink"], linewidth=1.0)
        ax.add_patch(rect)
        # Dashed verticals between empty slots (textbook style)
        if not is_filled and s < slots - 1:
            ax.plot([x + cell_w, x + cell_w], [base_y + 0.1, base_y + cell_h - 0.1],
                    linestyle=(0, (3, 3)), color=COL["ink_soft"], linewidth=0.7)
    # Top + bottom rules emphasising it's one buffer
    ax.plot([base_x, base_x + total_w], [base_y, base_y], color=COL["ink"], linewidth=1.2)
    ax.plot([base_x, base_x + total_w], [base_y + cell_h, base_y + cell_h], color=COL["ink"], linewidth=1.2)

    # Outgoing pipe + arrow
    out_x = base_x + total_w + 0.4
    ax.add_patch(FancyArrowPatch(
        (base_x + total_w + 0.05, base_y + cell_h / 2),
        (out_x + 0.7, base_y + cell_h / 2),
        arrowstyle="-|>", color=COL["ink"], linewidth=1.4,
        mutation_scale=12,
    ))
    ax.text(out_x + 0.35, base_y + cell_h + 0.15, outgoing,
            ha="center", va="bottom", fontsize=9, fontstyle="italic",
            color=COL["muted"], family="sans-serif")

    # Drop arrow underneath
    if drop:
        drop_x = base_x - 0.85
        ax.add_patch(FancyArrowPatch(
            (drop_x, base_y),
            (drop_x, base_y - 0.7),
            arrowstyle="-|>", color=COL["accent2"], linewidth=1.3,
            mutation_scale=12,
        ))
        ax.text(drop_x + 0.05, base_y - 0.78, "Drop",
                ha="left", va="top", fontsize=9, color=COL["accent2"],
                fontweight="bold", family="sans-serif")

    # Annotations under the queue (curly-style brace approximated by line)
    for ann in annotations:
        text = ann.get("text", "")
        target = max(0, min(slots - 1, int(ann.get("target_slot", 0))))
        x = base_x + target * cell_w + cell_w / 2
        # Brace line
        ax.plot([x - cell_w * 0.4, x + cell_w * 0.4], [base_y - 0.15, base_y - 0.15],
                color=COL["ink"], linewidth=0.9)
        ax.add_patch(FancyArrowPatch(
            (x, base_y - 0.15), (x, base_y - 0.5),
            arrowstyle="-", color=COL["ink"], linewidth=0.9,
        ))
        ax.text(x, base_y - 0.6, text,
                ha="center", va="top", fontsize=9, color=COL["ink_soft"],
                family="sans-serif")

    if label:
        ax.text(base_x + total_w / 2, base_y + cell_h + 0.85, label,
                ha="center", va="bottom", fontsize=10.5,
                fontweight="bold", color=COL["ink"], family="sans-serif")

    ax.set_xlim(-0.5, out_x + 1.6)
    ax.set_ylim(-1.2, cell_h + 1.5)
    ax.set_aspect("equal")
    ax.set_axis_off()
    if title:
        ax.set_title(title, pad=12)


# ───────────────────────────────────────────────────────────────────────────
# Renderer: timeline  (sliding-window / cwnd-vs-time / stop-and-wait)
# ───────────────────────────────────────────────────────────────────────────

def render_timeline(ax, data: dict[str, Any], title: str | None) -> None:
    """
    Time-series line chart for cwnd vs RTT, ssthresh, throughput, etc.
    Supports shaded phase regions (Slow Start / Congestion Avoidance / Fast
    Recovery backgrounds) and per-series step-style drawing for cwnd drops.

    data = {
      "x_label": "Transmission round (RTT)",
      "y_label": "cwnd (MSS)",
      "series":  [
        {"label": "TCP Reno", "points": [[0,1],[1,2],[2,4],[3,8],[4,16],[5,17],[6,18],[7,9],[8,10]],
         "style": "solid", "color": "blue", "step": false},
        {"label": "ssthresh", "points": [[0,16],[7,16],[7,9],[15,9]], "style": "dashed", "color": "amber"}
      ],
      "phases": [
        {"x_start": 0, "x_end": 5,  "label": "Slow Start",          "color": "#dbeafe"},
        {"x_start": 5, "x_end": 7,  "label": "Cong. Avoidance",     "color": "#dcfce7"},
        {"x_start": 7, "x_end": 15, "label": "Fast Recovery",       "color": "#fee2e2"}
      ],
      "events":  [{"x": 7, "label": "3 dup ACKs → fast retransmit"}]
    }
    """
    series = data.get("series", [])
    events = data.get("events", [])
    phases = data.get("phases", [])
    x_label = data.get("x_label", "")
    y_label = data.get("y_label", "")

    # Compute global y-range first so phases + event labels know the top.
    y_min, y_max = 0.0, 1.0
    x_min, x_max = 0.0, 1.0
    has_pts = False
    for s in series:
        for x, y in s.get("points", []) or []:
            if not has_pts:
                x_min = x_max = float(x)
                y_min = y_max = float(y)
                has_pts = True
            else:
                x_min = min(x_min, float(x)); x_max = max(x_max, float(x))
                y_min = min(y_min, float(y)); y_max = max(y_max, float(y))
    y_range = max(1.0, y_max - y_min)
    y_top = y_max + y_range * 0.18

    # Draw shaded phase backgrounds first (behind everything).
    phase_palette = ["#dbeafe", "#dcfce7", "#fee2e2", "#fef3c7", "#f3e8ff"]
    for i, ph in enumerate(phases):
        xs = float(ph.get("x_start", 0)); xe = float(ph.get("x_end", 0))
        if xe <= xs:
            continue
        color = ph.get("color") or phase_palette[i % len(phase_palette)]
        ax.axvspan(xs, xe, facecolor=color, alpha=0.55, zorder=0)
        if ph.get("label"):
            ax.text((xs + xe) / 2, y_top, ph["label"],
                    ha="center", va="top", fontsize=9.5, color=COL["ink"],
                    fontweight="bold", family="sans-serif",
                    bbox=dict(facecolor="white", edgecolor="none", pad=1.5),
                    zorder=2)

    # Draw series.
    for si, s in enumerate(series):
        pts = s.get("points", [])
        if not pts:
            continue
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        ls = "--" if s.get("style") == "dashed" else "-"
        color = _resolve_color(s.get("color"), [COL["accent"], COL["accent2"], COL["accent3"], COL["accent4"]][si % 4])
        marker = "o" if s.get("marker", True) else None
        if s.get("step"):
            # post-step: value held until next x (good for ssthresh plateaus)
            ax.step(xs, ys, where="post", linestyle=ls, color=color,
                    linewidth=1.8, marker=marker, markersize=4,
                    label=s.get("label", ""), zorder=3)
        else:
            ax.plot(xs, ys, linestyle=ls, color=color, linewidth=1.8,
                    marker=marker, markersize=4, label=s.get("label", ""),
                    zorder=3)

    # Event verticals + labels.
    for ev in events:
        x = float(ev.get("x", 0))
        ax.axvline(x, color=COL["muted"], linestyle=(0, (3, 3)), linewidth=1.0, zorder=1)
        ax.annotate(
            ev.get("label", ""),
            xy=(x, y_max),
            xytext=(x, y_max + y_range * 0.06),
            ha="center", va="bottom", fontsize=8.5, color=COL["accent2"],
            family="sans-serif", fontstyle="italic",
            bbox=dict(facecolor="white", edgecolor=COL["accent2"], pad=1.5,
                      boxstyle="round,pad=0.18", linewidth=0.7),
            zorder=4,
        )

    ax.set_xlabel(x_label, fontsize=10.5, color=COL["ink"], family="sans-serif")
    ax.set_ylabel(y_label, fontsize=10.5, color=COL["ink"], family="sans-serif")
    ax.tick_params(labelsize=9, colors=COL["ink_soft"])
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["left"].set_color(COL["ink"])
    ax.spines["bottom"].set_color(COL["ink"])
    ax.grid(True, axis="y", linestyle="--", linewidth=0.5, color="#d1d5db", alpha=0.6)
    if has_pts:
        ax.set_ylim(min(0, y_min), y_top + y_range * 0.05)
        ax.set_xlim(x_min, x_max)
    if any(s.get("label") for s in series):
        ax.legend(loc="upper left", fontsize=9, frameon=True,
                  facecolor="white", edgecolor=COL["rule"])
    if title:
        ax.set_title(title, pad=14)


# ───────────────────────────────────────────────────────────────────────────
# Dispatch + entry point
# ───────────────────────────────────────────────────────────────────────────

RENDERERS = {
    "network_topology":  render_network_topology,
    "weighted_graph":    render_weighted_graph,
    "sequence_diagram":  render_sequence_diagram,
    "osi_stack":         render_osi_stack,
    "tcp_state":         render_tcp_state,
    "subnet_tree":       render_subnet_tree,
    "protocol_stack":    render_protocol_stack,
    "packet_format":     render_packet_format,
    "queueing_diagram":  render_queueing_diagram,
    "timeline":          render_timeline,
    "leaky_bucket":      render_leaky_bucket,
}

# Default figure sizes per renderer (inches at 220 dpi)
FIG_SIZES = {
    "network_topology": (8.5, 5.5),
    "weighted_graph":   (8.0, 5.5),
    "sequence_diagram": (7.5, 6.0),
    "osi_stack":        (7.0, 5.5),
    "tcp_state":        (11.0, 8.5),
    "subnet_tree":      (9.0, 5.5),
    "protocol_stack":   (8.0, 5.5),
    "packet_format":    (9.0, 4.0),
    "queueing_diagram": (9.0, 4.5),
    "timeline":         (8.5, 4.8),
    "leaky_bucket":     (8.0, 4.8),
}


def main() -> int:
    raw = sys.stdin.read()
    try:
        spec = json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"render_diagram: invalid JSON spec: {e}", file=sys.stderr)
        return 2

    dtype = spec.get("type")
    if dtype not in RENDERERS:
        print(
            f"render_diagram: unknown type {dtype!r}. Supported: {list(RENDERERS)}",
            file=sys.stderr,
        )
        return 2

    title = spec.get("title")
    data = spec.get("data") or {}
    out_path = spec.get("out_path")
    if not out_path:
        out_dir = "/tmp/learningpacer_diagrams"
        os.makedirs(out_dir, exist_ok=True)
        out_path = os.path.join(out_dir, f"{dtype}_{uuid.uuid4().hex[:10]}.png")

    fig_size = FIG_SIZES.get(dtype, (8, 5))
    fig, ax = plt.subplots(figsize=fig_size)
    try:
        RENDERERS[dtype](ax, data, title)
        fig.savefig(out_path, pad_inches=0.25)
    except Exception as e:
        import traceback
        traceback.print_exc(file=sys.stderr)
        print(f"render_diagram: render failed for type={dtype}: {e}", file=sys.stderr)
        return 1
    finally:
        plt.close(fig)

    print(out_path)
    return 0


if __name__ == "__main__":
    sys.exit(main())

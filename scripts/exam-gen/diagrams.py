"""Reusable reportlab diagrams for ELEC3120 exam PDFs."""
from reportlab.graphics.shapes import (
    Drawing, Rect, String, Line, Circle, PolyLine, Polygon, Group
)
from reportlab.lib.colors import (
    HexColor, white, black, lightgrey, grey
)

PRIMARY = HexColor("#0f766e")  # teal-700
ACCENT = HexColor("#0891b2")   # cyan-600
WARN = HexColor("#dc2626")     # red-600
MUTED = HexColor("#64748b")    # slate-500
SOFT = HexColor("#f1f5f9")     # slate-100


def osi_stack_diagram(width=300, height=240):
    d = Drawing(width, height)
    layers = [
        ("7  Application",  "HTTP, DNS, SMTP"),
        ("6  Presentation", "TLS, encoding"),
        ("5  Session",      "RPC, sockets"),
        ("4  Transport",    "TCP, UDP"),
        ("3  Network",      "IP, ICMP, BGP"),
        ("2  Data Link",    "Ethernet, ARP"),
        ("1  Physical",     "Cables, signals"),
    ]
    h = (height - 20) / len(layers)
    for i, (name, ex) in enumerate(layers):
        y = 10 + (len(layers) - 1 - i) * h
        d.add(Rect(20, y, 180, h - 4, fillColor=SOFT, strokeColor=PRIMARY,
                   strokeWidth=1))
        d.add(String(28, y + h/2 - 4, name, fontSize=9, fontName="Helvetica-Bold"))
        d.add(String(210, y + h/2 - 4, ex, fontSize=8, fillColor=MUTED))
    d.add(String(20, height - 8, "OSI 7-Layer Model",
                 fontSize=10, fontName="Helvetica-Bold", fillColor=PRIMARY))
    return d


def tcp_handshake_diagram(width=380, height=200):
    d = Drawing(width, height)
    # client/server columns
    d.add(String(40, height - 12, "Client", fontSize=10,
                 fontName="Helvetica-Bold"))
    d.add(String(width - 80, height - 12, "Server", fontSize=10,
                 fontName="Helvetica-Bold"))
    d.add(Line(60, 20, 60, height - 25, strokeColor=MUTED,
               strokeDashArray=[2, 2]))
    d.add(Line(width - 60, 20, width - 60, height - 25,
               strokeColor=MUTED, strokeDashArray=[2, 2]))
    # 3 messages
    msgs = [
        (height - 50, "SYN  seq=x",                False, PRIMARY),
        (height - 95, "SYN+ACK  seq=y, ack=x+1",   True,  ACCENT),
        (height - 140, "ACK  seq=x+1, ack=y+1",    False, PRIMARY),
    ]
    for y, label, leftward, color in msgs:
        if leftward:
            d.add(Line(width - 60, y + 8, 60, y - 4,
                       strokeColor=color, strokeWidth=1.4))
            d.add(Polygon([60, y - 4, 70, y - 1, 70, y - 7],
                          fillColor=color, strokeColor=color))
        else:
            d.add(Line(60, y + 8, width - 60, y - 4,
                       strokeColor=color, strokeWidth=1.4))
            d.add(Polygon([width - 60, y - 4, width - 70, y - 1,
                           width - 70, y - 7],
                          fillColor=color, strokeColor=color))
        d.add(String(width / 2, y + 12, label, fontSize=9,
                     textAnchor="middle", fontName="Helvetica-Bold"))
    d.add(String(20, 4, "TCP 3-way handshake — connection establishment",
                 fontSize=8, fillColor=MUTED))
    return d


def sliding_window_diagram(width=420, height=140):
    d = Drawing(width, height)
    cell_w = 28
    cells = 12
    base_x = 20
    base_y = 60
    # frames
    for i in range(cells):
        seq = i + 1
        if 3 <= seq <= 7:
            color = PRIMARY  # in window, sent + ack pending
            label = "S"
        elif seq < 3:
            color = ACCENT
            label = "A"
        else:
            color = lightgrey
            label = ""
        d.add(Rect(base_x + i * cell_w, base_y, cell_w - 2, 30,
                   fillColor=color if seq < 8 else white,
                   strokeColor=black, strokeWidth=0.7))
        d.add(String(base_x + i * cell_w + cell_w / 2 - 4,
                     base_y + 36, str(seq), fontSize=8))
        if label:
            d.add(String(base_x + i * cell_w + cell_w / 2 - 3,
                         base_y + 10, label, fontSize=9,
                         fontName="Helvetica-Bold", fillColor=white))
    # window bracket
    win_x1 = base_x + 2 * cell_w
    win_x2 = base_x + 7 * cell_w - 2
    d.add(Line(win_x1, base_y - 6, win_x2, base_y - 6, strokeColor=WARN,
               strokeWidth=1.2))
    d.add(Line(win_x1, base_y - 6, win_x1, base_y - 12, strokeColor=WARN,
               strokeWidth=1.2))
    d.add(Line(win_x2, base_y - 6, win_x2, base_y - 12, strokeColor=WARN,
               strokeWidth=1.2))
    d.add(String((win_x1 + win_x2) / 2 - 30, base_y - 22,
                 "Window N = 5", fontSize=9, fontName="Helvetica-Bold",
                 fillColor=WARN))
    # legend
    d.add(Rect(20, 110, 12, 12, fillColor=ACCENT, strokeColor=black))
    d.add(String(36, 113, "ACKed", fontSize=8))
    d.add(Rect(95, 110, 12, 12, fillColor=PRIMARY, strokeColor=black))
    d.add(String(111, 113, "Sent, awaiting ACK", fontSize=8))
    d.add(Rect(225, 110, 12, 12, fillColor=white, strokeColor=black))
    d.add(String(241, 113, "Usable / future", fontSize=8))
    d.add(String(20, 4, "Sliding-window protocol — sender state",
                 fontSize=8, fillColor=MUTED))
    return d


def congestion_control_diagram(width=420, height=220):
    d = Drawing(width, height)
    # axes
    ox, oy = 50, 30
    aw, ah = width - 70, height - 60
    d.add(Line(ox, oy, ox + aw, oy, strokeColor=black))
    d.add(Line(ox, oy, ox, oy + ah, strokeColor=black))
    d.add(String(ox + aw - 30, oy - 14, "Time (RTT)", fontSize=8,
                 fillColor=MUTED))
    d.add(String(2, oy + ah - 10, "cwnd (MSS)", fontSize=8, fillColor=MUTED))
    # threshold line
    thr_y = oy + ah * 0.55
    d.add(Line(ox, thr_y, ox + aw, thr_y, strokeColor=MUTED,
               strokeDashArray=[3, 3]))
    d.add(String(ox + aw + 2, thr_y - 4, "ssthresh", fontSize=8,
                 fillColor=MUTED))
    # slow start (exponential)
    pts = []
    for i in range(8):
        x = ox + i * (aw / 24)
        y = oy + (2 ** i) * 1.6
        if y > thr_y:
            y = thr_y
        pts.extend([x, y])
    d.add(PolyLine(pts, strokeColor=PRIMARY, strokeWidth=1.6))
    d.add(String(ox + 6, oy + ah - 6, "Slow start", fontSize=8,
                 fillColor=PRIMARY, fontName="Helvetica-Bold"))
    # congestion avoidance (linear)
    pts = [ox + 8 * (aw / 24), thr_y]
    last_x, last_y = pts[0], pts[1]
    for i in range(1, 9):
        x = last_x + (aw / 24)
        y = last_y + 4
        pts.extend([x, y])
        last_x, last_y = x, y
    d.add(PolyLine(pts, strokeColor=ACCENT, strokeWidth=1.6))
    d.add(String(ox + aw / 2 - 30, last_y + 6, "Congestion avoidance",
                 fontSize=8, fillColor=ACCENT, fontName="Helvetica-Bold"))
    # 3-dup-ACK loss event
    loss_x = last_x
    loss_y = last_y
    d.add(Circle(loss_x, loss_y, 4, fillColor=WARN, strokeColor=WARN))
    d.add(String(loss_x + 6, loss_y + 4, "3 dup ACKs (Reno)",
                 fontSize=8, fillColor=WARN))
    # fast recovery: cwnd halved, then linear
    half_y = oy + (loss_y - oy) / 2
    d.add(Line(loss_x, loss_y, loss_x + 4, half_y, strokeColor=WARN,
               strokeDashArray=[2, 2]))
    pts2 = [loss_x + 4, half_y]
    lx, ly = loss_x + 4, half_y
    for i in range(1, 6):
        nx = lx + (aw / 24)
        ny = ly + 4
        pts2.extend([nx, ny])
        lx, ly = nx, ny
    d.add(PolyLine(pts2, strokeColor=ACCENT, strokeWidth=1.6))
    d.add(String(20, height - 12, "TCP Reno — cwnd evolution",
                 fontSize=10, fontName="Helvetica-Bold", fillColor=PRIMARY))
    return d


def subnet_diagram(width=400, height=180):
    d = Drawing(width, height)
    # router
    d.add(Rect(width / 2 - 25, height / 2 - 18, 50, 36,
               fillColor=PRIMARY, strokeColor=black))
    d.add(String(width / 2 - 18, height / 2 - 4, "Router",
                 fontSize=9, fillColor=white, fontName="Helvetica-Bold"))
    d.add(String(width / 2 - 26, height / 2 - 28, "203.0.113.1/24",
                 fontSize=7, fillColor=MUTED))
    # 3 subnets
    nets = [
        (60, height / 2, "Subnet A", "203.0.113.0/26", "62 hosts"),
        (width - 60, height / 2, "Subnet B", "203.0.113.64/27", "30 hosts"),
        (width / 2, 30, "Subnet C", "203.0.113.96/28", "14 hosts"),
    ]
    for x, y, name, cidr, hosts in nets:
        d.add(Circle(x, y, 22, fillColor=SOFT, strokeColor=ACCENT,
                     strokeWidth=1.5))
        d.add(String(x - 18, y - 2, name, fontSize=8,
                     fontName="Helvetica-Bold"))
        d.add(String(x - 28, y - 14, cidr, fontSize=7, fillColor=MUTED))
        d.add(String(x - 16, y - 24, hosts, fontSize=7, fillColor=MUTED))
        d.add(Line(x, y, width / 2, height / 2, strokeColor=MUTED))
    d.add(String(20, height - 12,
                 "VLSM example — sub-allocate 203.0.113.0/24",
                 fontSize=10, fontName="Helvetica-Bold", fillColor=PRIMARY))
    return d


def packet_journey_diagram(width=460, height=160):
    d = Drawing(width, height)
    boxes = [
        (20,  "Host A", "10.0.0.5"),
        (130, "Switch", "L2"),
        (240, "Router R1", "L3"),
        (350, "Router R2", "L3"),
    ]
    last_cx = None
    for x, name, sub in boxes:
        d.add(Rect(x, 60, 80, 50, fillColor=SOFT, strokeColor=PRIMARY,
                   strokeWidth=1))
        d.add(String(x + 12, 90, name, fontSize=9,
                     fontName="Helvetica-Bold"))
        d.add(String(x + 12, 75, sub, fontSize=8, fillColor=MUTED))
        cx = x + 40
        if last_cx is not None:
            d.add(Line(last_cx + 40, 85, x, 85, strokeColor=ACCENT,
                       strokeWidth=1.4))
            d.add(Polygon([x, 85, x - 6, 88, x - 6, 82],
                          fillColor=ACCENT, strokeColor=ACCENT))
        last_cx = x
    d.add(String(20, 40,
                 "Q: At each hop, which header fields change? "
                 "(Hint: think L2 vs L3 vs L4 immutability.)",
                 fontSize=9, fillColor=WARN, fontName="Helvetica-Oblique"))
    d.add(String(20, height - 12,
                 "Packet journey across L2 / L3 devices",
                 fontSize=10, fontName="Helvetica-Bold", fillColor=PRIMARY))
    return d


def go_back_n_diagram(width=420, height=180):
    d = Drawing(width, height)
    d.add(String(20, height - 12,
                 "Go-Back-N — what happens on a single packet loss",
                 fontSize=10, fontName="Helvetica-Bold", fillColor=PRIMARY))
    d.add(String(40, height - 30, "Sender", fontSize=9,
                 fontName="Helvetica-Bold"))
    d.add(String(width - 80, height - 30, "Receiver", fontSize=9,
                 fontName="Helvetica-Bold"))
    d.add(Line(60, 10, 60, height - 40, strokeColor=MUTED,
               strokeDashArray=[2, 2]))
    d.add(Line(width - 60, 10, width - 60, height - 40,
               strokeColor=MUTED, strokeDashArray=[2, 2]))
    events = [
        (140, "pkt 1",  "ACK 1",  False),
        (118, "pkt 2",  "(lost)", True),
        (96,  "pkt 3",  "ACK 1 (dup)", False),
        (74,  "pkt 4",  "ACK 1 (dup)", False),
        (52,  "TIMEOUT — retransmit pkt 2,3,4", "", False),
    ]
    for y, sname, rname, lost in events:
        d.add(Line(60, y + 4, width - 60, y - 4,
                   strokeColor=WARN if lost else PRIMARY, strokeWidth=1.2,
                   strokeDashArray=[3, 3] if lost else None))
        d.add(String(width / 2 - 40, y + 8, sname, fontSize=8,
                     fontName="Helvetica-Bold"))
        if rname and not lost:
            d.add(Line(width - 60, y - 6, 60, y - 14,
                       strokeColor=ACCENT, strokeWidth=1.0))
            d.add(String(width / 2 - 30, y - 18, rname, fontSize=7,
                         fillColor=ACCENT))
    return d


def queue_management_diagram(width=380, height=160):
    d = Drawing(width, height)
    # arriving packets
    for i in range(5):
        d.add(Rect(20 + i * 14, 90, 12, 18,
                   fillColor=PRIMARY, strokeColor=black))
    d.add(String(20, 115, "arrivals", fontSize=8, fillColor=MUTED))
    # FIFO queue
    qx = 110
    d.add(Rect(qx, 80, 160, 40, fillColor=SOFT, strokeColor=ACCENT,
               strokeWidth=1.4))
    for i in range(6):
        d.add(Rect(qx + 6 + i * 22, 88, 18, 24,
                   fillColor=ACCENT, strokeColor=black))
    d.add(String(qx + 50, 70, "FIFO buffer (capacity B)",
                 fontSize=8, fillColor=MUTED))
    # link
    d.add(Line(qx + 160, 100, qx + 200, 100, strokeColor=PRIMARY,
               strokeWidth=2))
    d.add(Polygon([qx + 200, 100, qx + 192, 96, qx + 192, 104],
                  fillColor=PRIMARY, strokeColor=PRIMARY))
    d.add(String(qx + 162, 110, "service rate µ", fontSize=8,
                 fillColor=MUTED))
    # AQM dropper
    d.add(Rect(50, 30, 220, 26, fillColor=white, strokeColor=WARN,
               strokeWidth=1, strokeDashArray=[3, 2]))
    d.add(String(60, 38,
                 "AQM (RED): drop probabilistically as avg-queue grows",
                 fontSize=8, fillColor=WARN))
    d.add(String(20, height - 12,
                 "Queue / AQM — where loss is engineered",
                 fontSize=10, fontName="Helvetica-Bold", fillColor=PRIMARY))
    return d

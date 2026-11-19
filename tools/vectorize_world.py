import sys, json, numpy as np
from collections import deque, defaultdict
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
a = np.asarray(Image.open(src).convert('RGBA')).astype(int); H, W = a.shape[:2]
PPD = W / 360.0                                   # pixels per degree (equirectangular, full world)
LON0, LON1, LAT0, LAT1 = -60, 70, -10, 72
x0, x1 = int((LON0 + 180) * PPD), int((LON1 + 180) * PPD); y0, y1 = int((90 - LAT1) * PPD), int((90 - LAT0) * PPD)
c = a[y0:y1, x0:x1]; h, w = c.shape[:2]
opaque = c[..., 3] > 128
border_px = opaque & (c[..., 0] < 205)
land = np.zeros((h + 2, w + 2), bool); land[1:-1, 1:-1] = opaque          # 1 px sea frame closes every coast loop
cty = np.zeros((h + 2, w + 2), bool); cty[1:-1, 1:-1] = opaque & ~border_px
# label countries (4-connected) on land without border pixels
lab = np.zeros(land.shape, np.int32); n = 0
for yy, xx in zip(*np.nonzero(cty)):
    if lab[yy, xx]: continue
    n += 1; q = deque([(yy, xx)]); lab[yy, xx] = n
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            Y, X = y + dy, x + dx
            if cty[Y, X] and not lab[Y, X]: lab[Y, X] = n; q.append((Y, X))
# hand border pixels to a neighbouring country (dilation), so countries tile the land
for _ in range(6):
    miss = land & (lab == 0)
    if not miss.any(): break
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        sh = np.roll(np.roll(lab, dy, 0), dx, 1); take = miss & (lab == 0) & (sh > 0); lab[take] = sh[take]
print('countries/islands labelled:', n)
MOROCCO_POINTS = [(-7.59, 33.37), (-13.2, 27.15), (-15.93, 23.7), (-4.42, 31.93), (-6.84, 34.02), (-9.41, 30.33), (-11.67, 26.74)]
mlabels = set()
for lo, la in MOROCCO_POINTS:
    X, Y = int((lo + 180) * PPD) - x0 + 1, int((90 - la) * PPD) - y0 + 1
    win = lab[Y - 2:Y + 3, X - 2:X + 3]; v = win[win > 0]
    if v.size: mlabels.add(int(np.bincount(v).argmax()))
print('Morocco labels in the world image:', sorted(mlabels))
hole = np.isin(lab, list(mlabels)); lab[hole] = 0; land[hole] = False
for _ in range(3):                                 # neighbours (Algeria, Mauritania) close the gap to Morocco's outline
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        sh = np.roll(np.roll(lab, dy, 0), dx, 1); take = hole & (lab == 0) & (sh > 0); lab[take] = sh[take]; land[take] = True
# edges on the pixel-corner lattice; coast edges are directed with land on the left (y down)
coast, bord = defaultdict(list), defaultdict(list)
def add(D, p, q): D[p].append(q); D[q].append(p)
L = land; A = lab
for y in range(1, L.shape[0]):                     # horizontal edges between rows y-1 (top) and y (bottom)
    top, bot, a0, a1 = L[y - 1], L[y], A[y - 1], A[y]
    for x in np.nonzero(top & ~bot)[0]: coast[(x, y)].append((x + 1, y))       # land above: go east
    for x in np.nonzero(bot & ~top)[0]: coast[(x + 1, y)].append((x, y))       # land below: go west
    for x in np.nonzero(top & bot & (a0 != a1) & (a0 > 0) & (a1 > 0))[0]: add(bord, (x, y), (x + 1, y))
for x in range(1, L.shape[1]):                     # vertical edges between columns x-1 (left) and x (right)
    lf, rt, a0, a1 = L[:, x - 1], L[:, x], A[:, x - 1], A[:, x]
    for y in np.nonzero(rt & ~lf)[0]: coast[(x, y)].append((x, y + 1))         # land right: go south
    for y in np.nonzero(lf & ~rt)[0]: coast[(x, y + 1)].append((x, y))         # land left: go north
    for y in np.nonzero(lf & rt & (a0 != a1) & (a0 > 0) & (a1 > 0))[0]: add(bord, (x, y), (x, y + 1))
def loops(D):
    out = {p: list(v) for p, v in D.items()}; res = []
    for s0 in list(out):
        while out[s0]:
            ch = [s0]; p = s0; q = out[s0].pop(0)
            while True:
                ch.append(q)
                if q == s0: break
                d = (q[0] - p[0], q[1] - p[1]); cand = out[q]
                if len(cand) > 1:          # corner-touching pixels: take the left-most turn
                    cand.sort(key=lambda r: -(d[0] * (r[1] - q[1]) - d[1] * (r[0] - q[0])))
                p, q = q, cand.pop(0)
            res.append(ch)
    return res
def chains(D):
    used = set(); res = []
    key = lambda p, q: (p, q) if p < q else (q, p)
    starts = [p for p in D if len(D[p]) != 2] + list(D)
    for s in starts:
        for nb in D[s]:
            if key(s, nb) in used: continue
            ch = [s]; p, q = s, nb
            while True:
                used.add(key(p, q)); ch.append(q)
                if len(D[q]) != 2 and q != s: break
                nxt = [r for r in D[q] if key(q, r) not in used]
                if not nxt: break
                p, q = q, nxt[0]
            res.append(ch)
    return res
def rdp(P, eps):
    P = np.asarray(P, float)
    if len(P) < 3: return P
    keep = np.zeros(len(P), bool); keep[0] = keep[-1] = True; st = [(0, len(P) - 1)]
    while st:
        i, j = st.pop()
        if j <= i + 1: continue
        A_, B_ = P[i], P[j]; d = B_ - A_; nn = np.hypot(*d)
        seg = P[i + 1:j]
        dist = np.hypot(*(seg - A_).T) if nn == 0 else np.abs(d[0] * (seg[:, 1] - A_[1]) - d[1] * (seg[:, 0] - A_[0])) / nn
        k = int(dist.argmax())
        if dist[k] > eps: keep[i + 1 + k] = True; st += [(i, i + 1 + k), (i + 1 + k, j)]
    return P[keep]
def smooth(P):        # one pass of corner cutting to remove the pixel staircase
    P = np.asarray(P, float)
    if len(P) < 3: return P
    closed = np.allclose(P[0], P[-1])
    Q = [P[0]] if not closed else []
    for i in range(len(P) - 1): Q += [0.75 * P[i] + 0.25 * P[i + 1], 0.25 * P[i] + 0.75 * P[i + 1]]
    if not closed: Q.append(P[-1])
    else: Q.append(Q[0])
    return np.asarray(Q)
def avg(P, k=3):     # moving average over 2k+1 lattice points (closed loops wrap), endpoints of open lines stay fixed
    P = np.asarray(P, float); n = len(P)
    if n < 2 * k + 3: return P
    closed = np.allclose(P[0], P[-1])
    if closed:
        Q = P[:-1]; m = len(Q); R = np.array([Q[[(i + j) % m for j in range(-k, k + 1)]].mean(0) for i in range(m)]); return np.vstack([R, R[:1]])
    R = P.copy()
    for i in range(1, n - 1):
        kk = min(k, i, n - 1 - i); R[i] = P[i - kk:i + kk + 1].mean(0)
    return R
def ll(P):
    return [[round((x - 1 + x0) / PPD - 180, 3), round(90 - (y - 1 + y0) / PPD, 3)] for x, y in P]
coast_loops = [ll(rdp(avg(ch), 0.18)) for ch in loops(coast) if len(ch) >= 8]
border_lines = [ll(rdp(avg(ch), 0.18)) for ch in chains(bord) if len(ch) >= 3]
print('coast loops', len(coast_loops), 'points', sum(map(len, coast_loops)), '| border lines', len(border_lines), 'points', sum(map(len, border_lines)))
json.dump({'_doc': "World land and country borders for the flight map, vectorized from the owner's map (docs/reference/world_borders.png), equirectangular, region lon -60..70, lat -10..72. coast: closed loops (fill even-odd). borders: polylines between countries.",
           'coast': coast_loops, 'borders': border_lines}, open(out, 'w'), separators=(',', ':'))

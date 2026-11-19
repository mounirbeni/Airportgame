// Ground movement graph: nodes (x, z in airport-local metres) and undirected
// edges typed by use (runway, taxiway, taxilane, stand, road, service).
// A* shortest path with per-agent edge filters and penalties.

export class Graph {
  constructor() { this.nodes = []; this.edges = []; this.adj = []; }

  addNode(x, z, props = {}) {
    const id = this.nodes.length;
    this.nodes.push({ id, x, z, ...props });
    this.adj.push([]);
    return id;
  }
  addEdge(a, b, props = {}) {
    if (a === b || this.adj[a].some(e => e.to === b)) return null;
    const n1 = this.nodes[a], n2 = this.nodes[b];
    const e = { id: this.edges.length, a, b, len: Math.hypot(n2.x - n1.x, n2.z - n1.z), ...props };
    this.edges.push(e);
    this.adj[a].push({ to: b, edge: e });
    this.adj[b].push({ to: a, edge: e });
    return e;
  }
  removeEdge(e) {
    this.adj[e.a] = this.adj[e.a].filter(x => x.edge !== e);
    this.adj[e.b] = this.adj[e.b].filter(x => x.edge !== e);
    e.removed = true;
  }
  /** Insert a node on an edge at distance d from node `from`; returns the new node id. */
  splitEdge(e, from, d, props = {}) {
    const a = this.nodes[from], b = this.nodes[from === e.a ? e.b : e.a], t = d / e.len;
    const id = this.addNode(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, props);
    const keep = { ...e }; delete keep.id; delete keep.a; delete keep.b; delete keep.len; delete keep.removed;
    this.removeEdge(e);
    this.addEdge(from, id, keep); this.addEdge(id, b.id, keep);
    return id;
  }
  edgesOf(n) { return this.adj[n]; }
  liveEdges() { return this.edges.filter(e => !e.removed); }
  nearest(x, z, filter = () => true) {
    let best = -1, bd = Infinity;
    for (const n of this.nodes) { if (!filter(n)) continue; const d = Math.hypot(n.x - x, n.z - z); if (d < bd) { bd = d; best = n.id; } }
    return best;
  }

  /**
   * A* from start to goal. opts.allow(edge) -> bool, opts.cost(edge, fromNode, toNode) -> extra cost.
   * Returns an array of node ids (start..goal) or null.
   */
  path(start, goal, opts = {}) {
    if (start === goal) return [start];
    const allow = opts.allow || (() => true), extra = opts.cost || (() => 0);
    const g = new Map([[start, 0]]), came = new Map(), open = new Set([start]);
    const h = n => Math.hypot(this.nodes[n].x - this.nodes[goal].x, this.nodes[n].z - this.nodes[goal].z);
    const f = new Map([[start, h(start)]]);
    while (open.size) {
      let cur = -1, cf = Infinity;
      for (const n of open) { const v = f.get(n); if (v < cf) { cf = v; cur = n; } }
      if (cur === goal) {
        const out = [cur]; while (came.has(cur)) { cur = came.get(cur); out.unshift(cur); } return out;
      }
      open.delete(cur);
      for (const { to, edge } of this.adj[cur]) {
        if (!allow(edge, cur, to)) continue;
        const ng = g.get(cur) + edge.len + extra(edge, cur, to, goal);
        if (ng < (g.has(to) ? g.get(to) : Infinity)) {
          came.set(to, cur); g.set(to, ng); f.set(to, ng + h(to)); open.add(to);
        }
      }
    }
    return null;
  }
}

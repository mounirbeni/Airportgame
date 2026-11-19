// Validates every airport layout: graph connectivity for all operations.
// Run: node tests/layout_test.mjs
import fs from 'node:fs';
import { buildLayout, taxiRoute } from '../web/js/infra/layout.js';

let fails = 0;
const check = (ok, msg) => { if (!ok) { fails++; console.log('  FAIL', msg); } };
for (const f of fs.readdirSync('data/airports').filter(f => f.endsWith('.json')).sort()) {
  const spec = JSON.parse(fs.readFileSync('data/airports/' + f, 'utf8'));
  const L = buildLayout(spec), g = L.graph;
  const edges = g.liveEdges(), byType = {};
  for (const e of edges) byType[e.type] = (byType[e.type] || 0) + 1;
  console.log(`${spec.code}: ${g.nodes.length} nodes, ${edges.length} edges ${JSON.stringify(byType)}, ${L.stands.length} stands, ${L.holds.length} holds, runways ${L.runways.map(r => r.id).join(' ')}`);
  check(L.departure && L.departure.hold !== undefined, `${spec.code} departure hold for ${spec.ops.departure}`);
  check(L.arrival && L.arrival.exits.length > 0, `${spec.code} arrival exits for ${spec.ops.arrival}`);
  let okOut = 0, okIn = 0, maxLen = 0;
  for (const s of L.stands) {
    const out = taxiRoute(L, s.laneNode, L.departure.hold);
    if (out) { okOut++; let d = 0; for (let i = 1; i < out.length; i++) d += Math.hypot(g.nodes[out[i]].x - g.nodes[out[i - 1]].x, g.nodes[out[i]].z - g.nodes[out[i - 1]].z); maxLen = Math.max(maxLen, d); }
    else check(false, `${spec.code} ${s.id} -> departure hold`);
    const reach = L.arrival.exits.filter(x => taxiRoute(L, x, s.node));
    if (reach.length) okIn++; else check(false, `${spec.code} no exit reaches ${s.id}`);
  }
  // Departure route must not cross the active runways.
  const r0 = taxiRoute(L, L.stands[0].laneNode, L.departure.hold);
  const crosses = r0 ? r0.slice(1, -1).filter(n => g.nodes[n].runwayNode).length : -1;
  check(crosses === 0, `${spec.code} departure route crosses a runway (${crosses})`);
  console.log(`   stands->hold ${okOut}/${L.stands.length} (longest ${Math.round(maxLen)} m), exits->stand ${okIn}/${L.stands.length}, entry ${L.departure.entry} hold ${L.departure.hold}, exits ${L.arrival.exits.length}, bounds ${JSON.stringify(Object.fromEntries(Object.entries(L.bounds).map(([k, v]) => [k, Math.round(v)])))}`);
}
console.log(fails ? `${fails} FAILURES` : 'ALL LAYOUTS VALID');
process.exit(fails ? 1 : 0);

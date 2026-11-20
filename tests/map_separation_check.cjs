// Minimum separation between airborne aircraft: on the country map (km, as displayed) and in the 3D world (m).
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/web/'); await p.waitForFunction(() => window.__atlas, null, { timeout: 60000 });
  const r = await p.evaluate(() => {
    const A = window.__atlas, M = A.flightMap; A.S.money = 1e10; A.S.gates = { CMN: 12 }; A.S.autoAtc = true;
    for (const c of ['TNG', 'AGA', 'OUD']) A.St.openRoute(c);
    const t0 = A.S.fleet[0].type; for (let i = 0; i < 10; i++) A.St.buyAircraft(i % 3 === 1 ? 'p70' : t0);
    const rt = ['RAK', 'FEZ', 'TNG', 'AGA', 'OUD', 'FEZ', 'TNG', 'OUD']; A.S.fleet.forEach((a, i) => a.route = rt[i % rt.length]);
    const lastP = {}; const res = { jumps: 0, maxStep: 0, mapMin: 1e9, mapBad: 0, mapSamples: 0, worldMin: 1e9, worldBad: 0, worst: [] };
    for (let t = 0; t < 3000; t++) {
      if (t === 900) A.S.autoAtc = false; if (t === 2200) A.S.autoAtc = true;   // a period of manual tower: holding builds up
      A.step(1); M.draw(A.cam, null);
      for (const v of (M.shown ? M.shown.values() : [])) { const lp = lastP[v.a.id]; if (lp) { const st = Math.hypot(v.p.p[0] - lp[0], v.p.p[1] - lp[1]); res.maxStep = Math.max(res.maxStep, st); if (st > 6) res.jumps++; } }
      for (const k in lastP) delete lastP[k]; for (const v of (M.shown ? M.shown.values() : [])) lastP[v.a.id] = v.p.p;
      const pts = [];
      for (const v of (M.shown ? M.shown.values() : [])) if (v.p.air) pts.push([v.a.flightNo, v.p.p]);
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
        const d = Math.hypot(pts[i][1][0] - pts[j][1][0], pts[i][1][1] - pts[j][1][1]); res.mapSamples++;
        if (d < res.mapMin) res.mapMin = d;
        if (d < 10) { res.mapBad++; if (res.worst.length < 12) { const fa = A.S.fleet.find(f => f.flightNo === pts[i][0]), fb = A.S.fleet.find(f => f.flightNo === pts[j][0]); const ha = M.km.CMN; res.worst.push(`${t}s ${pts[i][0]}(${fa.legOut ? 'out' : 'in'} ${fa.route}) - ${pts[j][0]}(${fb.legOut ? 'out' : 'in'} ${fb.route}) ${d.toFixed(1)} km, ${Math.hypot(pts[i][1][0] - ha[0], pts[i][1][1] - ha[1]).toFixed(0)} km from CMN`); } }
      }
      const air = A.S.fleet.map(a => A.sim.rt.get(a.id)).filter(r => r && r.mesh.visible && r.alt > 5);
      for (let i = 0; i < air.length; i++) for (let j = i + 1; j < air.length; j++) {
        const d = air[i].mesh.position.distanceTo(air[j].mesh.position); if (d < res.worldMin) res.worldMin = d; if (d < 1000) res.worldBad++;
      }
    }
    return res;
  });
  console.log(`map: moves > 6 km in one second: ${r.jumps} (largest ${r.maxStep.toFixed(1)} km)`);
  console.log(`map: min separation ${r.mapMin.toFixed(1)} km, samples under 10 km: ${r.mapBad}`); console.log(r.worst.join('\n'));
  console.log(`3D: min separation between airborne aircraft ${r.worldMin.toFixed(0)} m, samples under 1 km: ${r.worldBad}`);
  console.log(errs.join('\n') || 'no errors'); await b.close();
})();

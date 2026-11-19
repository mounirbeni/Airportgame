const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/web/'); await p.waitForFunction(() => window.__atlas, null, { timeout: 60000 });
  const r = await p.evaluate(() => {
    const A = window.__atlas, M = A.flightMap; A.S.money = 1e10; A.S.gates = 12; A.S.autoAtc = true;
    for (const c of ['TNG', 'AGA', 'OUD']) A.St.openRoute(c);
    const t0 = A.S.fleet[0].type; for (let i = 0; i < 10; i++) A.St.buyAircraft(i % 3 === 1 ? 'p70' : t0);
    const rt = ['RAK', 'FEZ', 'TNG', 'AGA', 'OUD', 'FEZ', 'TNG', 'OUD']; A.S.fleet.forEach((a, i) => a.route = rt[i % rt.length]);
    const prev = {}, res = { holdEvents: 0, goArounds: 0, landings: 0, maxHolding: 0, gaps: [] }; let lastLand = null;
    const gm = () => A.S.day * 1440 + A.S.gameMin;
    for (let t = 0; t < 4800; t++) {
      A.step(1); M.draw(A.cam, null);
      let holdingNow = 0;
      for (const a of A.S.fleet) {
        const pv = prev[a.id];
        if (pv && pv.state === 'enroute' && !pv.legOut && a.state === 'enroute' && !a.legOut && a.timer > pv.timer + 0.01 && a.timer <= 1.0001) res.holdEvents++;
        if (pv && pv.state !== 'go_around' && a.state === 'go_around') res.goArounds++;
        if (pv && pv.state === 'cleared' && a.state === 'rollout') { res.landings++; const now = gm(); if (lastLand !== null) res.gaps.push(+(now - lastLand).toFixed(1)); lastLand = now; }
        if (a.state === 'enroute' && !a.legOut && a.timer <= 1.0001 && a.timer > 0.5) holdingNow++;
        prev[a.id] = { state: a.state, legOut: a.legOut, timer: a.timer };
      }
      res.maxHolding = Math.max(res.maxHolding, holdingNow);
    }
    res.minGap = Math.min(...res.gaps); res.gaps = res.gaps.slice(0, 14);
    return res;
  });
  console.log(JSON.stringify(r)); console.log(errs.join('\n') || 'no errors'); await b.close();
})();

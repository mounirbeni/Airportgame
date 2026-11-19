# Atlas Air 3D — Infrastructure & hand-off guide

> **ملخص بالعربية:** هذا المستند يشرح البنية الأساسية للعبة: كيف يُعرَّف كل مطار في ملف بيانات، وكيف تُولَّد منه شبكة المدارج والممرات والبوابات والمباني تلقائيًا بمقاسات حقيقية بالمتر، وكيف تتحرك الطائرات عليها بخوارزمية البحث عن المسار. المصمم يغيّر الشكل من ملف واحد (`web/js/style.js`) ويستبدل أي مجسم بملف GLB عبر `data/models.json` دون لمس الكود الهندسي.

The browser build (`web/`) is the reference implementation. Everything is in **metres**, and everything is generated from data.

---

## 1. File map

| Path | Role |
|---|---|
| `data/world.json` | Airports on the world map (centre, rotation, colour, `layout` file). |
| `data/airports/<CODE>.json` | **Airport spec** (runways, taxiways, terminals, buildings, roads, operations). |
| `data/tycoon.json` | Economy, aircraft types, destinations. |
| `data/models.json` | **Model slots** to replace procedural models with GLB files. |
| `web/js/infra/layout.js` | Generator: spec → centrelines, graph, holds, stands, aprons, ops. Pure math, testable in Node. |
| `web/js/infra/graph.js` | Ground-movement graph + A* pathfinding. |
| `web/js/infra/merge.js` | Geometry batching (draw-call reduction). |
| `web/js/airport.js` | Renders one airport from its layout (pavement, markings, lights, PAPI, buildings, roads). |
| `web/js/buildings.js` | Parametric building & vehicle kit (terminals, piers, jet bridges, tower, hangar, fire station, cargo, fuel farm, car park, radar, admin, GSE). |
| `web/js/aircraft.js` | Procedural aircraft at real dimensions. |
| `web/js/sim.js` | Aircraft operations on the graph + ATC rules. |
| `web/js/style.js` | **Style registry**: every material role in one file. |
| `web/js/models.js` | GLB model-slot loader. |
| `tests/layout_test.mjs` | Validates every airport layout (connectivity, no runway crossing on departure). |

## 2. Coordinate frames and units

- **World:** X = east, −Z = north, Y = up, metres. Distances *between* cities are compressed. Airports themselves are at **real scale**.
- **Airport-local frame:** origin at `center`, rotated by `yaw_deg`. Runways run along local **Z**.
  - The **primary end** (`ends[0]`) is used when moving towards **−Z**.
  - **+X** is the apron side of the reference runway.
  - `yaw_deg` for a runway with magnetic heading H is chosen so that local −Z points to H. Examples: CMN `180` (17 = south), RAK `-90` (10 = east), OUD `-60` (06).
- Helpers on every airport object (`core.js`): `toWorld(x, y, z)`, `toLocal(...)`, `dirWorld(dx, dz)`, `yawOf(dx, dz)`.

## 3. Airport spec (`data/airports/<CODE>.json`)

```jsonc
{
  "code": "RAK",
  "identity": "one-line description of what makes this airport different",
  "start_stands": 2,
  "ops": { "departure": "10", "arrival": "10" },          // runway END names in use
  "runways": [
    { "id": "10/28", "ends": ["10", "28"], "x": 0, "z": 0, "length": 3100, "width": 45,
      "taxiway": {
        "id": "A", "side": 1, "offset": 190,               // parallel taxiway at x + side*offset
        "from": 1550, "to": -1550,                         // optional: partial parallel (relative z)
        "parallel": true,                                  // false = connectors only
        "connectors": [1550, 700, 0, -700, -1550],         // perpendicular links (relative z)
        "rapid_exits": [{ "for": "10", "z": 350, "angle": 30 }]  // angled exits for landings on "for"
      } }
  ],
  "terminals": [
    // pier: main building + piers (concourses) with stands on both sides
    { "id": "T1", "type": "pier", "style": "moroccan", "x": 0, "z": 800, "dir": -1,
      "main": { "w": 560, "d": 90, "h": 24 }, "pier_w": 36, "pier_len": 520, "pier_h": 12,
      "stands_per_side": 6, "spacing": 60, "piers": [{ "x": -160 }, { "x": 160 }] },
    // linear: one frontage facing the runway (side -1 = apron towards -X)
    { "id": "T1", "type": "linear", "style": "moroccan", "face": 480, "z": -50, "length": 640,
      "depth": 70, "h": 18, "stands": 10, "spacing": 58, "side": -1, "contact": true },
    // remote: a row of stands (cargo / charter), nose towards +X (1) or -X (-1)
    { "id": "CARGO", "type": "remote", "x": 300, "z": -500, "stands": 5, "spacing": 55, "nose": 1 }
  ],
  "taxilines": [ { "id": "L1", "type": "taxilane", "pts": [[190, -320], [396, -320]] } ],  // extra links
  "aprons": [ { "x0": 0, "x1": 100, "z0": 0, "z1": 100 } ],                                  // extra concrete
  "buildings": [
    { "type": "tower", "x": 560, "z": -470, "h": 48 },
    { "type": "hangar", "x": 330, "z": -760, "rot": -90, "w": 80, "d": 70 },
    { "type": "fire_station", "x": 300, "z": 640, "rot": 0 },
    { "type": "cargo", "x": 400, "z": -500, "w": 60, "d": 300, "h": 18 },
    { "type": "fuel_farm", "x": 330, "z": 920, "tanks": 4 },
    { "type": "parking_garage", "x": 0, "z": 980, "w": 300, "d": 90, "floors": 5 },
    { "type": "radar", "x": 0, "z": -1500 },
    { "type": "admin", "x": 640, "z": 380, "w": 70, "d": 40, "h": 18 }
  ],
  "roads": [ { "id": "curb", "pts": [[560, -420], [560, 320]], "width": 16 } ],
  "parking": [ { "x": 680, "z": -50, "w": 150, "d": 520 } ],
  "service_roads": [ [[530, -400], [530, 300]] ]
}
```

Terminal styles: `moroccan` (real arch openings, zellige frieze, domed pavilion and minaret on long buildings) or `modern` (glass curtain wall, roof canopy).

## 4. What the generator produces (`buildLayout`)

1. **Centrelines** for every runway, taxiway, connector, rapid exit, apron taxilane and stand lead-in.
2. **Graph:** every line is split at every intersection, and T-junctions are handled. Edge `type` is one of `runway`, `taxiway`, `taxilane` or `stand`.
3. **Runway-holding points:** on every taxiway touching a runway, at **90 m** from the centreline (`HOLD_DIST`). They are marked `hold` / `entry` on the nodes.
4. **Stands:** position, nose direction, lane node, door position and jet-bridge root (contact stands).
   - Geometry is set by `STAND_NOSE_GAP` (6 m), `STAND_DEPTH` (38 m, code C) and `LANE_CLEAR` (40 m).
5. **Operations:**
   - `departure`: runway, end, direction, full-length entry node and its hold.
   - `arrival`: threshold, direction, and exits ordered in landing order.
6. **Aprons and bounds:** concrete aprons from the templates (plus `aprons` from the spec), and `bounds` (used for terrain flattening and the airfield ground).

`taxiRoute(L, from, to)` is A* on `taxiway | taxilane | stand` edges. Runway edges are never used for taxiing. Crossing a runway intersection costs +3000 m, and passing through another stand costs +5000 m.

## 5. Operations (`sim.js`)

- **Departure:** stand → pushback with tug (reverse, ending nose-along the taxi direction) → A* taxi to the departure hold → *takeoff clearance* → line up from the full-length entry → takeoff roll → climb out.
- **Arrival:** final at 6.5 km on a 3° path → *landing clearance* (or go-around at 1.9 km) → touchdown 300 m past the threshold → rollout to the **first exit reachable after braking** → A* taxi to the stand.
- **Runway rules (per runway):**
  - Only one aircraft lines up or takes off at a time.
  - A landing aircraft occupies the runway until it passes its exit hold.
  - Arrivals are spaced about 5 km apart.
  - A takeoff is refused while a landing is within 4.8 km on the same runway.
  - At CMN the runways are segregated: departures use 17L and arrivals use 17R.
- **Speed:** paths have filleted corners (32 m radius), and the speed limit is √(1.6·r) in turns, with braking anticipation.
- **Time model (`main.js`):** movement runs at `MOVE_SCALE = 2` × real speed, and the clock at `GAME_MIN_PER_SEC = 0.25`.

## 6. Real-world dimensions used

| Item | Size |
|---|---|
| Runway | 3000–3720 m × 45 m, 7 m shoulders |
| Taxiway / taxilane / stand lead-in | 23 m / 20 m / 18 m |
| Runway-holding position | 90 m from the runway centreline |
| Stand (code C) | 38 m deep, nose 6 m from the building, taxilane 40 m behind the tail, 52–60 m spacing |
| Atlas T2 (A320 class) | 37.6 m long, ~35.8 m span |
| Atlas T3 (A321 class) | 44.5 m long, ~35.8 m span |
| Atlas P70 (ATR 72 class) | 27.2 m long, 27 m span |
| Terminal heights | 12–24 m; piers 11–12 m; control towers 32–62 m |
| Hangar | 70–90 m × 80–84 m, 20 m eaves + 9 m vault |
| Vehicles | tug 5.2 m, baggage cart 3 m, fuel truck 10 m, fire truck 11 m, car 4.4 m |

## 7. For the designer: changing the look

**Materials:** edit `web/js/style.js` → `ROLES`.

- **What a role holds:** colour, roughness, metalness, an optional texture (`map`, a file name in `web/assets/tex/`) and a tint.
- **Where roles are used:** every mesh in the game uses one of these roles, for example `pavement.runway`, `building.glass`, `vehicle.gse` or `hangar.wall`.
- **Terminal tint:** `building.wall` is tinted per airport by `terminal_color` in `world.json`.

**Textures:** put the PNG files in a folder, then run `python3 -I tools/import_art.py <folder>`. The script converts them to WebP in `web/assets/`.

**Models:** set a slot in `data/models.json` to a GLB path.

- **Aircraft:** `aircraft.jet`, `aircraft.jet_large`, `aircraft.turboprop`.
- **Vehicles:** `vehicle.tug`.
- **Buildings:** `building.<type>` for every building type, or `<CODE>.<type>` for one airport only (for example `CMN.terminal_main`).
- **One building only:** give it `"model": "<slot>"` in the airport spec (for example `CMN.admin_long`). This is for buildings of the same type with different proportions.
- **Jet bridge, light mast, vehicles:** `building.jet_bridge`, `building.light_mast`, `vehicle.baggage_cart`, `vehicle.fuel_truck`, `vehicle.stairs_truck`, `vehicle.fire_truck`.
- **Ground textures:** files named in `web/js/style.js` (`tex_runway_asphalt`, …) and `tex_airfield_grass`. They are loaded automatically when present in `web/assets/tex/`.

The model is scaled so its bounding box matches `fit.size` on `fit.axis`. `"auto"` uses the real size from the airport spec. The model is then centred on the slot and placed on the ground.

**GLB conventions:**

- **Units and axes:** metres, Y up.
- **Aircraft:** nose towards **−Z**.
- **Buildings:** the front faces **−X**.

The procedural model is hidden only when the GLB has loaded, so a missing file never breaks the game.

**What not to change for visuals:** `infra/*`, the airport specs (these are the functional layout) and `sim.js`.

## 8. Adding a new airport

1. Create `data/airports/XXX.json`; copy the closest existing airport.
2. Add an entry in `data/world.json` with `code`, `center`, `yaw_deg`, `terminal_color`, `name_key` and `layout`. Add `apt_xxx` to `localization/*.json`.
3. Run `node tests/layout_test.mjs`. Every stand must reach the departure hold, and every runway exit must reach every stand.
4. To make it the home airport (simulated operations), set `home_airport` in `world.json`.

## 9. Checks

```bash
node tests/layout_test.mjs        # layout connectivity for all airports
npm install && npm run build      # builds dist/ (PWA)
```

## 10. Known limitations

- Operations are simulated at the home airport only. The other airports are fully built but static.
- There are no runway crossings (layouts avoid them), no wind or runway-direction changes, and no towing.
- Taxi conflicts use follow-the-leader spacing, with a 14 s deadlock release.

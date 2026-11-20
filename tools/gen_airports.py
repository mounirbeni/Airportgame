#!/usr/bin/env python3
"""Generate layouts and world entries for the regional airports (data-driven, same template as OUD/FEZ).

Usage: python3 -I tools/gen_airports.py   (writes data/airports/<CODE>.json and updates data/world.json)

Each airport: one runway along local Z (ends[0] used towards -Z, heading H -> yaw_deg = -H), a full parallel
taxiway at +X, connectors at both ends plus an exit ~1650 m after the arrival threshold, a linear terminal
facing the taxiway, tower, fire station, fuel farm, curb road, car park. World position: geographic offset from
CMN at 50 m per km (the game's compressed distance scale), nudged if it would overlap another airport.
"""
import json, math, os

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W = os.path.join(REPO, 'data', 'world.json')

# code, lon, lat, runway ends, heading of ends[0], length, stands, contact gates, terminal colour, population (millions), tourism
NEW = [
    ('RBA', -6.7515, 34.0515, ('04', '22'), 40, 3500, 6, True, '#b8664a', 2.0, 0.6),
    ('NDR', -3.0282, 34.9888, ('08', '26'), 80, 3000, 4, False, '#a9674a', 0.6, 0.4),
    ('AHU', -3.8395, 35.1771, ('17', '35'), 170, 2500, 3, False, '#a7654b', 0.15, 0.7),
    ('TTU', -5.3200, 35.5943, ('06', '24'), 60, 2300, 3, False, '#ad6a4c', 0.4, 0.6),
    ('ESU', -9.6817, 31.3975, ('16', '34'), 160, 2620, 3, False, '#b47456', 0.08, 1.0),
    ('OZZ', -6.9093, 30.9391, ('12', '30'), 120, 3000, 3, False, '#b0684a', 0.07, 1.0),
    ('ERH', -4.3983, 31.9475, ('09', '27'), 90, 3200, 3, False, '#a8613f', 0.1, 0.5),
    ('EUN', -13.2192, 27.1517, ('04', '22'), 40, 2700, 4, False, '#b06a48', 0.25, 0.3),
    ('VIL', -15.9320, 23.7183, ('03', '21'), 30, 3000, 4, False, '#b77250', 0.13, 0.8),
]
CMN_LL = (-7.5898, 33.3675)
M_PER_KM = 50.0


def layout(code, ends, length, stands, contact):
    half = length / 2
    off = 190                                   # parallel taxiway offset
    face = off + 220                            # terminal face
    sp = 58 if contact else 52
    tz = -half * 0.15                           # terminal along the runway, slightly towards the departure end
    lane_x = face - (6 + 38 + 40)
    zs = [tz + (k - (stands - 1) / 2) * sp for k in range(stands)]
    z_a, z_b = min(zs) - 40, max(zs) + 40
    term_len = max(stands * sp + 70, 180)
    depth = 60 if contact else 44
    exit_z = half - 1650
    conns = [half] + ([exit_z] if exit_z > -half + 300 else []) + [-half]
    return {
        'code': code,
        'identity': f'Regional airport: single {length} m runway {ends[0]}/{ends[1]}, full parallel taxiway, '
                    f'linear terminal with {stands} {"contact gates" if contact else "stair-boarding stands"}.',
        'start_stands': 2,
        'ops': {'departure': ends[0], 'arrival': ends[0]},
        'runways': [{'id': f'{ends[0]}/{ends[1]}', 'ends': list(ends), 'x': 0, 'z': 0, 'length': length, 'width': 45,
                     'taxiway': {'id': 'A', 'side': 1, 'offset': off, 'connectors': [round(c) for c in conns]}}],
        'terminals': [{'id': 'T1', 'type': 'linear', 'style': 'moroccan', 'face': face, 'z': round(tz), 'length': round(term_len),
                       'depth': depth, 'h': 16 if contact else 12, 'stands': stands, 'spacing': sp, 'side': -1, 'contact': contact}],
        'taxilines': [{'id': 'L1', 'type': 'taxilane', 'pts': [[off, round(z_a)], [round(lane_x), round(z_a)]]},
                      {'id': 'L2', 'type': 'taxilane', 'pts': [[off, round(z_b)], [round(lane_x), round(z_b)]]}],
        'buildings': [
            {'type': 'tower', 'x': face + 60, 'z': round(tz - term_len / 2 - 90), 'h': 34, 'model': 'building.tower_small'},
            {'type': 'fire_station', 'x': off + 130, 'z': round(tz - term_len / 2 - 260), 'rot': 0},
            {'type': 'fuel_farm', 'x': off + 140, 'z': round(tz + term_len / 2 + 330), 'tanks': 2, 'model': 'building.fuel_farm_2'},
        ],
        'roads': [{'id': 'curb', 'pts': [[face + depth + 20, round(tz - term_len / 2)], [face + depth + 20, round(tz + term_len / 2)]], 'width': 14},
                  {'id': 'access', 'pts': [[face + depth + 20, round(tz + term_len / 2)], [face + depth + 120, round(tz + term_len / 2 + 120)], [face + depth + 560, round(tz + term_len / 2 + 120)]], 'width': 12}],
        'parking': [{'x': face + depth + 90, 'z': round(tz), 'w': 90, 'd': round(max(term_len - 20, 120))}],
        'service_roads': [],
    }


def km(lon, lat):
    kx = 111.32 * math.cos(math.radians(31.5))
    return ((lon - CMN_LL[0]) * kx, (lat - CMN_LL[1]) * 110.57)


def main():
    world = json.load(open(W, encoding='utf-8'))
    have = {a['code'] for a in world['airports']}
    placed = [(a['center'][0], a['center'][2]) for a in world['airports']]
    for code, lon, lat, ends, hdg, length, stands, contact, colour, pop, tour in NEW:
        lay = layout(code, ends, length, stands, contact)
        json.dump(lay, open(os.path.join(REPO, 'data', 'airports', f'{code}.json'), 'w'), indent=1)
        x, y = km(lon, lat); cx, cz = x * M_PER_KM, -y * M_PER_KM
        # keep 6.5 km between airport centres (layouts reach ~2 km from their centre plus the approach area)
        for _ in range(40):
            near = [(px, pz) for px, pz in placed if math.hypot(cx - px, cz - pz) < 6500]
            if not near: break
            px, pz = near[0]; d = math.hypot(cx - px, cz - pz) or 1
            cx, cz = px + (cx - px) / d * 6600, pz + (cz - pz) / d * 6600
        placed.append((cx, cz))
        entry = {'code': code, 'name_key': f'apt_{code.lower()}', 'center': [round(cx), 0, round(cz)], 'yaw_deg': float(-hdg),
                 'runway_length': length, 'runway_width': 45.0, 'rwy_primary': ends[0], 'rwy_opposite': ends[1], 'has_hangar': False,
                 'terminal_color': colour, 'city': code.lower(), 'layout': f'data/airports/{code}.json', 'lonlat': [lon, lat]}
        if code in have: world['airports'] = [entry if a['code'] == code else a for a in world['airports']]
        else: world['airports'].append(entry)
    # demand data for every airport (population in millions, tourism 0..1)
    POP = {'CMN': (4.3, 0.4), 'RAK': (1.0, 1.0), 'FEZ': (1.2, 0.6), 'TNG': (1.3, 0.6), 'AGA': (0.9, 1.0), 'OUD': (0.6, 0.3)}
    for c, *_rest in NEW: POP[c] = (_rest[8], _rest[9])
    for a in world['airports']:
        p, tr = POP[a['code']]; a['population'] = p; a['tourism'] = tr
    json.dump(world, open(W, 'w', encoding='utf-8'), indent='\t', ensure_ascii=False)
    print('airports:', ', '.join(a['code'] for a in world['airports']))


if __name__ == '__main__':
    main()

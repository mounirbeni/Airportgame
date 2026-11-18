// Schematic domestic network. Positions mirror Morocco's geography while keeping
// overlapping airport buttons legible in the compact route panel.
const points = {
  CMN: [28, 42], TNG: [50, 17], FEZ: [65, 36], OUD: [87, 32],
  RAK: [39, 63], AGA: [23, 81],
};
const controlPoints = {
  TNG: [30, 21], FEZ: [49, 28], OUD: [63, 49], RAK: [48, 44], AGA: [14, 60],
};

function element(name, cls, text) {
  const node = document.createElement(name);
  node.className = cls;
  if (text) node.textContent = text;
  return node;
}

function svgElement(name, attributes) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}

export function createRouteMap(destinations, routes, selected, t, onSelect) {
  const section = element('section', 'route-network');
  const heading = element('h2', 'route-network-title', t('ty_network_map'));
  section.append(heading);
  const map = element('div', 'route-map');
  const drawing = svgElement('svg', { viewBox: '0 0 100 100', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
  drawing.append(
    svgElement('path', {
      class: 'map-land',
      d: 'M0 100 L0 96 8 89 14 80 18 71 22 62 20 57 24 47 29 41 36 33 40 28 46 22 48 16 52 11 57 17 59 23 69 24 77 23 84 25 92 24 100 28 V100Z',
    }),
    svgElement('path', {
      class: 'map-relief',
      d: 'M8 98Q25 71 61 65T100 50 M13 100Q28 76 61 70T100 55 M19 100Q32 81 64 75T100 60 M26 100Q40 85 68 80T100 66 M34 100Q50 90 73 86T100 72',
    }),
  );
  const [hx, hy] = points.CMN;
  for (const {code} of destinations) {
    const point = points[code];
    if (!point) continue;
    const [cx, cy] = controlPoints[code], [x, y] = point;
    drawing.append(svgElement('path', {
      d: `M${hx} ${hy}Q${cx} ${cy} ${x} ${y}`,
      class: 'map-route' + (routes[code] ? ' is-open' : '') + (selected === code ? ' is-selected' : ''),
    }));
  }
  map.append(drawing);
  const home = element('span', 'map-pin is-home', 'CMN');
  home.style.left = hx + '%'; home.style.top = hy + '%';
  home.setAttribute('aria-label', t('apt_cmn'));
  map.append(home);
  for (const {code, name_key} of destinations) {
    if (!points[code]) continue;
    const button = element('button', 'map-pin' + (routes[code] ? ' is-open' : ''), code);
    button.type = 'button';
    button.style.left = points[code][0] + '%'; button.style.top = points[code][1] + '%';
    button.setAttribute('aria-label', t(name_key));
    button.setAttribute('aria-pressed', String(selected === code));
    button.addEventListener('click', () => onSelect(code));
    map.append(button);
  }
  const legend = element('div', 'map-legend');
  legend.append(element('span', 'map-open', t('ty_map_open')), element('span', 'map-locked', t('ty_map_locked')));
  section.append(map, legend);
  return section;
}

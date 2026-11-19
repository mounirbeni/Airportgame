// Geography for the flight map: Morocco's outline (data/maps/morocco.json, traced
// from the owner's map), the surrounding sea and land, cities, and a flat
// projection to kilometres (equirectangular around 31.5°N, accurate to a few %).
const LAT0 = 31.5, LON0 = -7.6, KX = 111.32 * Math.cos(LAT0 * Math.PI / 180), KY = 110.57;

/** lon/lat (degrees) -> map kilometres (x east, y north). */
export const toKm = ([lon, lat]) => [(lon - LON0) * KX, (lat - LAT0) * KY];

// Coastlines of the neighbours, coarse (lon, lat). Only used as background.
const SPAIN_PORTUGAL = [[-10, 46], [-10, 37.1], [-8.9, 37.0], [-7.4, 37.2], [-6.4, 36.8], [-6.0, 36.3], [-5.6, 36.0], [-5.35, 36.15], [-4.4, 36.7],
  [-2.1, 36.7], [-1.6, 37.3], [-0.7, 37.6], [0.2, 38.8], [-0.3, 39.5], [0.9, 41.0], [3.2, 42.0], [3.2, 46]];
const ALGERIA_COAST = [[-2.2, 35.1], [-1.6, 35.3], [-0.6, 35.75], [1.0, 36.4], [3.0, 36.8], [8, 37.0], [9.8, 37.3], [10.3, 36.8], [11.1, 35.2], [10.1, 34.2], [11.5, 33.1], [15.2, 32.3], [19.0, 30.3], [20.1, 32.0], [25, 31.6], [40, 31.6], [40, 0]];
const MAURITANIA_COAST = [[-17.05, 20.77], [-16.9, 20.0], [-16.5, 19.4], [-16.2, 18.0], [-16.0, 16.5], [-16.8, 14.7], [-16.5, 10], [-13, 5], [40, 0]];
const CANARIES = [[-13.6, 29.05, 14], [-14.05, 28.4, 17], [-15.6, 27.95, 16], [-16.6, 28.27, 18], [-17.2, 28.1, 7], [-17.85, 28.65, 9]];   // lon, lat, radius km

export const CITIES = [
  { key: 'map_city_rabat', ll: [-6.84, 34.02], capital: true },
  { key: 'map_city_laayoune', ll: [-13.2, 27.15] },
  { key: 'map_city_dakhla', ll: [-15.93, 23.7] },
  { key: 'map_city_smara', ll: [-11.67, 26.74] },
  { key: 'map_city_guelmim', ll: [-10.06, 28.99] },
  { key: 'map_city_ouarzazate', ll: [-6.9, 30.92] },
  { key: 'map_city_errachidia', ll: [-4.42, 31.93] },
];
export const SEAS = [{ key: 'map_sea_atlantic', ll: [-12.5, 31.5] }, { key: 'map_sea_med', ll: [-3.6, 36.25] }];

export class Geo {
  constructor(outline) {
    this.morocco = outline.map(toKm);
    // Neighbouring land (Algeria, Mauritania): their coasts, closed far to the south-east and back to
    // Saidia through Morocco's interior (Morocco is drawn on top, so its border is exact).
    this.neighbours = [...ALGERIA_COAST, ...MAURITANIA_COAST.slice().reverse()].map(toKm);
    this.spain = SPAIN_PORTUGAL.map(toKm);
    this.canaries = CANARIES.map(([lo, la, r]) => ({ c: toKm([lo, la]), r }));
  }
}

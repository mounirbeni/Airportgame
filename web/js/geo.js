// Geography for the flight map: Morocco's outline (data/maps/morocco.json) and the world's
// coasts and borders (data/maps/world.json), both traced from the owner's maps, cities, and a flat
// projection to kilometres (equirectangular around 31.5°N, accurate to a few %).
const LAT0 = 31.5, LON0 = -7.6, KX = 111.32 * Math.cos(LAT0 * Math.PI / 180), KY = 110.57;

/** lon/lat (degrees) -> map kilometres (x east, y north). */
export const toKm = ([lon, lat]) => [(lon - LON0) * KX, (lat - LAT0) * KY];

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
  /** outline: Morocco (lon/lat); world: {coast: closed loops, borders: polylines} vectorized from the owner's world map. */
  constructor(outline, world) {
    this.morocco = outline.map(toKm);
    this.coast = (world ? world.coast : []).map(l => l.map(toKm));
    this.borders = (world ? world.borders : []).map(l => l.map(toKm));
  }
}

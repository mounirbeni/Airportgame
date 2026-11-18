# Atlas Air 3D — Art prompts

Generate each image with the exact **file name**, **size** and **format** below, then send them back.
The game will load them as textures or UI art and keep the procedural look as a fallback.

## Shared style (paste at the end of every prompt)

> Style: warm Moroccan sunset, golden-hour light, clean semi-realistic game art, soft painterly detail, high readability on small phone screens. Palette: ivory #F2ECDF, midnight teal #0F3F45, copper #B8743D, terracotta #B5583A, desert ochre #C79A66, sunset orange #F2A86B. Original design: no real airline names, logos or liveries, no watermark, no signature.

Rules:
- **Textures** must be flat, front-on (orthographic), evenly lit, with no perspective, shadows or vignette.
- **"Seamless"** means it must tile left-right and top-bottom with no visible seam.
- Avoid text in images, except the logo and the airport name signs listed below.

---

## A. Aircraft

**A1 — `aircraft_livery_side.png`** · 4096×1024 · PNG
> Orthographic side-view livery texture of an original twin-engine passenger jet fuselage, nose pointing left, flat and evenly lit, no perspective. Ivory fuselage, a thin copper cheatline along the window line, a row of dark passenger windows, cockpit windows at the nose, a subtle midnight-teal belly band. Small elegant text "ATLAS AIR" in Latin plus "أطلس" in Arabic calligraphy near the front door. Plain background outside the fuselage. + shared style

**A2 — `aircraft_tail_logo.png`** · 1024×1024 · PNG with transparent background
> Original airline tail emblem: a stylized eight-pointed Moroccan star (zellige geometry) merged with a swept wing, copper on midnight teal, flat vector look, centered, transparent background. + shared style

**A3 — `aircraft_reference_sheet.png`** · 2048×2048 · PNG *(optional, if you want to make a real 3D model with an image-to-3D tool)*
> Clean orthographic reference sheet of one original twin-engine narrow-body passenger jet: front, side, top and rear views aligned on a grid, white background. Ivory body, midnight-teal tail with copper star emblem, copper engine intake lips, winglets, landing gear down. Technical turnaround sheet, no text labels. + shared style

**A4 — `airline_logo.png`** · 1024×1024 · PNG with transparent background
> Logo for the fictional airline "Atlas Air 3D": the A2 emblem above the wordmark "أطلس للطيران" in elegant Arabic calligraphy and "ATLAS AIR" in a clean modern Latin font. Copper and midnight teal, transparent background. + shared style

## B. Airport buildings (textures)

**B1 — `terminal_facade.png`** · 4096×1024 · PNG
> Orthographic front elevation texture of a long modern Moroccan airport terminal facade: terracotta walls, a repeating arcade of tall horseshoe arches with dark teal glass, copper trim above the arches, cream crenellated roofline, a central entrance with a large arch. Flat front view, even lighting, no perspective, no people. Must repeat cleanly left-right. + shared style

**B2 — `terminal_sign_cmn.png`, `terminal_sign_rak.png`, `terminal_sign_fez.png`** · 2048×256 · PNG with transparent background
> Airport roof sign lettering in copper and cream on transparent background: "الدار البيضاء  CASABLANCA" (then "مراكش  MARRAKECH", then "فاس  FÈS"). Arabic calligraphic style next to a clean Latin font, centered, no background. + shared style

**B3 — `tower_cab.png`** · 1024×1024 · PNG, seamless left-right
> Orthographic texture of an air-traffic-control tower: cream concrete shaft band with a copper ring, tinted teal glass cab windows. Flat, front-on, evenly lit. + shared style

**B4 — `hangar_interior_wall.png`** · 2048×1024 · PNG, seamless left-right
> Orthographic texture of an aircraft maintenance hangar interior wall: light corrugated metal panels, steel beams, teal safety stripes, copper-colored tool cabinets along the bottom, warm overhead lighting, clean and tidy. + shared style

## C. Ground textures (seamless, top-down, 2048×2048 PNG)

**C1 — `tex_asphalt.png`**
> Seamless top-down texture of airport runway asphalt: dark grey, fine aggregate, subtle tire marks, no paint lines. Flat, even lighting. + shared style

**C2 — `tex_concrete.png`**
> Seamless top-down texture of airport apron concrete slabs: light warm grey, faint joint grid, a few oil stains. Flat, even lighting. + shared style

**C3 — `tex_desert.png`**
> Seamless top-down texture of Moroccan arid ground: ochre sand and dry soil, small stones, sparse dry grass tufts. Flat, even lighting. + shared style

**C4 — `tex_farmland.png`**
> Seamless top-down texture of patchwork farmland between Casablanca and Marrakech: olive groves in rows, ochre fields, green irrigated patches, seen from high altitude. Flat, even lighting. + shared style

**C5 — `tex_rock.png`**
> Seamless top-down texture of red-brown Atlas mountain rock and scree with patches of light snow. Flat, even lighting. + shared style

**C6 — `tex_zellige.png`** · 1024×1024
> Seamless Moroccan zellige tile pattern in teal, copper, ivory and terracotta, geometric eight-pointed stars, flat front view. + shared style

## D. Sky and landscape

**D1 — `sky_sunset_pano.png`** · 4096×2048 · PNG, equirectangular 360° panorama
> Equirectangular 360-degree panorama of a clear Moroccan sunset sky: sun low on the horizon to the west, warm orange-pink horizon fading to deep teal-blue at the top, a few thin high clouds lit gold. Sky only: the horizon line is exactly at the vertical middle and the lower half is a plain soft haze. Must wrap left-right seamlessly. + shared style

**D2 — `atlas_mountains_strip.png`** · 4096×1024 · PNG with transparent sky
> Distant panorama of the High Atlas mountain range at sunset: layered ridges, red-brown foothills, snow-capped peaks lit pink-gold, atmospheric haze. Transparent background above the mountains, bottom edge solid. Must tile left-right seamlessly. + shared style

## E. Menus and app screens

**E1 — `splash_keyart.png`** · 1920×1080 · PNG
> Cinematic key art: an original ivory twin-engine jet with midnight-teal tail and copper accents taking off at sunset over a terracotta Moroccan airport terminal, Atlas foothills in the background, warm golden light, third-person view from behind and slightly above, lots of empty sky on the left for the title. + shared style

**E2 — `app_icon.png`** · 1024×1024 · PNG, square, keep key content within the center 80%
> App icon: an ivory passenger jet banking in front of a large copper sunset circle with an eight-pointed Moroccan star, midnight-teal background, bold simple shapes, readable at 48 px, no text. + shared style

**E3 — `card_casablanca.png`, `card_marrakech.png`, `card_fes.png`** · 1200×800 · PNG
> Destination postcard illustration of Casablanca: the Atlantic coastline and a grand mosque minaret at sunset, white city buildings. (Marrakech: the Koutoubia minaret, red city walls and palm trees with the snowy Atlas behind. Fès: the old medina rooftops and green-tiled roofs in the hills.) No text. + shared style

**E4 — `hangar_bg.png`** · 1920×1080 · PNG
> Wide interior view of a clean, warmly lit aircraft hangar with an empty polished floor in the center (space for the 3D plane), teal and copper accents, large open door at the back showing a sunset sky. + shared style

---

### Priority if you want to start small

E2 (icon) → E1 (splash) → D1 (sky) → C1/C2/C3 (runway, apron, ground) → B1 (terminal) → A1/A2 (aircraft livery and tail).

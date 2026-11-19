# Atlas Air 3D — طلب الرسومات والمجسمات (أمر التنفيذ)

**الطريقة:** مخطط المطار ثابت بالمتر (أنا المسؤول عنه). أنت تبني كل مجسم وخامة **بالقياس المكتوب هنا بالضبط**، وأنا أضع الملف في مكانه **كما هو**: بلا قصّ، بلا تتبّع، بلا تعديل.
كل منفذ (Slot) موصول في الكود ومُختبَر: الملف يُحجَّم إلى قياسه الحقيقي، ويُوضع في مكانه، ويُوجَّه تلقائيًا.

**المرجع البصري (الشكل المطلوب):** `docs/reference/cmn_reference_look.png` — صورتك. نأخذ منها **الطابع** (المبنى الحديث الفضي بالزجاج، الجسور، الألوان، العشب، الإضاءة الدافئة)، لا القياسات.
**المخطط الدقيق (القياسات والمواضع):**

| الملف | المحتوى | المقياس |
|---|---|---|
| `docs/reference/cmn_master_plan.png` | المطار كاملًا: المدارج، الممرات، الساحات، الطرق، كل مبنى برمزه (B1…B10) | 1 بكسل = 2 م، شبكة 200 م |
| `docs/reference/cmn_apron_detail.png` | المبنى B1، الذراعان B2، المواقف S1–S16، الجسور | 1 بكسل = 0.5 م، شبكة 50 م |
| `docs/reference/cmn_north_detail.png` | الحظائر، المطافئ، الشحن، الوقود | 1 بكسل = 0.5 م، شبكة 50 م |

الخط الأحمر على أي مبنى في المخطط = **الواجهة / الأبواب**.

---

## 0. قواعد إلزامية لكل مجسم

| البند | القاعدة |
|---|---|
| الصيغة | **GLB** (glTF 2.0)، ملف واحد لكل مجسم، الخامات مضمّنة |
| الوحدة | **1 وحدة = 1 متر**، بالقياس الحقيقي المكتوب |
| المحاور | **Y للأعلى** |
| نقطة الأصل | **منتصف القاعدة على الأرض** (y = 0 عند أساس المبنى / العجلات) |
| الطائرات والمركبات | **المقدّمة نحو −Z** |
| المباني | **الواجهة (الأبواب / جهة الطائرات) نحو −X** إلا إذا كُتب غير ذلك |
| الخامات | PBR: BaseColor + Normal + ORM. المباني الكبيرة 2048²، الصغيرة 1024² |
| حدّ المثلثات | مبنى كبير 60k · مبنى صغير 15k · طائرة 40k · مركبة 6k · جسر 5k |
| الزجاج | مادة منفصلة اسمها يحتوي `glass` |
| الإضاءة | **بلا ظلال مرسومة وبلا إضاءة مخبوزة** في الخامات (اللعبة تضيف الشمس والظلال) |
| ممنوع داخل الملف | أرضية، خلفية، طائرات أو سيارات ملتصقة بالمبنى |

---

## 1. مباني مطار الدار البيضاء CMN (الأولوية الأولى)

الطابع لكل المباني: **حديث كما في الصورة المرجعية**. سقف معدني فضي، واجهات زجاجية زرقاء مخضرّة، وإطارات رمادية داكنة. الإضاءة الداخلية الدافئة اختيارية في الخامة (Emissive).

| الرمز | الملف | المنفذ | القياس (م): X (عمق) × Z (طول) × Y (ارتفاع) | الواجهة | العدد في المطار |
|---|---|---|---|---|---|
| **B1** | `CMN_terminal_main.glb` | `CMN.terminal_main` | **100 × 900 × 24** | −X (جهة الطائرات) | 1 |
| **B2** | `CMN_pier.glb` | `CMN.pier` | **36 × 400 × 12** | الطرف +Z يلتصق بـ B1 | 2 |
| **B3** | `jet_bridge.glb` | `building.jet_bridge` | **3.4 × 12.5 × 6** | الطرف −Z عند جدار B2، الطرف +Z (الكابينة) عند باب الطائرة | 16 |
| **B4** | `CMN_tower.glb` | `CMN.tower` | قاعدة ≈ 14 × 14، **الارتفاع الكلي 72** مع الهوائي (كابينة زجاجية على ارتفاع ≈ 50، قطرها ≈ 20) | — | 1 |
| **B5** | `CMN_hangar.glb` | `CMN.hangar` | **75 × 84 × 29** (جدار 20 + قوس 9) | −X (البوابة الكبيرة) | 2 |
| **B6** | `CMN_fire_station.glb` | `CMN.fire_station` | **26 × 44 × 9** + برج تدريب 5 × 5 × 18 | −X (4 أبواب شاحنات) | 1 |
| **B7** | `CMN_cargo.glb` | `CMN.cargo` | **60 × 320 × 18** | −X (أبواب تحميل كل 20 م) | 1 |
| **B8** | `CMN_fuel_farm.glb` | `CMN.fuel_farm` | **62 × 62**: 3 خزانات (قطر 20، ارتفاع 14) داخل جدار حماية ارتفاعه 1.6 | — | 1 |
| **B9** | `CMN_admin_small.glb` | `CMN.admin_small` | **70 × 45 × 12** ← هنا الطول على X | −Z (نحو المبنى) | 1 |
| **B10** | `CMN_admin_long.glb` | `CMN.admin_long` | **260 × 60 × 14** ← هنا الطول على X | −Z (نحو المبنى) | 2 |
| — | `light_mast.glb` | `building.light_mast` | عمود ارتفاعه الكلي **26.6** ورأس إنارة 1.6 × 4.5 | — | حول الساحات |

**تفاصيل يجب احترامها:**
- **B1:**
  - الذراعان B2 يلتصقان بالواجهة −X عند **z = −280 و z = +280** (من منتصف المبنى).
  - في الوسط قاعة زجاجية مرتفعة كما في الصورة المرجعية.
  - الواجهة الخلفية +X تطلّ على طريق السيارات، وفيها مداخل ومظلّة.
- **B2:**
  - في كل جانب طويل (±X) **4 فتحات للجسور**.
  - أول فتحة على بُعد **45 م** من الطرف +Z، ثم فتحة كل **95 م**.
  - لا شيء بارز أكثر من 1 م خارج العرض 36.
- **B3:**
  - مجسم واحد يتكرر 16 مرة؛ اللعبة توجّهه من جدار الذراع إلى باب الطائرة.
  - الأسطوانة الدوّارة (قطر 4.8) عند −Z.
  - النفق زجاجي الجانبين.
  - الكابينة (4.2 × 3.4) عند +Z، وأرضيتها على ارتفاع **3.4 م** (ارتفاع باب الطائرة)، وتحتها عجلتان.
- **B8:** الخزانات الثلاثة على شبكة 2 × 2 بتباعد 26 م (الخانة الرابعة فارغة).

### الأوامر الجاهزة (Prompts)

> **B1:** Game-ready low-poly 3D model of a large modern airport passenger terminal, exactly 900 m long (Z axis), 100 m deep (X axis), 24 m tall. Curved silver standing-seam metal roof, central raised glass hall with a large glazed curtain wall, blue-green tinted glass facades with dark grey mullions, airside facade facing −X with two pier connection points at z = −280 m and z = +280 m, landside facade (+X) with entrances and a canopy over the curb. Style matching a contemporary international airport, PBR materials, origin at the centre of the footprint on the ground, Y up, no ground plane, no background, no aircraft.

> **B2:** Game-ready low-poly 3D model of an airport concourse pier, 36 m wide (X), 400 m long (Z), 12 m tall, silver metal roof, continuous glazing on both long sides, four boarding-bridge door openings on each long side (first at 45 m from the +Z end, then every 95 m), +Z end connects flush to the main terminal, PBR, origin at footprint centre on the ground, Y up, no ground.

> **B3:** Game-ready 3D model of an airport passenger boarding bridge (jet bridge), total length 12.5 m along Z: cylindrical rotunda (4.8 m diameter) at the −Z end, telescopic tunnel with glass side windows, operator cab head 4.2 × 3.4 m at the +Z end with cab floor 3.4 m above ground, a supporting column with two wheels under the cab, grey metal, PBR, origin at the middle of its length on the ground, Y up.

> **B4:** Game-ready 3D model of a modern airport control tower, total height 72 m including antenna mast, slender concrete shaft, faceted glass control cab (≈20 m diameter) at ≈50 m height, white and light-grey, PBR, origin at base centre, Y up.

> **B5:** Game-ready 3D model of an aircraft maintenance hangar, 75 m deep (X), 84 m wide (Z), 29 m tall (20 m walls + 9 m barrel-vault roof), full-width sliding doors on the −X face, silver metal cladding, PBR, origin at footprint centre, Y up.

> **B6:** Game-ready 3D model of an airport fire and rescue station, 26 × 44 m footprint, 9 m tall, four large red vehicle doors on the −X face, a 5 × 5 × 18 m training tower at one corner, PBR, origin at footprint centre, Y up, no vehicles.

> **B7:** Game-ready 3D model of an air cargo warehouse, 60 m deep (X), 320 m long (Z), 18 m tall, loading dock doors every 20 m on the −X face, ribbed metal cladding, PBR, origin at footprint centre, Y up.

> **B8:** Game-ready 3D model of an airport fuel farm, 62 × 62 m footprint, three white cylindrical tanks (20 m diameter, 14 m tall) on a 2 × 2 grid with 26 m spacing (one empty cell), concrete bund wall 1.6 m high around them, pipes and a small pump house, PBR, origin at footprint centre, Y up.

> **B9 / B10:** Game-ready 3D model of a modern low airport office building, [70 × 45 × 12 m | 260 × 60 × 14 m] (length along X), glass ribbon windows, main entrance on the −Z face, flat roof with HVAC units, PBR, origin at footprint centre, Y up.

---

## 2. خامات الأرضيات (CMN وكل المطارات)

صور **قابلة للتكرار بلا حدود ظاهرة (Seamless)**، منظور **من الأعلى تمامًا**، **بلا ظلال وبلا خطوط طلاء** (اللعبة ترسم العلامات بنفسها). كل صورة تغطي مساحة حقيقية ثابتة؛ اللعبة تكرّرها بهذا المقاس بالضبط.

| الرمز | الملف | المساحة التي تغطيها الصورة | الحجم | الوصف |
|---|---|---|---|---|
| T1 | `tex_runway_asphalt.png` | **45 × 45 م** (كامل عرض المدرج) | 2048² | أسفلت رمادي غامق، آثار إطارات خفيفة في المنتصف |
| T2 | `tex_taxiway_asphalt.png` | **23 × 23 م** | 2048² | أسفلت رمادي أفتح قليلًا |
| T3 | `tex_shoulder.png` | **23 × 23 م** | 1024² | أسفلت رمادي فاتح خشن (أكتاف المدارج والممرات) |
| T4 | `tex_apron_concrete.png` | **25 × 25 م** = **4 × 4 بلاطات** (6.25 م) | 2048² | خرسانة فاتحة، فواصل داكنة رفيعة، بقع زيت خفيفة |
| T5 | `tex_airfield_grass.png` | **260 × 260 م** | 2048² | عشب أخضر طبيعي متدرّج كما في الصورة المرجعية |
| T6 | `tex_road.png` | **12 × 12 م** | 1024² | أسفلت طرق |
| T7 | `tex_parking.png` | **12 × 12 م** | 1024² | أسفلت موقف سيارات، **بلا خطوط** |

> Prompt (مثال T4): Seamless tileable top-down texture of light grey airport apron concrete, exactly 4 × 4 square slabs with thin dark expansion joints, subtle oil stains and tyre marks, flat even lighting, no shadows, no perspective, no paint lines, photorealistic, 2048 × 2048.

---

## 3. الطائرات (لكل المطارات)

| الملف | المنفذ | القياس (م) |
|---|---|---|
| `aircraft_t2.glb` | `aircraft.jet` | طول **37.6** · امتداد 35.8 · ارتفاع 11.8 (فئة A320) |
| `aircraft_t3.glb` | `aircraft.jet_large` | طول **44.5** · امتداد 35.8 · ارتفاع 11.8 (فئة A321) |
| `aircraft_p70.glb` | `aircraft.turboprop` | طول **27.2** · امتداد 27.0 · ارتفاع 7.7 (فئة ATR 72، جناح علوي، ذيل T) |

- **المقدّمة والعجلات:** المقدّمة نحو −Z، والعجلات على y = 0.
- **ارتفاع الباب الأمامي الأيسر:** حوالي 3.4 م (يلتقي بالجسر B3).
- **الهوية:** شركة خيالية **Atlas Air**:
  - جسم أبيض لامع.
  - ذيل أخضر مزرق `#0f3f45` عليه نجمة نحاسية `#e08c4c`.
  - بلا شعارات حقيقية.

> Prompt (T2): Game-ready 3D model of a generic twin-engine narrow-body airliner, 37.6 m long, 35.8 m wingspan, 11.8 m tall, nose towards −Z, landing gear down with wheels at y = 0, fictional "Atlas Air" livery: glossy white fuselage, dark teal (#0f3f45) tail with a copper eight-pointed star, "ATLAS AIR" titles, PBR, no background.

---

## 4. مركبات الساحة (لكل المطارات)

| الملف | المنفذ | الطول × العرض × الارتفاع (م) | ملاحظة |
|---|---|---|---|
| `vehicle_tug.glb` | `vehicle.tug` | 5.2 × 2.4 × 1.6 | جرّار دفع الطائرات، أصفر برتقالي `#e8a325` |
| `vehicle_baggage_cart.glb` | `vehicle.baggage_cart` | 3.0 × 1.6 × 1.7 | عربة أمتعة مغطاة، ذراع السحب نحو +Z |
| `vehicle_fuel_truck.glb` | `vehicle.fuel_truck` | 10.0 × 2.6 × 3.2 | صهريج وقود أبيض |
| `vehicle_stairs_truck.glb` | `vehicle.stairs_truck` | 8.0 × 2.4 × 4.6 | قمة السلّم نحو −Z |
| `vehicle_fire_truck.glb` | `vehicle.fire_truck` | 11.0 × 3.0 × 3.6 | شاحنة إطفاء مطارات، حمراء `#c81e1e` |

كل المركبات: **المقدّمة نحو −Z**، العجلات على y = 0.

---

## 5. ما لا تحتاج صنعه

| العنصر | السبب |
|---|---|
| علامات المدارج والممرات والمواقف، والأضواء، وPAPI | اللعبة ترسمها بدقة من المخطط |
| الأشجار والسيارات في المواقف | آلاف النسخ تُرسم معًا للأداء |
| السياج والطرق | تُبنى من المخطط وتأخذ خامة T6 |

---

## 6. التسليم وما أفعله

| ما ترسله | أين أضعه | ما أفعله |
|---|---|---|
| المجسمات `.glb` بالأسماء أعلاه | `web/assets/models/` | أكتب اسم الملف في منفذه في `data/models.json` (سطر واحد لكل ملف) |
| الخامات `.png` بالأسماء أعلاه | `web/assets/tex/` | أحوّلها إلى WebP بـ `tools/import_art.py` |

لا تعديل على الكود ولا على المخطط. ثم أرسل لك صورًا من اللعبة للتأكيد، وأنشر عند موافقتك.

**يمكن التسليم على دفعات:** كل ملف يعمل وحده فور وضعه، وما لم يصل بعد يبقى بالشكل الحالي.

**إن خرج ملف بقياس أو اتجاه مختلف:** أخبرك بالقياس الفعلي وأرجعه إليك لتصحيحه. لا أعدّله أنا.

---

## 7. باقي المطارات (بعد CMN)

مخططاتها جاهزة في `data/airports/`. أرسل لك أمرًا مماثلًا لكل مطار حين ننتهي من CMN.

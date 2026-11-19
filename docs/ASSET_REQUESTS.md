# Atlas Air 3D — طلبات الرسومات والمجسمات (للمصمّم)

هذا الملف هو **قائمة الطلبات** لكل ما تحتاجه اللعبة من رسومات. أنت (أو المصمّم) تُنتج الملفات بهذه المواصفات، وأنا أضعها في مكانها في اللعبة فقط.
كل مجسم له: اسم الملف، القياسات الحقيقية بالمتر، الاتجاه، نقطة الأصل، الحدّ الأقصى للتفاصيل، والأمر الجاهز (Prompt) لأداة التوليد.

> الأوامر مكتوبة بالإنجليزية لأن أدوات التوليد (صور / 3D) تفهمها أفضل. القياسات هي المرجع: إذا خرج المجسم بحجم مختلف، أعيد تحجيمه تلقائيًا إلى القياس المكتوب هنا.

---

## 0. قواعد عامة لكل المجسمات (مهم)

| البند | القاعدة |
|---|---|
| الصيغة | **GLB** (glTF 2.0 ثنائي)، ملف واحد لكل مجسم، الخامات (Textures) مضمّنة داخله |
| الوحدة | **المتر** (1 وحدة = 1 م) |
| المحاور | **Y للأعلى** |
| نقطة الأصل (Pivot) | في **منتصف قاعدة المجسم على الأرض** (y = 0 عند العجلات / أساس المبنى) |
| اتجاه الطائرات والمركبات | **المقدّمة نحو −Z** |
| اتجاه المباني | **الواجهة الرئيسية نحو −X** (الجهة المطلّة على الساحة / المدرج) |
| الخامات | PBR: BaseColor + Normal + ORM (Occlusion/Roughness/Metallic) |
| حجم الخامات | طائرات ومبانٍ كبيرة: 2048×2048 · مركبات ومبانٍ صغيرة: 1024×1024 |
| عدد المثلثات (حدّ أقصى) | طائرة 40k · مبنى كبير 60k · مبنى صغير 15k · مركبة 6k |
| النوافذ / الزجاج | مادة منفصلة اسمها يحتوي `glass` (أجعلها عاكسة وشفافة جزئيًا) |
| الإضاءة | **لا** إضاءة مخبوزة قوية ولا ظلال مرسومة في الخامة (اللعبة تضيف الشمس والظلال) |
| الخلفية | بلا أرضية وبلا خلفية داخل الملف |
| الهوية | شركة الطيران خيالية: **Atlas Air**. أبيض مع ذيل أخضر مزرق (#0f3f45) ونجمة نحاسية (#e08c4c). لا شعارات حقيقية |

**التسليم:** أرسل الملفات بالأسماء المكتوبة أدناه (مثال `aircraft_t2.glb`). أضعها في `web/assets/models/` وأربطها في `data/models.json`.

---

## 1. الطائرات (3 مجسمات) — المنافذ جاهزة في الكود

### 1.1 `aircraft_t2.glb` — Atlas T2 (فئة A320، طائرة نفاثة ضيقة البدن)
- **المنفذ:** `aircraft.jet` · **التحجيم على:** الطول (Z) = **37.6 م**
- **القياسات:** طول 37.6 · امتداد الجناحين 35.8 · ارتفاع حتى قمة الذيل 11.8 · قطر جسم الطائرة 3.95 · محركان تحت الجناحين · ارتفاع الباب الأمامي عن الأرض ≈ 3.4
- **العجلات:** على الأرض (y = 0)، العجلة الأمامية تحت قمرة القيادة، المقدّمة نحو −Z
- **Prompt:**
  > Low-poly but detailed 3D model of a generic twin-engine narrow-body airliner (A320-class proportions: 37.6 m long, 35.8 m wingspan, 11.8 m tall), fictional "Atlas Air" livery: glossy white fuselage, dark teal (#0f3f45) vertical tail with a copper eight-pointed star, thin copper cheatline, "ATLAS AIR" lettering on the forward fuselage, grey wing and engine nacelles, landing gear down, passenger windows and doors as texture detail, PBR materials, game-ready, clean topology, no background, no ground plane.

### 1.2 `aircraft_t3.glb` — Atlas T3 (فئة A321، أطول)
- **المنفذ:** `aircraft.jet_large` · **التحجيم على:** الطول (Z) = **44.5 م**
- **القياسات:** طول 44.5 · امتداد 35.8 · ارتفاع 11.8 · قطر الجسم 3.95 · نفس الهوية
- **Prompt:** نفس أمر T2 مع استبدال القياسات بـ `44.5 m long` و `stretched fuselage with four pairs of doors`.

### 1.3 `aircraft_p70.glb` — Atlas P70 (فئة ATR 72، مروحية توربينية)
- **المنفذ:** `aircraft.turboprop` · **التحجيم على:** الطول (Z) = **27.2 م**
- **القياسات:** طول 27.2 · امتداد 27.0 · ارتفاع 7.7 · جناح علوي · ذيل على شكل T · محرّكان بمراوح 6 شفرات
- **Prompt:**
  > Low-poly detailed 3D model of a generic high-wing twin-turboprop regional airliner (ATR 72-class: 27.2 m long, 27 m wingspan, 7.7 m tall, T-tail, two six-blade propellers), fictional "Atlas Air" livery: white fuselage, dark teal (#0f3f45) tail with copper star, landing gear down, PBR, game-ready, no background.

---

## 2. مركبات الخدمة الأرضية

| الملف | المنفذ | الطول × العرض × الارتفاع (م) | الحالة |
|---|---|---|---|
| `vehicle_tug.glb` | `vehicle.tug` | 5.2 × 2.4 × 1.6 (منخفض جدًا، كابينة صغيرة) | المنفذ جاهز |
| `vehicle_baggage_tractor.glb` | — | 3.0 × 1.5 × 1.9 | أربطه عند التسليم |
| `vehicle_baggage_cart.glb` | — | 3.0 × 1.6 × 1.7 (عربة أمتعة مغطاة) | أربطه عند التسليم |
| `vehicle_fuel_truck.glb` | — | 10.0 × 2.6 × 3.2 (صهريج وقود طيران) | أربطه عند التسليم |
| `vehicle_stairs_truck.glb` | — | 8.0 × 2.4 × 4.6 (سلّم صعود متحرك) | أربطه عند التسليم |
| `vehicle_fire_truck.glb` | — | 11.0 × 3.0 × 3.6 (شاحنة إطفاء مطارات ARFF، 6 عجلات) | أربطه عند التسليم |
| `vehicle_car.glb` | — | 4.4 × 1.8 × 1.5 (سيارة عادية، لون أبيض محايد) | أربطه عند التسليم |
| `vehicle_bus.glb` | — | 12.0 × 2.6 × 3.1 (حافلة نقل ركاب داخل الساحة) | أربطه عند التسليم |

**ألوان:** مركبات الخدمة صفراء برتقالية (#e8a325)، الإطفاء أحمر (#c81e1e)، الصهريج أبيض.
**Prompt (قالب):**
> Low-poly 3D model of an airport [TYPE], [L] m long, [W] m wide, [H] m tall, [COLOR] paint, realistic proportions, PBR materials, game-ready, front facing −Z, no background, no ground plane.

---

## 3. الجسر الجوي (Jet bridge) — قطع منفصلة

الجسر يتغيّر طوله حسب الموقف، لذلك أحتاجه **3 قطع**:

| الملف | الوصف | القياس (م) |
|---|---|---|
| `jetbridge_rotunda.glb` | الأسطوانة الثابتة عند المبنى | قطر 4 · ارتفاع 6 (الأرضية على ارتفاع 4) |
| `jetbridge_tunnel.glb` | مقطع النفق (أكرّره وأمدّه) | طول **10** · عرض 2.8 · ارتفاع 3 · على عمود في منتصفه |
| `jetbridge_cab.glb` | الكابينة التي تلتصق بباب الطائرة | 4 × 4 × 3.2 · مع عجلتين تحتها |

> Prompt: Low-poly 3D airport passenger boarding bridge part: [rotunda / straight telescopic tunnel segment 10 m long, 2.8 m wide, 3 m tall, glass side windows, grey metal / cab head 4 × 4 × 3.2 m with rubber canopy], PBR, game-ready, no background.

---

## 4. المباني — قياسات كل مطار

كل مبنى يمكن تصميمه **عامًا لكل المطارات** (`building.<type>`) أو **خاصًا بمطار واحد** (`<CODE>.<type>`، مثل `CMN.terminal_main`). الطابع: مغربي حديث (أقواس، زليج، نحاس، جدران بلون التراب) إلا طنجة TNG حديثة بالزجاج.

### 4.1 مباني الركاب (Terminal) — الأهم

| المطار | الملف | العرض (X) × العمق (Z) × الارتفاع (م) | الطابع |
|---|---|---|---|
| CMN الدار البيضاء | `CMN_terminal_main.glb` | 560 × 90 × 24 (الواجهة الطويلة المطلّة على الساحة: اصنعها نحو −X، وأنا أدوّر المبنى عند الوضع) | مغربي، قبة نحاسية في الوسط |
| CMN | `CMN_pier.glb` ×2 | 36 × **520** × 12 (رصيف طويل تخرج منه الجسور) | مغربي |
| RAK مراكش | `RAK_terminal_main.glb` | 70 × 640 × 18 (مبنى طولي) | مغربي، لون أحمر مراكشي #c0623f |
| AGA أكادير | `AGA_terminal_main.glb` | 60 × 520 × 16 | مغربي ساحلي |
| FEZ فاس | `FEZ_terminal_main.glb` | 50 × 260 × 14 | مغربي تقليدي، زليج |
| OUD وجدة | `OUD_terminal_main.glb` | 44 × 180 × 12 | مغربي بسيط |
| TNG طنجة | `TNG_terminal_main.glb` | 320 × 70 × 20 | **حديث، زجاج** |
| TNG | `TNG_pier.glb` | 32 × 450 × 11 | حديث |

**مواضع الأبواب:** الجسور تلتصق بالواجهة كل 60 م تقريبًا. لا تضع تفاصيل بارزة أكثر من 2 م خارج القياس.

> Prompt (CMN): Low-poly 3D model of a large modern Moroccan-style airport passenger terminal, 560 m long, 90 m deep, 24 m tall, earth-red walls (#b5583a), arched glass facade facing the apron, zellige tile bands, a copper dome at the centre, flat roof with technical equipment, airside facade with evenly spaced boarding gates every 60 m, PBR materials, game-ready, no background, no ground.

### 4.2 مباني التشغيل

| الملف | القياس (م) | ملاحظات |
|---|---|---|
| `building_tower.glb` | قاعدة ≈ 12 × 12 · **الارتفاع حسب المطار**: CMN 62 · TNG 55 · RAK 48 · AGA 45 · FEZ 36 · OUD 32 | برج مراقبة، كابينة زجاجية علوية قطرها ≈ 14. أرسل نسخة واحدة وأنا أحجّمها لكل مطار |
| `building_hangar.glb` | 90 × 75 · ارتفاع 29 (جدار 20 + قوس 9) · RAK/TNG: 80 × 70 | بوابة كبيرة على الواجهة −X |
| `building_fire_station.glb` | 28 × 46 × 9 · برج تدريب 5 × 5 × 18 | 4 أبواب مركبات على الواجهة |
| `building_cargo.glb` | 60 × 300 × 18 (CMN) | مستودع شحن، أبواب تحميل كل 20 م |
| `building_fuel_tank.glb` | خزان: قطر 18 · ارتفاع 14 | أكرّره (CMN 6 خزانات، OUD 2) |
| `building_parking_garage.glb` | CMN 300 × 90 × 5 طوابق (3.2 م للطابق) · TNG 220 × 70 × 4 | مرآب سيارات متعدد الطوابق |
| `building_admin.glb` | CMN 80 × 40 × 30 · RAK 70 × 40 × 18 · AGA 60 × 36 × 16 | مبنى إدارة |
| `building_radar.glb` | برج 20 م + هوائي دوّار 9 × 2.2 | **الهوائي قطعة منفصلة** اسمها `antenna` (أجعله يدور) |
| `building_light_mast.glb` | ارتفاع 26 · رأس إضاءة 4.5 م | عمود إنارة الساحة |

---

## 5. خامات الأرضيات (صور 2D قابلة للتكرار Seamless)

| الملف | الحجم | المساحة الحقيقية للصورة | الوصف |
|---|---|---|---|
| `tex_runway_asphalt.png` | 2048² | 45 × 45 م | أسفلت رمادي غامق محايد، حبيبات دقيقة، بلا خطوط |
| `tex_taxiway_asphalt.png` | 1024² | 23 × 23 م | أسفلت أفتح قليلًا |
| `tex_shoulder.png` | 1024² | 23 × 23 م | أسفلت رمادي فاتح للأكتاف |
| `tex_apron_concrete.png` | 2048² | 25 × 25 م | **2 × 2 بلاطات** خرسانية فاتحة مع فواصل داكنة رفيعة |
| `tex_grass.png` | 2048² | 260 × 260 م | عشب أخضر طبيعي متدرّج (منظور من الأعلى) |
| `tex_road.png` | 1024² | 12 × 12 م | أسفلت طرق |

**قاعدة مهمة:** الخامة **بلا ظلال وبلا إضاءة**، منظور **من الأعلى تمامًا**، وتتكرّر بلا حدود ظاهرة.

> Prompt (مثال): Seamless tileable top-down texture of light grey airport apron concrete, exactly 2 × 2 square slabs with thin dark expansion joints, subtle stains and tyre marks, flat even lighting, no shadows, no perspective, photorealistic, 2048 × 2048.

---

## 6. عناصر صغيرة (اختياري)

| الملف | القياس (م) |
|---|---|
| `sign_taxiway.glb` (لوحة إرشاد صفراء/سوداء) | 2.5 × 0.3 × 1.2 |
| `sign_stand_number.png` (A01…A30) | 512 × 256، أصفر على أسود |
| `windsock.glb` | عمود 6 م + كُمّ 3.6 م |
| `fence_segment.glb` (سياج أمني) | طول 8 · ارتفاع 2.6 · مع سلك شائك |
| `palm_tree.glb` | ارتفاع 10–14 |

---

## 7. ما أفعله أنا عند استلام الملفات

1. أضعها في `web/assets/models/` (أو `web/assets/tex/` للخامات).
2. أربط كل ملف بمنفذه في `data/models.json` (والمنافذ غير الموجودة أضيفها في الكود).
3. اللعبة تحجّم كل مجسم إلى القياس الحقيقي وتضعه على الأرض في مكانه.
4. أرسل لك صورًا للنتيجة، ثم أنشر.

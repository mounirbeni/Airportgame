extends Node3D
## Procedural airport built in the AirportDef local frame (see airport_def.gd).
## Reused for every airport: runway with markings, edge/approach lights and a
## PAPI, parallel taxiway with hold lines, apron, terminal, tower, hangar.

const AirportDef = preload("res://scripts/data/airport_def.gd")

const LAYER_GROUND: int = 1
const LAYER_OBSTACLE: int = 2
const Y_APRON: float = 0.10
const Y_TAXI: float = 0.12
const Y_RWY: float = 0.15
const Y_PAINT: float = 0.19

var def: AirportDef
var _paint: Dictionary = {}       # color key -> Array[Transform3D]
var _lights: Dictionary = {}      # color key -> Array[Transform3D]
var _papi_mats: Array[StandardMaterial3D] = []
var _papi_z: float = 0.0
var _mats: Dictionary = {}


func build(airport: AirportDef) -> void:
	def = airport
	name = "Airport_" + def.code
	transform = def.get_transform()
	_build_pavement()
	_build_runway_markings()
	_build_taxi_markings()
	_build_lights()
	_build_papi()
	_build_terminal()
	_build_tower()
	if def.has_hangar:
		_build_hangar()
	_flush_multimeshes()


# --- helpers ---------------------------------------------------------------

func mat(key: String, color: Color, unshaded: bool = false, rough: float = 0.9) -> StandardMaterial3D:
	if _mats.has(key):
		return _mats[key]
	var m := StandardMaterial3D.new()
	m.albedo_color = color
	m.roughness = rough
	if unshaded:
		m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_mats[key] = m
	return m


func box(size: Vector3, pos: Vector3, m: Material, collide: bool = false, yaw: float = 0.0) -> MeshInstance3D:
	var bm := BoxMesh.new()
	bm.size = size
	var mi := MeshInstance3D.new()
	mi.mesh = bm
	mi.material_override = m
	mi.position = pos
	mi.rotation.y = yaw
	add_child(mi)
	if collide:
		add_collider(size, pos, yaw, LAYER_OBSTACLE)
	return mi


func add_collider(size: Vector3, pos: Vector3, yaw: float, layer: int) -> void:
	var body := StaticBody3D.new()
	body.collision_layer = layer
	body.collision_mask = 0
	body.position = pos
	body.rotation.y = yaw
	var cs := CollisionShape3D.new()
	var sh := BoxShape3D.new()
	sh.size = size
	cs.shape = sh
	body.add_child(cs)
	add_child(body)


func paint(key: String, center: Vector3, size: Vector3, yaw: float = 0.0) -> void:
	if not _paint.has(key):
		_paint[key] = []
	var b := Basis(Vector3.UP, yaw) * Basis.from_scale(size)
	_paint[key].append(Transform3D(b, center))


func paint_line(key: String, a: Vector3, b: Vector3, width: float) -> void:
	var d: Vector3 = b - a
	d.y = 0.0
	var length: float = d.length()
	if length < 0.01:
		return
	var yaw: float = atan2(d.x, d.z)
	paint(key, (a + b) * 0.5 + Vector3(0, Y_PAINT, 0), Vector3(width, 0.04, length), yaw)


func light(key: String, pos: Vector3) -> void:
	if not _lights.has(key):
		_lights[key] = []
	_lights[key].append(Transform3D(Basis(), pos))


func _flush_multimeshes() -> void:
	var paint_colors: Dictionary = {
		"white": Color(0.95, 0.95, 0.92), "yellow": Color(0.95, 0.75, 0.15),
		"red": Color(0.75, 0.12, 0.1),
	}
	var unit := BoxMesh.new()
	unit.size = Vector3.ONE
	for key in _paint.keys():
		var c: Color = paint_colors.get(key, Color.WHITE)
		_add_multimesh(unit, _paint[key], mat("paint_" + key, c, false, 0.8), "Paint_" + key)
	var light_colors: Dictionary = {
		"white": Color(1.0, 0.95, 0.8), "green": Color(0.2, 1.0, 0.35),
		"red": Color(1.0, 0.15, 0.1), "blue": Color(0.25, 0.45, 1.0),
		"amber": Color(1.0, 0.7, 0.2),
	}
	var bulb := SphereMesh.new()
	bulb.radius = 0.7
	bulb.height = 1.4
	bulb.radial_segments = 6
	bulb.rings = 3
	for key in _lights.keys():
		var c: Color = light_colors.get(key, Color.WHITE)
		_add_multimesh(bulb, _lights[key], mat("light_" + key, c, true), "Lights_" + key)


func _add_multimesh(mesh: Mesh, xforms: Array, m: Material, node_name: String) -> void:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.mesh = mesh
	mm.instance_count = xforms.size()
	for i in xforms.size():
		mm.set_instance_transform(i, xforms[i])
	var mmi := MultiMeshInstance3D.new()
	mmi.name = node_name
	mmi.multimesh = mm
	mmi.material_override = m
	mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mmi)


# --- pavement --------------------------------------------------------------

func _build_pavement() -> void:
	var w: float = def.runway_width
	var asphalt := mat("asphalt", Color(0.2, 0.2, 0.21), false, 0.95)
	var taxi := mat("taxi", Color(0.27, 0.27, 0.27), false, 0.95)
	var concrete := mat("concrete", Color(0.62, 0.6, 0.56), false, 0.95)
	var shoulder := mat("shoulder", Color(0.45, 0.42, 0.36), false, 1.0)
	box(Vector3(w + 14.0, 0.2, def.runway_length + 120.0), Vector3(0, Y_RWY - 0.12, 0), shoulder)
	box(Vector3(w, 0.3, def.runway_length), Vector3(0, Y_RWY - 0.15, 0), asphalt)
	add_collider(Vector3(w, 0.3, def.runway_length), Vector3(0, Y_RWY - 0.15, 0), 0.0, LAYER_GROUND)
	var tx: float = AirportDef.TAXIWAY_X
	box(Vector3(23.0, 0.24, def.runway_length - 40.0), Vector3(tx, Y_TAXI - 0.12, 0), taxi)
	var cz: float = def.connector_z()
	for z in [cz, -cz, 0.0]:
		box(Vector3(tx, 0.24, 23.0), Vector3(tx * 0.5, Y_TAXI - 0.12, z), taxi)
	# Apron in front of the terminal, plus a link to the taxiway.
	var apron_x0: float = tx + 11.0
	var apron_x1: float = AirportDef.TERMINAL_X - 6.0
	box(Vector3(apron_x1 - apron_x0, 0.2, 1040.0), Vector3((apron_x0 + apron_x1) * 0.5, Y_APRON - 0.1, 0), concrete)


func _build_runway_markings() -> void:
	var hl: float = def.half_length()
	var w: float = def.runway_width
	# Centerline dashes.
	var z: float = -hl + 90.0
	while z < hl - 90.0:
		paint("white", Vector3(0, Y_PAINT, z), Vector3(0.9, 0.04, 30.0))
		z += 55.0
	# Edge lines.
	for sx in [-1.0, 1.0]:
		paint("white", Vector3(sx * (w * 0.5 - 1.0), Y_PAINT, 0), Vector3(0.9, 0.04, def.runway_length - 10.0))
	# Threshold piano keys + aiming points + touchdown zone, both ends.
	for end in [1.0, -1.0]:
		var tz: float = end * (hl - 20.0)
		for i in range(8):
			var off: float = 3.0 + i * 2.4
			for sx in [-1.0, 1.0]:
				paint("white", Vector3(sx * off, Y_PAINT, tz), Vector3(1.5, 0.04, 30.0))
		var az: float = end * (hl - 300.0)
		for sx in [-1.0, 1.0]:
			paint("white", Vector3(sx * 9.0, Y_PAINT, az), Vector3(6.0, 0.04, 45.0))
		for tdz_off in [150.0, 450.0, 600.0]:
			var tdz: float = end * (hl - tdz_off)
			for sx in [-1.0, 1.0]:
				paint("white", Vector3(sx * 9.0, Y_PAINT, tdz), Vector3(1.8, 0.04, 22.0))
				paint("white", Vector3(sx * 12.0, Y_PAINT, tdz), Vector3(1.8, 0.04, 22.0))
	# Runway designators.
	_runway_number(def.rwy_primary, hl - 75.0, 0.0)
	_runway_number(def.rwy_opposite, -hl + 75.0, PI)


func _runway_number(text: String, z: float, yaw: float) -> void:
	var l := Label3D.new()
	l.text = text
	l.font_size = 200
	l.pixel_size = 0.075
	l.modulate = Color(0.95, 0.95, 0.92)
	l.outline_size = 0
	l.shaded = false
	l.double_sided = false
	l.position = Vector3(0, Y_PAINT + 0.03, z)
	l.rotation = Vector3(-PI * 0.5, yaw, 0)
	add_child(l)


func _build_taxi_markings() -> void:
	var tx: float = AirportDef.TAXIWAY_X
	var hl: float = def.half_length()
	var cz: float = def.connector_z()
	var y := Vector3(0, 0, 0)
	paint_line("yellow", Vector3(tx, 0, -cz), Vector3(tx, 0, cz), 0.5)
	for zc in [cz, -cz, 0.0]:
		paint_line("yellow", Vector3(tx, 0, zc), Vector3(0, 0, zc), 0.5)
	# Lead-in line from the gate to the taxiway (matches the taxi route).
	var pts: Array[Vector3] = [def.to_local(def.gate_pose()["pos"])]
	pts.append_array(def.taxi_points_local())
	for i in range(pts.size() - 1):
		paint_line("yellow", pts[i] + y, pts[i + 1] + y, 0.5)
	# Stop bar at the gate.
	var gate_local: Vector3 = pts[0]
	paint("yellow", Vector3(gate_local.x, Y_PAINT, gate_local.z + 22.0), Vector3(6.0, 0.04, 0.6))
	# Hold lines on every connector: two solid (taxiway side), two dashed.
	var hx: float = AirportDef.HOLD_X
	for zc in [cz, -cz, 0.0]:
		for sx in [0.0, 0.9]:
			paint("yellow", Vector3(hx + 1.0 + sx, Y_PAINT, zc), Vector3(0.35, 0.04, 22.0))
		for dz in range(-5, 6, 2):
			for sx in [-1.2, -2.1]:
				paint("yellow", Vector3(hx + sx, Y_PAINT, zc + dz * 2.0), Vector3(0.35, 0.04, 2.2))
		_hold_sign(Vector3(hx + 4.0, 0, zc + 16.0))


func _hold_sign(pos: Vector3) -> void:
	box(Vector3(0.4, 1.4, 4.0), pos + Vector3(0, 1.2, 0), mat("sign_red", Color(0.72, 0.1, 0.08), true))
	var l := Label3D.new()
	l.text = "%s-%s" % [def.rwy_primary, def.rwy_opposite]
	l.font_size = 96
	l.pixel_size = 0.012
	l.modulate = Color.WHITE
	l.position = pos + Vector3(0.25, 1.2, 0)
	l.rotation.y = PI * 0.5
	add_child(l)


# --- lights ----------------------------------------------------------------

func _build_lights() -> void:
	var hl: float = def.half_length()
	var w: float = def.runway_width
	var z: float = -hl
	while z <= hl:
		for sx in [-1.0, 1.0]:
			light("white", Vector3(sx * (w * 0.5 + 1.5), 0.6, z))
		z += 60.0
	for x in range(-int(w * 0.5), int(w * 0.5) + 1, 4):
		light("green", Vector3(float(x), 0.6, hl + 2.0))
		light("red", Vector3(float(x), 0.6, -hl - 2.0))
	# Approach lighting: centerline bars with a crossbar.
	for i in range(1, 11):
		var az: float = hl + 30.0 * float(i)
		for dx in range(-2, 3):
			light("white", Vector3(dx * 1.6, 0.9, az))
		if i == 5:
			for dx in range(-7, 8):
				light("white", Vector3(dx * 2.2, 0.9, az))
	# Taxiway edge lights.
	var tx: float = AirportDef.TAXIWAY_X
	var tz: float = -def.connector_z()
	while tz <= def.connector_z():
		light("blue", Vector3(tx - 13.0, 0.4, tz))
		light("blue", Vector3(tx + 13.0, 0.4, tz))
		tz += 60.0
	# Stop-bar style amber lights at the hold lines.
	for zc in [def.connector_z(), -def.connector_z(), 0.0]:
		for dz in range(-4, 5, 2):
			light("amber", Vector3(AirportDef.HOLD_X + 2.4, 0.4, zc + dz * 2.5))


func _build_papi() -> void:
	_papi_z = def.half_length() - 300.0
	var base_x: float = -def.runway_width * 0.5 - 15.0
	var housing := mat("papi_housing", Color(0.15, 0.15, 0.15))
	for i in range(4):
		var m := StandardMaterial3D.new()
		m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		m.albedo_color = Color.WHITE
		_papi_mats.append(m)
		var x: float = base_x - float(i) * 9.0
		box(Vector3(2.0, 1.0, 1.0), Vector3(x, 0.6, _papi_z), housing)
		var lens := SphereMesh.new()
		lens.radius = 1.1
		lens.height = 2.2
		lens.radial_segments = 8
		lens.rings = 4
		var mi := MeshInstance3D.new()
		mi.mesh = lens
		mi.material_override = m
		mi.position = Vector3(x, 1.4, _papi_z + 0.6)
		add_child(mi)


## Updates the four PAPI lights for an observer (world position).
## Order is inner (runway side) to outer; on a 3° path: 2 red inner, 2 white outer.
func update_papi(observer: Vector3) -> void:
	var l: Vector3 = def.to_local(observer)
	var dist: float = l.z - _papi_z
	if dist < 20.0 or dist > 15000.0:
		return
	var angle: float = rad_to_deg(atan2(l.y, dist))
	var limits: Array[float] = [3.5, 3.17, 2.83, 2.5]
	for i in range(4):
		var white: bool = angle > limits[i]
		_papi_mats[i].albedo_color = Color(1.0, 0.97, 0.9) if white else Color(1.0, 0.12, 0.08)


func glide_angle(observer: Vector3) -> float:
	var l: Vector3 = def.to_local(observer)
	var dist: float = maxf(l.z - (def.half_length() - 300.0), 1.0)
	return rad_to_deg(atan2(l.y, dist))


# --- buildings -------------------------------------------------------------

func _build_terminal() -> void:
	var x0: float = AirportDef.TERMINAL_X
	var length: float = 420.0
	var depth: float = 60.0
	var h: float = 16.0
	var terracotta := mat("terracotta", def.terminal_color)
	var cream := mat("cream", Color(0.93, 0.87, 0.76))
	var glass := mat("glass", Color(0.1, 0.27, 0.3), false, 0.15)
	var copper := mat("copper", Color(0.72, 0.45, 0.24), false, 0.4)
	var teal := mat("teal", Color(0.06, 0.25, 0.27))
	var cx: float = x0 + depth * 0.5
	box(Vector3(depth, h, length), Vector3(cx, h * 0.5, 0), terracotta, true)
	box(Vector3(depth + 4.0, 1.2, length + 4.0), Vector3(cx, h + 0.6, 0), cream)
	box(Vector3(0.6, 4.0, length - 20.0), Vector3(x0 - 0.3, h - 4.5, 0), glass)
	# Arcade of arches on the apron facade.
	var z: float = -length * 0.5 + 14.0
	while z < length * 0.5 - 10.0:
		box(Vector3(0.8, 7.0, 7.0), Vector3(x0 - 0.2, 3.5, z), teal)
		box(Vector3(1.0, 0.6, 9.0), Vector3(x0 - 0.4, 7.3, z), copper)
		z += 16.0
	# Crenellations along the roofline.
	z = -length * 0.5 + 4.0
	while z < length * 0.5:
		box(Vector3(2.0, 1.6, 2.0), Vector3(x0 + 1.0, h + 2.0, z), cream)
		z += 8.0
	# Central hall with a copper dome.
	box(Vector3(40.0, 24.0, 60.0), Vector3(cx + 4.0, 12.0, 0), terracotta, true)
	var dome := SphereMesh.new()
	dome.radius = 16.0
	dome.height = 20.0
	dome.radial_segments = 16
	dome.rings = 8
	dome.is_hemisphere = true
	var dmi := MeshInstance3D.new()
	dmi.mesh = dome
	dmi.material_override = copper
	dmi.position = Vector3(cx + 4.0, 24.0, 0)
	add_child(dmi)
	# Jet bridges (visual only).
	for jz in [-150.0, -80.0, 60.0]:
		box(Vector3(26.0, 3.2, 3.6), Vector3(x0 - 13.0, 5.0, jz), cream)
		box(Vector3(1.2, 4.6, 1.2), Vector3(x0 - 22.0, 2.3, jz), teal)
	# Airport name on the roof.
	var name_sign := Label3D.new()
	name_sign.text = tr(def.name_key)
	name_sign.font_size = 160
	name_sign.pixel_size = 0.05
	name_sign.modulate = Color(0.95, 0.9, 0.8)
	name_sign.outline_size = 8
	name_sign.outline_modulate = Color(0.06, 0.2, 0.22)
	name_sign.position = Vector3(x0 - 1.0, h + 6.0, -110.0)
	name_sign.rotation.y = -PI * 0.5
	add_child(name_sign)
	# Ground service vehicles near the gate for scale.
	var gse := mat("gse", Color(0.9, 0.62, 0.15))
	box(Vector3(3.0, 2.5, 6.0), Vector3(AirportDef.APRON_X + 50.0, 1.35, -60.0), gse)
	box(Vector3(2.4, 2.0, 4.0), Vector3(AirportDef.APRON_X + 45.0, 1.1, -130.0), gse)


func _build_tower() -> void:
	var pos := Vector3(AirportDef.TERMINAL_X + 40.0, 0, -300.0)
	var cream := mat("cream", Color(0.93, 0.87, 0.76))
	var glass := mat("glass", Color(0.1, 0.27, 0.3), false, 0.15)
	var teal := mat("teal", Color(0.06, 0.25, 0.27))
	var shaft := CylinderMesh.new()
	shaft.top_radius = 3.5
	shaft.bottom_radius = 4.5
	shaft.height = 46.0
	shaft.radial_segments = 12
	var smi := MeshInstance3D.new()
	smi.mesh = shaft
	smi.material_override = cream
	smi.position = pos + Vector3(0, 23.0, 0)
	add_child(smi)
	var cab := CylinderMesh.new()
	cab.top_radius = 8.5
	cab.bottom_radius = 7.0
	cab.height = 6.0
	cab.radial_segments = 12
	var cmi := MeshInstance3D.new()
	cmi.mesh = cab
	cmi.material_override = glass
	cmi.position = pos + Vector3(0, 49.0, 0)
	add_child(cmi)
	var roof := CylinderMesh.new()
	roof.top_radius = 6.0
	roof.bottom_radius = 9.5
	roof.height = 2.0
	roof.radial_segments = 12
	var rmi := MeshInstance3D.new()
	rmi.mesh = roof
	rmi.material_override = teal
	rmi.position = pos + Vector3(0, 53.0, 0)
	add_child(rmi)
	add_collider(Vector3(14.0, 56.0, 14.0), pos + Vector3(0, 28.0, 0), 0.0, LAYER_OBSTACLE)
	var beacon := OmniLight3D.new()
	beacon.light_color = Color(1.0, 0.3, 0.2)
	beacon.omni_range = 30.0
	beacon.light_energy = 2.0
	beacon.position = pos + Vector3(0, 56.0, 0)
	add_child(beacon)


## Hangar origin in airport-local space; the door faces local -X (taxiway).
func hangar_local_origin() -> Vector3:
	return Vector3(AirportDef.APRON_X + 60.0, 0, -700.0)


func _build_hangar() -> void:
	var o: Vector3 = hangar_local_origin()
	var wall := mat("hangar_wall", Color(0.82, 0.78, 0.7))
	var roof := mat("hangar_roof", Color(0.06, 0.25, 0.27))
	var floor_m := mat("hangar_floor", Color(0.55, 0.55, 0.53), false, 0.6)
	var copper := mat("copper", Color(0.72, 0.45, 0.24), false, 0.4)
	var depth: float = 70.0
	var width: float = 84.0
	var h: float = 22.0
	box(Vector3(depth, 0.3, width), o + Vector3(0, Y_APRON + 0.05, 0), floor_m)
	box(Vector3(130.0, 0.2, width + 20.0), o + Vector3(-depth * 0.5 - 65.0, Y_APRON - 0.1, 0), mat("concrete", Color(0.62, 0.6, 0.56)))
	box(Vector3(1.5, h, width), o + Vector3(depth * 0.5, h * 0.5, 0), wall, true)
	for sz in [-1.0, 1.0]:
		box(Vector3(depth, h, 1.5), o + Vector3(0, h * 0.5, sz * width * 0.5), wall, true)
	# Gable roof (two slabs) visible from inside and outside.
	for sz in [-1.0, 1.0]:
		var slab := box(Vector3(depth + 2.0, 1.0, width * 0.54), o + Vector3(0, h + 5.0, sz * width * 0.25), roof)
		slab.rotation = Vector3(sz * deg_to_rad(13.0), 0, 0)
	# Door header with a copper band.
	box(Vector3(1.5, 4.0, width), o + Vector3(-depth * 0.5, h - 2.0, 0), wall)
	box(Vector3(1.7, 0.8, width), o + Vector3(-depth * 0.5, h - 4.2, 0), copper)
	# Interior lights.
	for lz in [-20.0, 20.0]:
		var ol := OmniLight3D.new()
		ol.light_color = Color(1.0, 0.9, 0.75)
		ol.omni_range = 55.0
		ol.light_energy = 1.6
		ol.position = o + Vector3(0, h - 3.0, lz)
		add_child(ol)

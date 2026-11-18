extends Node3D
## Procedural twin-jet: ivory fuselage, midnight-teal tail, copper accents.
## Forward is -Z, origin at the fuselage centre, wheels touch y = -3.15.

const AircraftDef = preload("res://scripts/data/aircraft_def.gd")
const GEAR_HEIGHT: float = 3.15

var gear_root: Node3D
var upgrade_root: Node3D
var _nacelles: Array[MeshInstance3D] = []
var _beacon: MeshInstance3D
var _beacon_mat: StandardMaterial3D
var _t: float = 0.0


func build(def: AircraftDef) -> void:
	for c in get_children():
		c.queue_free()
	_nacelles.clear()
	var body := _mat(def.body_color, 0.45)
	var tail := _mat(def.tail_color, 0.5)
	var accent := _mat(def.accent_color, 0.35, 0.4)
	var dark := _mat(Color(0.06, 0.08, 0.1), 0.2)
	var grey := _mat(Color(0.35, 0.36, 0.38), 0.6)

	# Fuselage.
	var fus := CapsuleMesh.new()
	fus.radius = 2.0
	fus.height = 36.0
	fus.radial_segments = 16
	fus.rings = 6
	_mesh(fus, body, Vector3.ZERO, Vector3(PI * 0.5, 0, 0))
	# Cockpit windows and copper cheatline.
	_box(Vector3(2.6, 0.55, 1.6), Vector3(0, 0.95, -15.2), dark, Vector3(-0.35, 0, 0))
	for sx in [-1.0, 1.0]:
		_box(Vector3(0.05, 0.35, 26.0), Vector3(sx * 1.98, 0.25, -1.0), accent)
		_box(Vector3(0.05, 0.28, 22.0), Vector3(sx * 1.96, 0.85, -2.0), dark)
	# Wings (swept, slight dihedral).
	for sx in [-1.0, 1.0]:
		var w := _box(Vector3(15.0, 0.45, 4.6), Vector3(sx * 9.0, -0.9, 1.0), body)
		w.rotation = Vector3(0, sx * deg_to_rad(-22.0), sx * deg_to_rad(5.0))
		# Copper wingtip edge.
		_box(Vector3(0.6, 0.5, 2.6), Vector3(sx * 16.3, -0.25, 4.0), accent)
	# Tailplane.
	for sx in [-1.0, 1.0]:
		var hs := _box(Vector3(6.0, 0.3, 2.6), Vector3(sx * 3.6, 0.6, 15.4), body)
		hs.rotation = Vector3(0, sx * deg_to_rad(-25.0), sx * deg_to_rad(6.0))
	# Vertical fin in midnight teal with a copper stripe.
	var fin := _box(Vector3(0.45, 6.5, 5.0), Vector3(0, 4.6, 15.2), tail)
	fin.rotation = Vector3(deg_to_rad(-30.0), 0, 0)
	var stripe := _box(Vector3(0.5, 0.7, 4.0), Vector3(0, 4.0, 15.6), accent)
	stripe.rotation = Vector3(deg_to_rad(-30.0), 0, 0)
	_box(Vector3(1.6, 1.0, 5.0), Vector3(0, 1.9, 14.6), tail)
	# Engines under the wings.
	for sx in [-1.0, 1.0]:
		var nac := CylinderMesh.new()
		nac.top_radius = 1.15
		nac.bottom_radius = 1.0
		nac.height = 4.6
		nac.radial_segments = 14
		nac.rings = 1
		var n := _mesh(nac, body, Vector3(sx * 6.2, -1.9, -1.6), Vector3(PI * 0.5, 0, 0))
		_nacelles.append(n)
		var fan := CylinderMesh.new()
		fan.top_radius = 1.0
		fan.bottom_radius = 1.0
		fan.height = 0.1
		fan.radial_segments = 14
		_mesh(fan, dark, Vector3(sx * 6.2, -1.9, -3.92), Vector3(PI * 0.5, 0, 0))
		_box(Vector3(0.35, 1.0, 2.2), Vector3(sx * 6.2, -1.0, -1.0), grey)
	# Navigation lights.
	_light_bulb(Vector3(-16.6, -0.2, 3.8), Color(1, 0.1, 0.1))
	_light_bulb(Vector3(16.6, -0.2, 3.8), Color(0.1, 1, 0.2))
	_light_bulb(Vector3(0, 0.5, 18.2), Color(1, 1, 1))
	_beacon_mat = _mat(Color(1, 0.15, 0.1), 0.5)
	_beacon_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	var bs := SphereMesh.new()
	bs.radius = 0.3
	bs.height = 0.6
	_beacon = _mesh(bs, _beacon_mat, Vector3(0, 2.1, 2.0), Vector3.ZERO)

	# Landing gear.
	gear_root = Node3D.new()
	gear_root.name = "Gear"
	add_child(gear_root)
	for g in [Vector3(-3.0, 0, 2.2), Vector3(3.0, 0, 2.2), Vector3(0, 0, -12.5)]:
		var gp: Vector3 = g
		var strut := CylinderMesh.new()
		strut.top_radius = 0.18
		strut.bottom_radius = 0.18
		strut.height = 1.2
		var sm := MeshInstance3D.new()
		sm.mesh = strut
		sm.material_override = grey
		sm.position = gp + Vector3(0, -2.1, 0)
		gear_root.add_child(sm)
		var wheel := CylinderMesh.new()
		wheel.top_radius = 0.55
		wheel.bottom_radius = 0.55
		wheel.height = 0.5 if gp.x == 0.0 else 0.9
		wheel.radial_segments = 10
		var wm := MeshInstance3D.new()
		wm.mesh = wheel
		wm.material_override = dark
		wm.position = gp + Vector3(0, -GEAR_HEIGHT + 0.55, 0)
		wm.rotation = Vector3(0, 0, PI * 0.5)
		gear_root.add_child(wm)

	# Upgrade visuals (copper intake lips + winglets) — toggled by set_upgrades.
	upgrade_root = Node3D.new()
	upgrade_root.name = "ThrustKit"
	add_child(upgrade_root)
	for sx in [-1.0, 1.0]:
		var lip := TorusMesh.new()
		lip.inner_radius = 0.95
		lip.outer_radius = 1.3
		lip.rings = 16
		lip.ring_segments = 6
		var lm := MeshInstance3D.new()
		lm.mesh = lip
		lm.material_override = accent
		lm.position = Vector3(sx * 6.2, -1.9, -3.95)
		lm.rotation = Vector3(PI * 0.5, 0, 0)
		upgrade_root.add_child(lm)
		var wl := BoxMesh.new()
		wl.size = Vector3(0.3, 2.4, 1.8)
		var wlm := MeshInstance3D.new()
		wlm.mesh = wl
		wlm.material_override = accent
		wlm.position = Vector3(sx * 16.7, 0.9, 4.4)
		wlm.rotation = Vector3(deg_to_rad(-20.0), 0, sx * deg_to_rad(-12.0))
		upgrade_root.add_child(wlm)
	set_upgrades(def.upgrades)


func set_upgrades(list: Array) -> void:
	var kit: bool = list.has("thrust_kit")
	if upgrade_root:
		upgrade_root.visible = kit
	for n in _nacelles:
		n.scale = Vector3(1.08, 1.12, 1.08) if kit else Vector3.ONE


func set_gear(down: bool) -> void:
	if gear_root:
		gear_root.visible = down


func _process(delta: float) -> void:
	_t += delta
	if _beacon:
		_beacon.visible = fmod(_t, 1.2) < 0.15


func _mat(c: Color, rough: float, metal: float = 0.0) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = c
	m.roughness = rough
	m.metallic = metal
	return m


func _mesh(mesh: Mesh, m: Material, pos: Vector3, rot: Vector3) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = m
	mi.position = pos
	mi.rotation = rot
	add_child(mi)
	return mi


func _box(size: Vector3, pos: Vector3, m: Material, rot: Vector3 = Vector3.ZERO) -> MeshInstance3D:
	var bm := BoxMesh.new()
	bm.size = size
	return _mesh(bm, m, pos, rot)


func _light_bulb(pos: Vector3, c: Color) -> void:
	var m := _mat(c, 0.5)
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	var s := SphereMesh.new()
	s.radius = 0.25
	s.height = 0.5
	_mesh(s, m, pos, Vector3.ZERO)

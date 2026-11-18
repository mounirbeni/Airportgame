extends Node3D
## Cheap scenery with MultiMesh: city blocks (white Casablanca, ochre/red
## Marrakech, Fès), palms around airports and fields. One draw call per kind.

const AirportDef = preload("res://scripts/data/airport_def.gd")

var _rng := RandomNumberGenerator.new()


func build(airports: Array, terrain: Node, low_quality: bool) -> void:
	_rng.seed = 20260101
	var density: float = 0.5 if low_quality else 1.0
	_city(Vector3(-3800, 0, -9500), 3200.0, int(700 * density), Color(0.94, 0.93, 0.88), terrain, 10.0, 34.0)
	_city(Vector3(1600, 0, 18200), 2600.0, int(520 * density), Color(0.78, 0.42, 0.3), terrain, 6.0, 16.0)
	_city(Vector3(14500, 0, -9800), 2200.0, int(380 * density), Color(0.86, 0.76, 0.6), terrain, 6.0, 18.0)
	var palms: Array = []
	for a in airports:
		var ap: AirportDef = a
		for i in range(int(90 * density)):
			var lz: float = _rng.randf_range(-ap.half_length(), ap.half_length())
			var lx: float = AirportDef.TERMINAL_X + _rng.randf_range(70.0, 220.0)
			if _rng.randf() < 0.4:
				lx = -_rng.randf_range(120.0, 400.0)
			palms.append(ap.to_world(Vector3(lx, 0, lz)))
	_palms(palms, terrain)


func _city(center: Vector3, radius: float, count: int, color: Color, terrain: Node, hmin: float, hmax: float) -> void:
	var xforms: Array[Transform3D] = []
	for i in range(count):
		var ang: float = _rng.randf() * TAU
		var r: float = sqrt(_rng.randf()) * radius
		var x: float = center.x + cos(ang) * r
		var z: float = center.z + sin(ang) * r
		var gy: float = terrain.height_at(x, z)
		if gy < 0.5:
			continue
		var w: float = _rng.randf_range(14.0, 40.0)
		var d: float = _rng.randf_range(14.0, 40.0)
		var h: float = _rng.randf_range(hmin, hmax) * (1.6 - r / radius)
		var b := Basis(Vector3.UP, _rng.randf() * 0.4) * Basis.from_scale(Vector3(w, h, d))
		xforms.append(Transform3D(b, Vector3(x, gy + h * 0.5 - 1.0, z)))
	var unit := BoxMesh.new()
	unit.size = Vector3.ONE
	var m := StandardMaterial3D.new()
	m.albedo_color = color
	m.roughness = 1.0
	_add(unit, xforms, m, "City")


func _palms(points: Array, terrain: Node) -> void:
	var trunks: Array[Transform3D] = []
	var crowns: Array[Transform3D] = []
	for p in points:
		var pos: Vector3 = p
		var gy: float = terrain.height_at(pos.x, pos.z)
		var h: float = _rng.randf_range(8.0, 14.0)
		trunks.append(Transform3D(Basis.from_scale(Vector3(1.0, h, 1.0)), Vector3(pos.x, gy + h * 0.5, pos.z)))
		crowns.append(Transform3D(Basis(Vector3.UP, _rng.randf() * TAU), Vector3(pos.x, gy + h, pos.z)))
	var trunk := CylinderMesh.new()
	trunk.top_radius = 0.25
	trunk.bottom_radius = 0.4
	trunk.height = 1.0
	trunk.radial_segments = 5
	trunk.rings = 1
	var tm := StandardMaterial3D.new()
	tm.albedo_color = Color(0.45, 0.33, 0.22)
	_add(trunk, trunks, tm, "PalmTrunks")
	var crown := CylinderMesh.new()
	crown.top_radius = 0.2
	crown.bottom_radius = 4.5
	crown.height = 2.4
	crown.radial_segments = 6
	crown.rings = 1
	var cm := StandardMaterial3D.new()
	cm.albedo_color = Color(0.28, 0.42, 0.22)
	_add(crown, crowns, cm, "PalmCrowns")


func _add(mesh: Mesh, xforms: Array[Transform3D], m: Material, node_name: String) -> void:
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

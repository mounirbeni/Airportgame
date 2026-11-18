extends Node3D
## Procedural terrain: Atlantic coast, rolling plains, the Atlas foothills
## south of Marrakech and Middle Atlas hills near Fès. Airports are flattened.
## height_at() is the analytic ground used for aircraft contact; the visual
## mesh samples the same function.

const AirportDef = preload("res://scripts/data/airport_def.gd")

const SIZE: float = 52000.0
const CENTER: Vector2 = Vector2(6000.0, 3000.0)
const WATER_Y: float = -3.0

var resolution: int = 200
var _base := FastNoiseLite.new()
var _detail := FastNoiseLite.new()
var _ridge := FastNoiseLite.new()
var _flats: Array = []


func setup(airports: Array, low_quality: bool) -> void:
	resolution = 140 if low_quality else 200
	_base.seed = 1977
	_base.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	_base.frequency = 0.00022
	_base.fractal_octaves = 3
	_detail.seed = 4242
	_detail.frequency = 0.0011
	_detail.fractal_octaves = 2
	_ridge.seed = 9001
	_ridge.frequency = 0.00035
	_ridge.fractal_type = FastNoiseLite.FRACTAL_RIDGED
	_ridge.fractal_octaves = 4
	for a in airports:
		var ap: AirportDef = a
		_flats.append({
			"inv": ap.get_transform().affine_inverse(),
			"hz": ap.half_length() + 900.0,
		})
	_build_mesh()
	_build_water()


func coast_distance(x: float, z: float) -> float:
	# Positive inland (east of the coast line), negative over the Atlantic.
	var coast_x: float = -9000.0 + 0.45 * (-z) + _base.get_noise_2d(z * 0.5, 100.0) * 1500.0
	return x - coast_x


func raw_height(x: float, z: float) -> float:
	var h: float = 22.0 + _base.get_noise_2d(x, z) * 32.0 + _detail.get_noise_2d(x, z) * 7.0
	h = maxf(h, 3.0)
	var ridge: float = (_ridge.get_noise_2d(x, z) + 1.0) * 0.5
	# High Atlas foothills, south of Marrakech.
	var atlas: float = smoothstep(16500.0, 27500.0, z)
	h += atlas * (250.0 + 2100.0 * atlas) * (0.45 + 0.55 * ridge)
	# Middle Atlas hills south-east of Fès.
	var dx: float = (x - 20000.0) / 7000.0
	var dz: float = (z + 2500.0) / 6000.0
	var ma: float = exp(-(dx * dx + dz * dz))
	h += ma * 750.0 * (0.5 + 0.5 * ridge)
	# Atlantic.
	var cd: float = coast_distance(x, z)
	h = lerpf(-45.0, h, smoothstep(-2200.0, 250.0, cd))
	return h


func height_at(x: float, z: float) -> float:
	var h: float = raw_height(x, z)
	for f in _flats:
		var inv: Transform3D = f["inv"]
		var hz: float = f["hz"]
		var l: Vector3 = inv * Vector3(x, 0.0, z)
		var ddx: float = maxf(absf(l.x - 150.0) - 1100.0, 0.0)
		var ddz: float = maxf(absf(l.z) - hz, 0.0)
		var dist: float = sqrt(ddx * ddx + ddz * ddz)
		h = lerpf(0.0, h, smoothstep(0.0, 1500.0, dist))
	return h


func _color_for(h: float, x: float, z: float) -> Color:
	var n: float = _detail.get_noise_2d(x * 1.7, z * 1.7)
	var ochre := Color(0.78, 0.6, 0.4)
	var green := Color(0.47, 0.53, 0.31)
	var red := Color(0.64, 0.36, 0.25)
	var rock := Color(0.55, 0.49, 0.45)
	var snow := Color(0.95, 0.94, 0.92)
	var sand := Color(0.86, 0.77, 0.6)
	var c: Color = ochre.lerp(green, clampf(n * 1.6 + 0.2, 0.0, 0.8))
	if h < 4.0:
		c = c.lerp(sand, 0.6)
	if h > 90.0:
		c = c.lerp(red, clampf((h - 90.0) / 400.0, 0.0, 1.0))
	if h > 700.0:
		c = c.lerp(rock, clampf((h - 700.0) / 700.0, 0.0, 1.0))
	if h > 1650.0 + n * 150.0:
		c = c.lerp(snow, clampf((h - 1650.0) / 250.0, 0.0, 1.0))
	if h < -1.0:
		c = sand.darkened(0.3)
	return c


func _build_mesh() -> void:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var n: int = resolution
	var step: float = SIZE / float(n)
	var x0: float = CENTER.x - SIZE * 0.5
	var z0: float = CENTER.y - SIZE * 0.5
	for iz in range(n + 1):
		for ix in range(n + 1):
			var x: float = x0 + ix * step
			var z: float = z0 + iz * step
			var h: float = height_at(x, z)
			st.set_color(_color_for(h, x, z))
			st.add_vertex(Vector3(x, h, z))
	for iz in range(n):
		for ix in range(n):
			var i: int = iz * (n + 1) + ix
			st.add_index(i)
			st.add_index(i + 1)
			st.add_index(i + n + 1)
			st.add_index(i + 1)
			st.add_index(i + n + 2)
			st.add_index(i + n + 1)
	st.generate_normals()
	var mesh: ArrayMesh = st.commit()
	var mat := StandardMaterial3D.new()
	mat.vertex_color_use_as_albedo = true
	mat.roughness = 1.0
	mat.specular_mode = BaseMaterial3D.SPECULAR_DISABLED
	var mi := MeshInstance3D.new()
	mi.name = "TerrainMesh"
	mi.mesh = mesh
	mi.material_override = mat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)


func _build_water() -> void:
	var pm := PlaneMesh.new()
	pm.size = Vector2(SIZE * 1.6, SIZE * 1.6)
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.12, 0.33, 0.4)
	mat.roughness = 0.25
	mat.metallic_specular = 0.7
	var mi := MeshInstance3D.new()
	mi.name = "Atlantic"
	mi.mesh = pm
	mi.material_override = mat
	mi.position = Vector3(CENTER.x, WATER_Y, CENTER.y)
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)

extends Node3D
## World-space navigation cue: an air ring (en route / approach) or a flat
## ground ring (taxi), with an optional short billboard label.

var _ring: MeshInstance3D
var _label: Label3D
var _mat: StandardMaterial3D
var _t: float = 0.0
var ground: bool = false


func setup(is_ground: bool, radius: float, color: Color, text: String, face_dir: Vector3) -> void:
	ground = is_ground
	var torus := TorusMesh.new()
	torus.inner_radius = radius * (0.9 if is_ground else 0.88)
	torus.outer_radius = radius
	torus.rings = 32
	torus.ring_segments = 6
	_mat = StandardMaterial3D.new()
	_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_mat.albedo_color = color
	_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_ring = MeshInstance3D.new()
	_ring.mesh = torus
	_ring.material_override = _mat
	_ring.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(_ring)
	if is_ground:
		_ring.position.y = 0.35
	else:
		# Torus lies in XZ; stand it up facing the travel direction.
		var d: Vector3 = face_dir.normalized() if face_dir.length() > 0.01 else Vector3.FORWARD
		_ring.basis = Basis.looking_at(d, Vector3.UP) * Basis(Vector3.RIGHT, PI * 0.5)
	if text != "":
		_label = Label3D.new()
		_label.text = text
		_label.font_size = 64
		_label.pixel_size = 0.04 if is_ground else 0.25
		_label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		_label.modulate = Color(1.0, 0.96, 0.88)
		_label.outline_size = 12
		_label.outline_modulate = Color(0.05, 0.18, 0.2)
		_label.no_depth_test = true
		_label.position = Vector3(0, 9.0 if is_ground else radius + 25.0, 0)
		add_child(_label)


func set_text(text: String) -> void:
	if _label:
		_label.text = text


func _process(delta: float) -> void:
	_t += delta
	if _mat:
		_mat.albedo_color.a = 0.65 + 0.3 * sin(_t * 4.0)

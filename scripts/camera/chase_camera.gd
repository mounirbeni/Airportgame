extends Camera3D
## Smoothed chase camera with three modes: chase, wide chase, nose view.

var target: Node3D
var mode: int = 0
const MODES: Array[Vector2] = [Vector2(42.0, 11.0), Vector2(80.0, 22.0), Vector2(-20.0, 2.6)]

var _vel_dir: Vector3 = Vector3.FORWARD


func _ready() -> void:
	near = 0.5
	far = 45000.0
	fov = 62.0


func set_mode(m: int) -> void:
	mode = posmod(m, MODES.size())
	snap()


func cycle() -> int:
	set_mode(mode + 1)
	return mode


func snap() -> void:
	if target == null:
		return
	global_transform = _desired()


func _desired() -> Transform3D:
	var tb: Basis = target.global_transform.basis
	var fwd: Vector3 = -tb.z
	var flat := Vector3(fwd.x, 0.0, fwd.z)
	if flat.length() < 0.01:
		flat = Vector3.FORWARD
	flat = flat.normalized()
	var cfg: Vector2 = MODES[mode]
	var tpos: Vector3 = target.global_position
	if mode == 2:
		var p: Vector3 = tpos + fwd * 18.5 + tb.y * cfg.y
		return Transform3D(tb, p)
	var pos: Vector3 = tpos - flat * cfg.x + Vector3.UP * cfg.y
	var look: Vector3 = tpos + flat * 30.0 + Vector3.UP * 2.0
	return Transform3D(Basis.looking_at(look - pos, Vector3.UP), pos)


func _process(delta: float) -> void:
	if target == null or not current:
		return
	var want: Transform3D = _desired()
	if mode == 2:
		global_transform = want
		return
	var k: float = 1.0 - exp(-6.0 * delta)
	var pos: Vector3 = global_position.lerp(want.origin, k)
	var tb: Basis = target.global_transform.basis
	var tpos: Vector3 = target.global_position
	var look: Vector3 = tpos + (-tb.z) * 30.0 + Vector3.UP * 2.0
	# Follow a fraction of the aircraft roll for a sense of banking.
	var roll_up: Vector3 = Vector3.UP.lerp(tb.y, 0.3).normalized()
	global_transform = Transform3D(Basis.looking_at(look - pos, roll_up), pos)

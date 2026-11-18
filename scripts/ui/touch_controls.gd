extends Control
## Landscape multitouch controls: pitch/roll stick (right), persistent throttle
## slider + brake hold (left), small camera and pause buttons (top right).
## Each control tracks its own touch index, so steering while moving the
## throttle or holding the brake works. Everything drives FlightInput /
## InputMap actions, the same ones the keyboard uses.

signal camera_pressed
signal pause_pressed

const STICK_RADIUS: float = 110.0
const DEADZONE: float = 0.06

var safe: Rect2 = Rect2()          # safe area in this control's coordinates
var _stick_idx: int = -1
var _thr_idx: int = -1
var _brake_idx: int = -1
var _stick_vec: Vector2 = Vector2.ZERO
var _font: Font


func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	layout_direction = Control.LAYOUT_DIRECTION_LTR
	process_mode = Node.PROCESS_MODE_ALWAYS
	_font = ThemeDB.fallback_font
	FlightInput.inputs_released.connect(_reset_state)
	visibility_changed.connect(_on_visibility_changed)


func _area() -> Rect2:
	return safe if safe.size.x > 10.0 else Rect2(Vector2.ZERO, size)


func _stick_center() -> Vector2:
	var a: Rect2 = _area()
	return Vector2(a.end.x - STICK_RADIUS - 60.0, a.end.y - STICK_RADIUS - 50.0)


func _throttle_rect() -> Rect2:
	var a: Rect2 = _area()
	return Rect2(a.position.x + 36.0, a.position.y + a.size.y * 0.28, 74.0, a.size.y * 0.58)


func _brake_center() -> Vector2:
	var a: Rect2 = _area()
	return Vector2(a.position.x + 190.0, a.end.y - 95.0)


func _cam_center() -> Vector2:
	var a: Rect2 = _area()
	return Vector2(a.end.x - 50.0, a.position.y + 50.0)


func _pause_center() -> Vector2:
	var a: Rect2 = _area()
	return Vector2(a.end.x - 125.0, a.position.y + 50.0)


func _input(event: InputEvent) -> void:
	if not is_visible_in_tree() or get_tree().paused:
		return
	if event is InputEventScreenTouch:
		var t := event as InputEventScreenTouch
		if t.pressed and not t.canceled:
			if _touch_down(t.index, t.position):
				get_viewport().set_input_as_handled()
		else:
			_touch_up(t.index)
	elif event is InputEventScreenDrag:
		var d := event as InputEventScreenDrag
		_touch_move(d.index, d.position)


func _touch_down(idx: int, p: Vector2) -> bool:
	if p.distance_to(_cam_center()) < 40.0:
		camera_pressed.emit()
		return true
	if p.distance_to(_pause_center()) < 40.0:
		pause_pressed.emit()
		return true
	if p.distance_to(_brake_center()) < 62.0 and _brake_idx == -1:
		_brake_idx = idx
		Input.action_press(&"brake")
		return true
	if _throttle_rect().grow(30.0).has_point(p) and _thr_idx == -1:
		_thr_idx = idx
		_set_throttle_from(p)
		return true
	var a: Rect2 = _area()
	if p.x > a.position.x + a.size.x * 0.5 and p.y > a.position.y + a.size.y * 0.25 and _stick_idx == -1:
		_stick_idx = idx
		_update_stick(p)
		return true
	return false


func _touch_move(idx: int, p: Vector2) -> void:
	if idx == _stick_idx:
		_update_stick(p)
	elif idx == _thr_idx:
		_set_throttle_from(p)


func _touch_up(idx: int) -> void:
	if idx == _stick_idx:
		_stick_idx = -1
		_stick_vec = Vector2.ZERO
		_apply_stick()
	if idx == _thr_idx:
		_thr_idx = -1
	if idx == _brake_idx:
		_brake_idx = -1
		Input.action_release(&"brake")


func _set_throttle_from(p: Vector2) -> void:
	var r: Rect2 = _throttle_rect()
	FlightInput.set_throttle(clampf((r.end.y - p.y) / r.size.y, 0.0, 1.0))


func _update_stick(p: Vector2) -> void:
	var v: Vector2 = (p - _stick_center()) / STICK_RADIUS
	if v.length() > 1.0:
		v = v.normalized()
	_stick_vec = v
	_apply_stick()


func _apply_stick() -> void:
	# Drag down = pull back = nose up. Slight expo for fine control.
	var x: float = signf(_stick_vec.x) * pow(absf(_stick_vec.x), 1.4)
	var y: float = signf(_stick_vec.y) * pow(absf(_stick_vec.y), 1.4)
	_axis(&"roll_right", &"roll_left", x)
	_axis(&"pitch_up", &"pitch_down", y)


func _axis(pos_action: StringName, neg_action: StringName, v: float) -> void:
	if v > DEADZONE:
		Input.action_press(pos_action, v)
		Input.action_release(neg_action)
	elif v < -DEADZONE:
		Input.action_press(neg_action, -v)
		Input.action_release(pos_action)
	else:
		Input.action_release(pos_action)
		Input.action_release(neg_action)


func _reset_state() -> void:
	_stick_idx = -1
	_thr_idx = -1
	_brake_idx = -1
	_stick_vec = Vector2.ZERO
	queue_redraw()


func release_all() -> void:
	var had_stick: bool = _stick_idx != -1 or _stick_vec != Vector2.ZERO
	_stick_vec = Vector2.ZERO
	if had_stick:
		_apply_stick()
	if _brake_idx != -1:
		Input.action_release(&"brake")
	_reset_state()


func _on_visibility_changed() -> void:
	if not visible:
		release_all()


func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT or what == NOTIFICATION_WM_WINDOW_FOCUS_OUT:
		release_all()


func _process(_delta: float) -> void:
	if visible:
		queue_redraw()


func _draw() -> void:
	var ink := Color(0.98, 0.95, 0.88, 0.85)
	var faint := Color(0.05, 0.16, 0.18, 0.35)
	var copper := Color(0.86, 0.52, 0.27, 0.9)
	# Stick.
	var sc: Vector2 = _stick_center()
	draw_circle(sc, STICK_RADIUS, faint)
	draw_arc(sc, STICK_RADIUS, 0.0, TAU, 48, ink, 2.0, true)
	draw_line(sc + Vector2(-STICK_RADIUS * 0.3, 0), sc + Vector2(STICK_RADIUS * 0.3, 0), Color(ink, 0.3), 1.5)
	draw_line(sc + Vector2(0, -STICK_RADIUS * 0.3), sc + Vector2(0, STICK_RADIUS * 0.3), Color(ink, 0.3), 1.5)
	draw_circle(sc + _stick_vec * STICK_RADIUS, 38.0, Color(ink, 0.75 if _stick_idx != -1 else 0.45))
	# Throttle.
	var r: Rect2 = _throttle_rect()
	draw_rect(r, faint, true)
	draw_rect(r, ink, false, 2.0)
	var thr: float = FlightInput.throttle
	var fill := Rect2(r.position.x, r.end.y - r.size.y * thr, r.size.x, r.size.y * thr)
	draw_rect(fill, Color(copper, 0.55), true)
	var hy: float = r.end.y - r.size.y * thr
	draw_rect(Rect2(r.position.x - 8.0, hy - 9.0, r.size.x + 16.0, 18.0), ink, true)
	_label(Vector2(r.get_center().x, r.position.y - 14.0), Loc.t("ui_thr") + " %d%%" % int(round(thr * 100.0)), 20)
	# Brake.
	var bc: Vector2 = _brake_center()
	var pressed: bool = Input.is_action_pressed(&"brake")
	draw_circle(bc, 58.0, Color(0.7, 0.16, 0.12, 0.75) if pressed else faint)
	draw_arc(bc, 58.0, 0.0, TAU, 40, ink, 2.0, true)
	_label(bc + Vector2(0, 7), Loc.t("ui_brake"), 20)
	# Camera + pause.
	for c in [_cam_center(), _pause_center()]:
		var cc: Vector2 = c
		draw_circle(cc, 32.0, faint)
		draw_arc(cc, 32.0, 0.0, TAU, 32, ink, 2.0, true)
	_label(_cam_center() + Vector2(0, 6), Loc.t("ui_cam"), 15)
	_label(_pause_center() + Vector2(0, 7), Loc.t("ui_pause_btn"), 20)


func _label(center: Vector2, text: String, fsize: int) -> void:
	var w: float = _font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, fsize).x
	draw_string(_font, center - Vector2(w * 0.5, 0), text, HORIZONTAL_ALIGNMENT_LEFT, -1, fsize, Color(0.98, 0.95, 0.88))

extends Control
## Restrained flight HUD: compact instrument strip, objective line, transient
## advice and toasts, stall warning, optional guidance arrow and glide-slope
## indicator on final approach.

const Aircraft = preload("res://scripts/aircraft/aircraft_controller.gd")
const Mission = preload("res://scripts/mission/mission_controller.gd")

var aircraft: Aircraft
var mission: Mission
var camera: Camera3D
var guidance: bool = true
var safe: Rect2 = Rect2()

var _inst: Label
var _objective: Label
var _objective_panel: PanelContainer
var _hint: Label
var _toast: Label
var _stall: Label
var _help: Label
var _hint_t: float = 0.0
var _toast_t: float = 0.0
var _blink: float = 0.0
var _font: Font


func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_font = ThemeDB.fallback_font
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.04, 0.14, 0.16, 0.62)
	sb.set_corner_radius_all(10)
	sb.content_margin_left = 16
	sb.content_margin_right = 16
	sb.content_margin_top = 6
	sb.content_margin_bottom = 6
	_objective_panel = PanelContainer.new()
	_objective_panel.add_theme_stylebox_override("panel", sb)
	_objective_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_objective_panel)
	_objective = _make_label(24, Color(1, 0.96, 0.88))
	_objective_panel.add_child(_objective)
	_inst = _make_label(20, Color(0.98, 0.95, 0.88))
	_inst.add_theme_stylebox_override("normal", sb)
	add_child(_inst)
	_hint = _make_label(21, Color(1.0, 0.82, 0.55))
	add_child(_hint)
	_toast = _make_label(34, Color(1, 0.97, 0.9))
	add_child(_toast)
	_stall = _make_label(40, Color(1.0, 0.25, 0.2))
	add_child(_stall)
	_help = _make_label(15, Color(1, 1, 1, 0.7))
	add_child(_help)


func _make_label(fsize: int, color: Color) -> Label:
	var l := Label.new()
	l.add_theme_font_size_override("font_size", fsize)
	l.add_theme_color_override("font_color", color)
	l.add_theme_color_override("font_outline_color", Color(0.03, 0.1, 0.12, 0.9))
	l.add_theme_constant_override("outline_size", 6)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l


func set_objective(text: String) -> void:
	_objective.text = text
	_objective_panel.visible = text != ""


func show_hint(text: String) -> void:
	_hint.text = text
	_hint_t = 4.5


func show_toast(text: String) -> void:
	_toast.text = text
	_toast_t = 2.2


func clear_messages() -> void:
	_hint_t = 0.0
	_toast_t = 0.0
	_hint.text = ""
	_toast.text = ""


func _area() -> Rect2:
	return safe if safe.size.x > 10.0 else Rect2(Vector2.ZERO, size)


func _process(delta: float) -> void:
	if aircraft == null or not visible:
		return
	var a: Rect2 = _area()
	_blink += delta
	_hint_t = maxf(_hint_t - delta, 0.0)
	_toast_t = maxf(_toast_t - delta, 0.0)
	_hint.visible = _hint_t > 0.0
	_toast.visible = _toast_t > 0.0
	_toast.modulate.a = clampf(_toast_t * 2.0, 0.0, 1.0)
	var kt: int = int(round(aircraft.airspeed * 1.94384))
	var alt_ft: int = int(round((aircraft.position.y - Aircraft.GEAR_H) * 3.28084))
	var vs: int = int(round(aircraft.velocity.y * 196.85 / 10.0)) * 10
	var thr: int = int(round(aircraft.throttle * 100.0))
	_inst.text = "%s %d %s   %s %s %s   %s %+d   %s %03d°   %s %d%%" % [
		tr("hud_spd"), kt, tr("hud_kt"), tr("hud_alt"), Loc.group_digits(alt_ft), tr("hud_ft"),
		tr("hud_vs"), vs, tr("hud_hdg"), int(round(aircraft.heading_deg())) % 360, tr("hud_thr"), thr]
	_inst.text_direction = Control.TEXT_DIRECTION_LTR if not Loc.is_rtl() else Control.TEXT_DIRECTION_RTL
	_inst.size = Vector2.ZERO
	_inst.position = Vector2(a.position.x + 12.0, a.position.y + 10.0)
	_objective_panel.size = Vector2.ZERO
	_objective_panel.custom_minimum_size = Vector2(minf(a.size.x * 0.55, 720.0), 0)
	_objective.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_objective_panel.position = Vector2(a.get_center().x - _objective_panel.size.x * 0.5, a.position.y + 62.0)
	_layout_center(_hint, a.position.y + 132.0, a)
	_layout_center(_toast, a.position.y + a.size.y * 0.36, a)
	_stall.text = tr("hud_stall")
	_stall.visible = aircraft.stall_warning and fmod(_blink, 0.6) < 0.4
	_layout_center(_stall, a.position.y + a.size.y * 0.46, a)
	_help.visible = not DisplayServer.is_touchscreen_available()
	_help.text = tr("help_keys")
	_layout_center(_help, a.end.y - 26.0, a)
	queue_redraw()


func _layout_center(l: Label, y: float, a: Rect2) -> void:
	l.size = Vector2.ZERO
	l.position = Vector2(a.get_center().x - l.size.x * 0.5, y)


func _draw() -> void:
	if aircraft == null or mission == null or camera == null:
		return
	if not guidance:
		return
	var st: int = mission.stage
	if st == Mission.Stage.IDLE or st == Mission.Stage.DONE or st == Mission.Stage.FAILED or st == Mission.Stage.ROLLOUT:
		return
	var target: Vector3 = mission.target_point()
	var dist_km: float = aircraft.global_position.distance_to(target) / 1000.0
	var a: Rect2 = _area()
	var copper := Color(0.95, 0.6, 0.3, 0.95)
	var behind: bool = camera.is_position_behind(target)
	var sp: Vector2 = camera.unproject_position(target)
	var inner: Rect2 = a.grow(-70.0)
	if not behind and inner.has_point(sp):
		var s: float = 14.0
		var pts := PackedVector2Array([sp + Vector2(0, -s), sp + Vector2(s, 0), sp + Vector2(0, s), sp + Vector2(-s, 0), sp + Vector2(0, -s)])
		draw_polyline(pts, copper, 3.0, true)
		_text(sp + Vector2(0, 34.0), Loc.t("hud_dist", {"d": "%.1f" % dist_km}), copper)
	else:
		var c: Vector2 = a.get_center()
		var dir: Vector2 = (sp - c)
		if behind:
			dir = -dir
		if dir.length() < 1.0:
			dir = Vector2.DOWN
		dir = dir.normalized()
		var t: float = minf(absf((inner.size.x * 0.5) / maxf(absf(dir.x), 0.001)), absf((inner.size.y * 0.5) / maxf(absf(dir.y), 0.001)))
		var tip: Vector2 = c + dir * t
		var side: Vector2 = Vector2(-dir.y, dir.x)
		draw_colored_polygon(PackedVector2Array([tip, tip - dir * 30.0 + side * 16.0, tip - dir * 30.0 - side * 16.0]), copper)
		_text(tip - dir * 52.0, Loc.t("hud_dist", {"d": "%.1f" % dist_km}), copper)
	# Glide slope indicator on final.
	if mission.is_on_final():
		var dev: float = clampf((mission.glide_angle() - 3.0) / 1.0, -1.0, 1.0)
		var x: float = a.end.x - 300.0
		var y0: float = a.position.y + a.size.y * 0.3
		var h: float = 160.0
		draw_line(Vector2(x, y0), Vector2(x, y0 + h), Color(1, 1, 1, 0.6), 2.0)
		for i in range(5):
			draw_circle(Vector2(x, y0 + h * float(i) / 4.0), 4.0, Color(1, 1, 1, 0.6))
		# Diamond below centre = aircraft high (fly down to it).
		var dy: float = y0 + h * 0.5 + dev * h * 0.5
		var d: float = 10.0
		draw_colored_polygon(PackedVector2Array([Vector2(x, dy - d), Vector2(x + d, dy), Vector2(x, dy + d), Vector2(x - d, dy)]), Color(0.3, 0.95, 0.85))
		_text(Vector2(x, y0 - 12.0), "G/S", Color(1, 1, 1, 0.8))


func _text(center: Vector2, s: String, c: Color) -> void:
	var fs: int = 18
	var w: float = _font.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
	draw_string_outline(_font, center - Vector2(w * 0.5, 0), s, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, 5, Color(0.03, 0.1, 0.12, 0.9))
	draw_string(_font, center - Vector2(w * 0.5, 0), s, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, c)

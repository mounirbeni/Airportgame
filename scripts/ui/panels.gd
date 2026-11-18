extends Control
## Menu panels (2D): top bar, contract board at the gate, results, failure,
## pause and hangar. Arabic-first with RTL layout; English optional.
## Panels only emit intents; main.gd owns the game flow.

const ContractDef = preload("res://scripts/data/contract_def.gd")
const AircraftDef = preload("res://scripts/data/aircraft_def.gd")

signal accept_requested(contract_id: String)
signal resume_requested
signal cancel_run_requested
signal hangar_requested
signal hangar_closed
signal buy_requested(upgrade_id: String)
signal results_closed
signal retry_approach_requested
signal restart_requested
signal to_gate_requested
signal unpause_requested
signal language_toggled
signal quality_toggled
signal guidance_toggled

const C_BG := Color(0.04, 0.15, 0.17, 0.9)
const C_CARD := Color(0.98, 0.95, 0.88, 0.07)
const C_INK := Color(0.98, 0.95, 0.88)
const C_DIM := Color(0.8, 0.78, 0.72)
const C_COPPER := Color(0.88, 0.55, 0.3)
const C_GOOD := Color(0.45, 0.9, 0.7)
const C_BAD := Color(1.0, 0.45, 0.35)

var safe: Rect2 = Rect2()
var current: String = ""        # which panel is open
var _root: MarginContainer
var _top: HBoxContainer
var _content: Control
var _last_args: Dictionary = {}


func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	process_mode = Node.PROCESS_MODE_ALWAYS
	var th := Theme.new()
	th.default_font_size = 22
	theme = th
	_root = MarginContainer.new()
	_root.set_anchors_preset(Control.PRESET_FULL_RECT)
	_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_root)
	var v := VBoxContainer.new()
	v.mouse_filter = Control.MOUSE_FILTER_IGNORE
	v.add_theme_constant_override("separation", 10)
	_root.add_child(v)
	_top = HBoxContainer.new()
	_top.add_theme_constant_override("separation", 10)
	v.add_child(_top)
	_content = Control.new()
	_content.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_content.mouse_filter = Control.MOUSE_FILTER_IGNORE
	v.add_child(_content)
	apply_safe_area(Rect2())


func apply_safe_area(r: Rect2) -> void:
	safe = r
	var vp: Vector2 = get_viewport_rect().size
	var left: float = 16.0
	var top: float = 12.0
	var right: float = 16.0
	var bottom: float = 12.0
	if r.size.x > 10.0:
		left = maxf(left, r.position.x)
		top = maxf(top, r.position.y)
		right = maxf(right, vp.x - r.end.x)
		bottom = maxf(bottom, vp.y - r.end.y)
	_root.add_theme_constant_override("margin_left", int(left))
	_root.add_theme_constant_override("margin_top", int(top))
	_root.add_theme_constant_override("margin_right", int(right))
	_root.add_theme_constant_override("margin_bottom", int(bottom))


func apply_direction() -> void:
	layout_direction = Control.LAYOUT_DIRECTION_RTL if Loc.is_rtl() else Control.LAYOUT_DIRECTION_LTR


# --- building blocks -------------------------------------------------------------

func _style(color: Color, radius: int = 14, pad: int = 18) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = color
	sb.set_corner_radius_all(radius)
	sb.content_margin_left = pad
	sb.content_margin_right = pad
	sb.content_margin_top = pad * 0.7
	sb.content_margin_bottom = pad * 0.7
	return sb


func _label(text: String, fsize: int = 22, color: Color = C_INK, wrap: bool = false) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", fsize)
	l.add_theme_color_override("font_color", color)
	if wrap:
		l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		l.custom_minimum_size.x = 200
	return l


func _button(text: String, cb: Callable, primary: bool = false, enabled: bool = true) -> Button:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = Vector2(150, 54)
	b.disabled = not enabled
	b.focus_mode = Control.FOCUS_NONE
	var base: Color = C_COPPER if primary else Color(0.12, 0.36, 0.38)
	b.add_theme_stylebox_override("normal", _style(base, 12, 14))
	b.add_theme_stylebox_override("hover", _style(base.lightened(0.12), 12, 14))
	b.add_theme_stylebox_override("pressed", _style(base.darkened(0.15), 12, 14))
	b.add_theme_stylebox_override("disabled", _style(Color(0.3, 0.32, 0.32, 0.7), 12, 14))
	b.add_theme_color_override("font_color", C_INK)
	b.add_theme_color_override("font_disabled_color", Color(0.75, 0.75, 0.72))
	b.add_theme_font_size_override("font_size", 22)
	b.pressed.connect(cb)
	return b


## A centred (or side-anchored) scrollable panel inside the content area.
func _panel(width: float, anchor: String = "center") -> VBoxContainer:
	var pc := PanelContainer.new()
	pc.add_theme_stylebox_override("panel", _style(C_BG, 18, 22))
	_content.add_child(pc)
	var area: Vector2 = _content.size
	if area.x < 10.0:
		area = get_viewport_rect().size - Vector2(40, 90)
	var w: float = minf(width, area.x)
	var h: float = area.y
	pc.size = Vector2(w, h)
	var x: float = (area.x - w) * 0.5
	if anchor == "side":
		x = area.x - w if not Loc.is_rtl() else 0.0
	pc.position = Vector2(x, 0)
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	pc.add_child(scroll)
	var v := VBoxContainer.new()
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	v.add_theme_constant_override("separation", 12)
	scroll.add_child(v)
	return v


func _clear() -> void:
	for c in _content.get_children():
		c.queue_free()
	for c in _top.get_children():
		c.queue_free()


func hide_all() -> void:
	current = ""
	_clear()
	visible = false


func _open(name_id: String, args: Dictionary) -> void:
	current = name_id
	_last_args = args
	_clear()
	apply_direction()
	visible = true


## Rebuild the open panel (e.g. after a language or money change).
func refresh() -> void:
	match current:
		"board":
			show_board()
		"hangar":
			show_hangar()
		"results":
			show_results(_last_args)
		"failed":
			show_failed(_last_args)
		"pause":
			show_pause(_last_args)


func _build_top_bar() -> void:
	_top.add_child(_label(tr("app_title"), 26, C_COPPER))
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_top.add_child(spacer)
	_top.add_child(_label(tr("ui_balance") + ": " + Loc.money(GameState.money), 24))
	_top.add_child(_settings_buttons())


func _settings_buttons() -> HBoxContainer:
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", 8)
	var q: String = tr("q_low") if str(GameState.get_setting("quality", "high")) == "low" else tr("q_high")
	var g: String = tr("ui_on") if bool(GameState.get_setting("guidance", true)) else tr("ui_off")
	h.add_child(_button(tr("ui_lang_toggle"), func() -> void: language_toggled.emit()))
	h.add_child(_button(Loc.t("ui_quality", {"v": q}), func() -> void: quality_toggled.emit()))
	h.add_child(_button(Loc.t("ui_guidance", {"v": g}), func() -> void: guidance_toggled.emit()))
	return h


# --- panels ------------------------------------------------------------------------

func show_board() -> void:
	_open("board", {})
	_build_top_bar()
	var v: VBoxContainer = _panel(560.0, "side")
	v.add_child(_label(tr("ui_contracts"), 30, C_COPPER))
	for c in DataDB.contracts:
		v.add_child(_contract_card(c))
	v.add_child(_button(tr("ui_hangar"), func() -> void: hangar_requested.emit()))


func _contract_card(c: ContractDef) -> Control:
	var pc := PanelContainer.new()
	pc.add_theme_stylebox_override("panel", _style(C_CARD, 12, 16))
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 6)
	pc.add_child(v)
	var title := HBoxContainer.new()
	title.add_child(_label(tr(c.name_key), 25))
	if c.tutorial:
		title.add_child(_label("  · " + tr("ui_tutorial_tag"), 18, C_COPPER))
	v.add_child(title)
	v.add_child(_label(tr(c.brief_key), 18, C_DIM, true))
	var dest = DataDB.get_airport(c.to_code)
	v.add_child(_label(tr(dest.name_key), 19, C_DIM))
	var money_row := HBoxContainer.new()
	money_row.add_theme_constant_override("separation", 22)
	money_row.add_child(_label(tr("ui_cost") + ": " + Loc.money(c.cost), 20, C_BAD))
	money_row.add_child(_label(tr("ui_payout") + ": " + Loc.t("ui_potential", {"v": Loc.money(c.max_payout())}), 20, C_GOOD))
	v.add_child(money_row)
	var done: int = GameState.times_completed(c.id)
	if done > 0:
		v.add_child(_label(Loc.t("ui_completed_times", {"n": done}), 17, C_DIM))
	var active_id: String = str(GameState.active_run.get("contract_id", ""))
	if GameState.has_active_run():
		if active_id == c.id:
			var row := HBoxContainer.new()
			row.add_theme_constant_override("separation", 10)
			row.add_child(_button(tr("ui_resume"), func() -> void: resume_requested.emit(), true))
			row.add_child(_button("×", func() -> void: cancel_run_requested.emit()))
			v.add_child(row)
		return pc
	var err: String = GameState.accept_error(c)
	if err == "ui_locked":
		var req_name: String = ""
		for r in c.requires:
			var rc: ContractDef = DataDB.get_contract(r)
			if rc:
				req_name = tr(rc.name_key)
		v.add_child(_label(Loc.t("ui_locked", {"c": req_name}), 18, C_DIM, true))
	else:
		var id: String = c.id
		v.add_child(_button(Loc.t("ui_accept", {"v": Loc.money(c.cost)}), func() -> void: accept_requested.emit(id), true, err == ""))
		if err != "":
			v.add_child(_label(tr(err), 18, C_BAD))
	return pc


func show_results(r: Dictionary) -> void:
	_open("results", r)
	var v: VBoxContainer = _panel(620.0)
	v.add_child(_label(tr("ui_results"), 32, C_COPPER))
	var cid: String = str(r.get("contract_id", ""))
	var c: ContractDef = DataDB.get_contract(cid)
	if c:
		v.add_child(_label(tr(c.name_key), 22, C_DIM))
	v.add_child(_label("%s: %d/100 · %s" % [tr("ui_landing_score"), int(r.get("score", 0)), str(r.get("grade", ""))], 26))
	for line in r.get("feedback", []):
		v.add_child(_label("• " + str(line), 19, C_DIM))
	v.add_child(HSeparator.new())
	v.add_child(_label(tr("ui_payout") + ": " + Loc.money(int(r.get("payout", 0))), 22, C_GOOD))
	v.add_child(_label(tr("ui_cost") + ": " + Loc.money(int(r.get("cost", 0))), 22, C_BAD))
	var profit: int = int(r.get("profit", 0))
	v.add_child(_label(tr("ui_profit") + ": " + Loc.money(profit), 26, C_GOOD if profit >= 0 else C_BAD))
	if bool(r.get("duplicate", false)):
		v.add_child(_label(tr("ui_already_paid"), 18, C_DIM, true))
	v.add_child(_label(tr("ui_balance") + ": " + Loc.money(GameState.money), 22))
	v.add_child(_button(tr("ui_back_hub"), func() -> void: results_closed.emit(), true))


func show_failed(args: Dictionary) -> void:
	_open("failed", args)
	var v: VBoxContainer = _panel(600.0)
	v.add_child(_label(tr("ui_failed"), 32, C_BAD))
	v.add_child(_label(str(args.get("reason", "")), 25, C_INK, true))
	v.add_child(_label(str(args.get("advice", "")), 21, C_COPPER, true))
	if bool(args.get("retry", false)):
		v.add_child(_button(tr("ui_retry_approach"), func() -> void: retry_approach_requested.emit(), true))
	v.add_child(_button(tr("ui_restart"), func() -> void: restart_requested.emit()))
	v.add_child(_button(tr("ui_abandon"), func() -> void: to_gate_requested.emit()))


func show_pause(args: Dictionary) -> void:
	_open("pause", args)
	var v: VBoxContainer = _panel(560.0)
	v.add_child(_label(tr("ui_pause"), 32, C_COPPER))
	v.add_child(_button(tr("ui_continue"), func() -> void: unpause_requested.emit(), true))
	if bool(args.get("retry", false)):
		v.add_child(_button(tr("ui_retry_approach"), func() -> void: retry_approach_requested.emit()))
	v.add_child(_button(tr("ui_restart"), func() -> void: restart_requested.emit()))
	v.add_child(_button(tr("ui_abandon"), func() -> void: to_gate_requested.emit()))
	v.add_child(_settings_buttons())
	v.add_child(_label(tr("help_keys"), 16, C_DIM, true))


func show_hangar() -> void:
	_open("hangar", {})
	_build_top_bar()
	var v: VBoxContainer = _panel(520.0, "side")
	var base: AircraftDef = DataDB.get_aircraft(GameState.active_aircraft)
	var eff: AircraftDef = GameState.effective_aircraft()
	v.add_child(_label(tr("ui_hangar"), 30, C_COPPER))
	v.add_child(_label(tr(base.name_key), 25))
	v.add_child(_stat(tr("ui_thrust"), base.max_thrust, eff.max_thrust, 5.0))
	v.add_child(_stat(tr("ui_spool"), base.spool_rate, eff.spool_rate, 0.8))
	v.add_child(_stat(tr("ui_brakes"), base.brake_decel, eff.brake_decel, 5.0))
	for u in DataDB.upgrades_for(base.id):
		var ud: Dictionary = u
		var uid: String = str(ud.get("id", ""))
		var pc := PanelContainer.new()
		pc.add_theme_stylebox_override("panel", _style(C_CARD, 12, 16))
		var uv := VBoxContainer.new()
		pc.add_child(uv)
		uv.add_child(_label(tr(str(ud.get("name_key", ""))), 23, C_COPPER))
		uv.add_child(_label(tr(str(ud.get("desc_key", ""))), 18, C_DIM, true))
		if GameState.has_upgrade(uid):
			uv.add_child(_label(tr("ui_owned"), 21, C_GOOD))
		else:
			var price: int = int(ud.get("price", 0))
			var can: bool = GameState.money >= price
			uv.add_child(_button(Loc.t("ui_upgrade_buy", {"v": Loc.money(price)}), func() -> void: buy_requested.emit(uid), true, can))
			if not can:
				uv.add_child(_label(tr("ui_insufficient"), 18, C_BAD))
		v.add_child(pc)
	v.add_child(_button(tr("ui_fly"), func() -> void: hangar_closed.emit()))


func _stat(title: String, base_v: float, eff_v: float, max_v: float) -> Control:
	var v := VBoxContainer.new()
	var pct: int = int(round((eff_v / base_v - 1.0) * 100.0))
	var txt: String = title + ("  +%d%%" % pct if pct > 0 else "")
	v.add_child(_label(txt, 19, C_GOOD if pct > 0 else C_DIM))
	var bar := ProgressBar.new()
	bar.max_value = max_v
	bar.value = eff_v
	bar.show_percentage = false
	bar.custom_minimum_size = Vector2(0, 14)
	bar.add_theme_stylebox_override("background", _style(Color(1, 1, 1, 0.1), 6, 0))
	bar.add_theme_stylebox_override("fill", _style(C_COPPER, 6, 0))
	v.add_child(bar)
	return v

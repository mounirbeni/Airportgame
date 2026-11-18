extends Node3D
## Game flow: builds the 3D world, then routes between the gate (contract
## board), flight, results/failure, pause and the hangar.

const WorldEnv = preload("res://scripts/world/world_env.gd")
const Terrain = preload("res://scripts/world/terrain.gd")
const AirportBuilder = preload("res://scripts/world/airport_builder.gd")
const Scenery = preload("res://scripts/world/scenery.gd")
const Aircraft = preload("res://scripts/aircraft/aircraft_controller.gd")
const EngineAudio = preload("res://scripts/aircraft/engine_audio.gd")
const ChaseCamera = preload("res://scripts/camera/chase_camera.gd")
const Mission = preload("res://scripts/mission/mission_controller.gd")
const Hud = preload("res://scripts/ui/hud.gd")
const TouchControls = preload("res://scripts/ui/touch_controls.gd")
const Panels = preload("res://scripts/ui/panels.gd")
const HangarView = preload("res://scripts/hangar/hangar_view.gd")
const ContractDef = preload("res://scripts/data/contract_def.gd")
const AirportDef = preload("res://scripts/data/airport_def.gd")

enum Mode { GATE, FLYING, RESULTS, FAILED, HANGAR }

var mode: int = Mode.GATE
var env: WorldEnv
var terrain: Terrain
var airport_nodes: Dictionary = {}
var aircraft: Aircraft
var camera: ChaseCamera
var audio: EngineAudio
var mission: Mission
var hangar: HangarView
var hud: Hud
var touch: TouchControls
var panels: Panels
var _last_fail: Dictionary = {}


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	var low: bool = str(GameState.get_setting("quality", "high")) == "low"
	env = WorldEnv.new()
	env.name = "Environment"
	add_child(env)
	var airports: Array = DataDB.airports.values()
	terrain = Terrain.new()
	terrain.name = "Terrain"
	add_child(terrain)
	terrain.setup(airports, low)
	for a in airports:
		var ap: AirportDef = a
		var b: AirportBuilder = AirportBuilder.new()
		add_child(b)
		b.build(ap)
		airport_nodes[ap.code] = b
	var scenery: Scenery = Scenery.new()
	scenery.name = "Scenery"
	add_child(scenery)
	scenery.build(airports, terrain, low)

	aircraft = Aircraft.new()
	aircraft.name = "Aircraft"
	aircraft.process_mode = Node.PROCESS_MODE_PAUSABLE
	add_child(aircraft)
	aircraft.terrain = terrain
	aircraft.setup(GameState.effective_aircraft())

	camera = ChaseCamera.new()
	camera.name = "ChaseCamera"
	add_child(camera)
	camera.target = aircraft
	camera.make_current()
	camera.set_mode(int(GameState.get_setting("camera", 0)))

	audio = EngineAudio.new()
	audio.name = "EngineAudio"
	audio.process_mode = Node.PROCESS_MODE_PAUSABLE
	audio.aircraft = aircraft
	audio.volume = float(GameState.get_setting("volume", 0.8))
	add_child(audio)
	aircraft.touched_down.connect(func(info: Dictionary) -> void: audio.chirp(float(info["vs"])))

	mission = Mission.new()
	mission.name = "Mission"
	mission.process_mode = Node.PROCESS_MODE_PAUSABLE
	add_child(mission)
	mission.airport_nodes = airport_nodes
	mission.bind_aircraft(aircraft)

	hangar = HangarView.new()
	hangar.name = "HangarView"
	add_child(hangar)
	var home: AirportDef = DataDB.get_airport(DataDB.home_airport)
	var home_node: AirportBuilder = airport_nodes[home.code]
	hangar.global_transform = Transform3D(Basis(Vector3.UP, deg_to_rad(home.yaw_deg)),
		home.to_world(home_node.hangar_local_origin()))

	_build_ui()
	_connect_signals()
	_apply_settings()
	get_viewport().size_changed.connect(_update_safe_area)
	_update_safe_area()
	go_to_gate()


func _build_ui() -> void:
	var layer := CanvasLayer.new()
	layer.name = "UI"
	add_child(layer)
	hud = Hud.new()
	hud.name = "HUD"
	layer.add_child(hud)
	hud.aircraft = aircraft
	hud.mission = mission
	hud.camera = camera
	touch = TouchControls.new()
	touch.name = "TouchControls"
	layer.add_child(touch)
	panels = Panels.new()
	panels.name = "Panels"
	layer.add_child(panels)


func _connect_signals() -> void:
	mission.objective_changed.connect(hud.set_objective)
	mission.hint.connect(hud.show_hint)
	mission.toast.connect(hud.show_toast)
	mission.completed.connect(_on_completed)
	mission.failed.connect(_on_failed)
	touch.camera_pressed.connect(_cycle_camera)
	touch.pause_pressed.connect(_pause)
	panels.accept_requested.connect(_on_accept)
	panels.resume_requested.connect(_on_resume)
	panels.cancel_run_requested.connect(_on_cancel_run)
	panels.hangar_requested.connect(_open_hangar)
	panels.hangar_closed.connect(_close_hangar)
	panels.buy_requested.connect(_on_buy)
	panels.results_closed.connect(go_to_gate)
	panels.retry_approach_requested.connect(_retry_approach)
	panels.restart_requested.connect(_restart)
	panels.to_gate_requested.connect(go_to_gate)
	panels.unpause_requested.connect(_unpause)
	panels.language_toggled.connect(_toggle_language)
	panels.quality_toggled.connect(_toggle_quality)
	panels.guidance_toggled.connect(_toggle_guidance)
	Loc.language_changed.connect(_on_language_changed)
	GameState.money_changed.connect(func(_v: int) -> void: panels.refresh())


func _apply_settings() -> void:
	env.apply_quality(str(GameState.get_setting("quality", "high")))
	var g: bool = bool(GameState.get_setting("guidance", true))
	hud.guidance = g
	mission.guidance = g


func _update_safe_area() -> void:
	var vp: Vector2 = get_viewport().get_visible_rect().size
	var full := Rect2(Vector2.ZERO, vp)
	var r: Rect2 = full
	var win: Vector2i = DisplayServer.window_get_size()
	var safe_i: Rect2i = DisplayServer.get_display_safe_area()
	if win.x > 0 and win.y > 0 and safe_i.size.x > 0 and safe_i.size.y > 0:
		var scale: Vector2 = vp / Vector2(win)
		var win_pos: Vector2 = Vector2(DisplayServer.window_get_position())
		var sr := Rect2((Vector2(safe_i.position) - win_pos) * scale, Vector2(safe_i.size) * scale)
		var inter: Rect2 = sr.intersection(full)
		if inter.size.x > vp.x * 0.5 and inter.size.y > vp.y * 0.5:
			r = inter
	touch.safe = r.grow(-8.0)
	hud.safe = r.grow(-8.0)
	panels.apply_safe_area(r)


# --- flow --------------------------------------------------------------------

func go_to_gate() -> void:
	mode = Mode.GATE
	get_tree().paused = false
	FlightInput.release_all()
	mission.stop()
	hangar.close()
	aircraft.setup(GameState.effective_aircraft())
	var home: AirportDef = DataDB.get_airport(DataDB.home_airport)
	var gp: Dictionary = home.gate_pose()
	aircraft.place(gp["pos"], gp["yaw"], 0.0, true, 0.0)
	aircraft.freeze()
	camera.make_current()
	camera.snap()
	hud.visible = false
	hud.clear_messages()
	touch.visible = false
	panels.show_board()


func _start_flight(c: ContractDef, run_id: String) -> void:
	mode = Mode.FLYING
	_last_fail = {}
	get_tree().paused = false
	panels.hide_all()
	hud.visible = true
	hud.clear_messages()
	touch.visible = true
	aircraft.setup(GameState.effective_aircraft())
	mission.guidance = bool(GameState.get_setting("guidance", true))
	mission.start(c, run_id)
	camera.make_current()
	camera.snap()


func _on_accept(contract_id: String) -> void:
	var run_id: String = GameState.accept_contract(contract_id)
	if run_id == "":
		panels.refresh()
		return
	_start_flight(DataDB.get_contract(contract_id), run_id)


func _on_cancel_run() -> void:
	GameState.abandon_run()
	panels.refresh()


func _on_resume() -> void:
	if not GameState.has_active_run():
		return
	var c: ContractDef = DataDB.get_contract(str(GameState.active_run.get("contract_id", "")))
	if c:
		_start_flight(c, str(GameState.active_run.get("run_id", "")))


func _on_completed(result: Dictionary) -> void:
	mode = Mode.RESULTS
	FlightInput.release_all()
	FlightInput.set_throttle(0.0)
	touch.visible = false
	panels.show_results(result)


func _on_failed(reason_text: String, advice_text: String, can_retry: bool) -> void:
	mode = Mode.FAILED
	FlightInput.release_all()
	FlightInput.set_throttle(0.0)
	touch.visible = false
	_last_fail = {"reason": reason_text, "advice": advice_text, "retry": can_retry}
	panels.show_failed(_last_fail)


func _retry_approach() -> void:
	if not mission.can_retry_approach() and not bool(_last_fail.get("retry", false)):
		return
	mode = Mode.FLYING
	get_tree().paused = false
	panels.hide_all()
	touch.visible = true
	hud.visible = true
	hud.clear_messages()
	mission.retry_approach()
	camera.snap()


func _restart() -> void:
	mode = Mode.FLYING
	get_tree().paused = false
	panels.hide_all()
	touch.visible = true
	hud.visible = true
	hud.clear_messages()
	mission.restart_from_gate()
	camera.snap()


func _pause() -> void:
	if mode != Mode.FLYING or get_tree().paused:
		return
	FlightInput.release_all()
	get_tree().paused = true
	touch.visible = false
	panels.show_pause({"retry": mission.can_retry_approach()})


func _unpause() -> void:
	if not get_tree().paused:
		return
	panels.hide_all()
	get_tree().paused = false
	touch.visible = true


func _open_hangar() -> void:
	mode = Mode.HANGAR
	hangar.open(GameState.effective_aircraft())
	panels.show_hangar()


func _close_hangar() -> void:
	hangar.close()
	go_to_gate()


func _on_buy(upgrade_id: String) -> void:
	if GameState.buy_upgrade(upgrade_id):
		var eff = GameState.effective_aircraft()
		hangar.refresh(eff)
		aircraft.setup(eff)
		hud.show_toast(Loc.t("toast_purchased"))
	panels.refresh()


func _cycle_camera() -> void:
	if mode == Mode.HANGAR:
		return
	var m: int = camera.cycle()
	GameState.settings["camera"] = m


func _toggle_language() -> void:
	GameState.set_setting("lang", "en" if Loc.current == "ar" else "ar")


func _toggle_quality() -> void:
	var q: String = "high" if str(GameState.get_setting("quality", "high")) == "low" else "low"
	GameState.set_setting("quality", q)
	env.apply_quality(q)
	panels.refresh()


func _toggle_guidance() -> void:
	GameState.set_setting("guidance", not bool(GameState.get_setting("guidance", true)))
	_apply_settings()
	panels.refresh()
	hud.show_toast(Loc.t("ui_guidance", {"v": tr("ui_on") if hud.guidance else tr("ui_off")}))


func _on_language_changed(_lang: String) -> void:
	panels.refresh()
	mission.refresh_texts()


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed(&"pause_game"):
		if get_tree().paused:
			_unpause()
		else:
			_pause()
	elif event.is_action_pressed(&"camera_toggle"):
		_cycle_camera()
	elif event.is_action_pressed(&"guidance_toggle"):
		_toggle_guidance()
	elif event.is_action_pressed(&"retry_approach") and mode == Mode.FAILED and bool(_last_fail.get("retry", false)):
		_retry_approach()


func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_PAUSED or what == NOTIFICATION_APPLICATION_FOCUS_OUT:
		if mode == Mode.FLYING and not get_tree().paused:
			_pause()
		GameState.save_game()

extends Node3D
## Contract flow: taxi -> hold line -> line up -> takeoff -> en-route markers
## -> approach -> touchdown scoring -> rollout to a full stop -> payment.
## Pure mission logic: reads the aircraft state, never touches physics.

const ContractDef = preload("res://scripts/data/contract_def.gd")
const AirportDef = preload("res://scripts/data/airport_def.gd")
const Marker = preload("res://scripts/mission/waypoint_marker.gd")
const Aircraft = preload("res://scripts/aircraft/aircraft_controller.gd")

signal objective_changed(text: String)
signal hint(text: String)
signal toast(text: String)
signal completed(result: Dictionary)
signal failed(reason_text: String, advice_text: String, can_retry_approach: bool)
signal stage_changed(stage: int)

enum Stage { IDLE, TAXI, HOLD, LINEUP, TAKEOFF, ENROUTE, APPROACH, ROLLOUT, DONE, FAILED }

const GLIDE_DEG: float = 3.0
const TAXI_RADIUS: float = 24.0
const RING_RADIUS: float = 90.0

var aircraft: Aircraft
var airport_nodes: Dictionary = {}   # code -> airport builder node
var guidance: bool = true

var contract: ContractDef
var run_id: String = ""
var origin: AirportDef
var dest: AirportDef
var stage: int = Stage.IDLE
var taxi_points: Array[Vector3] = []
var taxi_index: int = 0
var nav_points: Array[Vector3] = []
var nav_index: int = 0
var iaf_index: int = 0
var faf_index: int = 0
var landing_score: int = 0
var landing_feedback: Array[String] = []
var landing_grade: String = ""

var _objective_key: String = ""
var _objective_args: Dictionary = {}
var _marker: Node3D
var _hint_cd: float = 0.0
var _min_dist: float = INF
var _far_time: float = 0.0
var _complete_sent: bool = false
var _hold_warned: bool = false


func bind_aircraft(a: Aircraft) -> void:
	aircraft = a
	aircraft.touched_down.connect(_on_touchdown)
	aircraft.lifted_off.connect(_on_liftoff)
	aircraft.crashed.connect(_on_crash)


# --- lifecycle ---------------------------------------------------------------

func start(c: ContractDef, p_run_id: String) -> void:
	contract = c
	run_id = p_run_id
	origin = DataDB.get_airport(c.from_code)
	dest = DataDB.get_airport(c.to_code)
	_complete_sent = false
	_hold_warned = false
	landing_score = 0
	landing_feedback.clear()
	var gp: Dictionary = origin.gate_pose()
	aircraft.place(gp["pos"], gp["yaw"], 0.0, true, 0.0)
	taxi_points.clear()
	for p in origin.taxi_points_local():
		taxi_points.append(origin.to_world(p))
	nav_points.clear()
	for w in c.waypoints:
		nav_points.append(w)
	nav_points.append(dest.approach_fix(c.iaf_distance, _glide_alt(c.iaf_distance) + 40.0))
	nav_points.append(dest.approach_fix(c.faf_distance, _glide_alt(c.faf_distance)))
	iaf_index = nav_points.size() - 2
	faf_index = nav_points.size() - 1
	taxi_index = 0
	_set_stage(Stage.TAXI)
	_set_objective("obj_taxi")
	_show_taxi_marker()


func stop() -> void:
	_clear_marker()
	stage = Stage.IDLE
	_objective_key = ""


func retry_approach() -> void:
	if contract == null:
		return
	var p: Vector3 = dest.approach_fix(contract.iaf_distance, _glide_alt(contract.iaf_distance) + 30.0)
	aircraft.place(p, dest.runway_yaw(), aircraft.def.approach_speed + 10.0, false, 0.35)
	nav_index = faf_index
	_min_dist = INF
	_complete_sent = false
	_set_stage(Stage.APPROACH)
	_set_objective("obj_final")
	_show_nav_marker()


func restart_from_gate() -> void:
	if contract:
		start(contract, run_id)


func can_retry_approach() -> bool:
	return stage >= Stage.ENROUTE and stage <= Stage.ROLLOUT


func _glide_alt(dist: float) -> float:
	return tan(deg_to_rad(GLIDE_DEG)) * (dist + 300.0)


func _set_stage(s: int) -> void:
	stage = s
	stage_changed.emit(s)


func _set_objective(key: String, args: Dictionary = {}) -> void:
	_objective_key = key
	_objective_args = args
	objective_changed.emit(Loc.t(key, args))


func refresh_texts() -> void:
	if _objective_key != "":
		objective_changed.emit(Loc.t(_objective_key, _objective_args))


func _hint(key: String, args: Dictionary = {}, force: bool = false) -> void:
	if _hint_cd > 0.0 and not force:
		return
	_hint_cd = 4.5
	hint.emit(Loc.t(key, args))


# --- markers -----------------------------------------------------------------

func _clear_marker() -> void:
	if _marker and is_instance_valid(_marker):
		_marker.queue_free()
	_marker = null


func _place_marker(pos: Vector3, ground: bool, color: Color, text: String, face: Vector3, radius: float) -> void:
	_clear_marker()
	var m: Marker = Marker.new()
	add_child(m)
	m.global_position = pos
	m.setup(ground, radius, color, text, face)
	_marker = m


func _show_taxi_marker() -> void:
	var p: Vector3 = taxi_points[taxi_index]
	p.y = 0.0
	var text: String = ""
	if taxi_index == 0:
		text = Loc.t("cue_follow")
	elif taxi_index == taxi_points.size() - 1:
		text = Loc.t("cue_hold")
	_place_marker(p, true, Color(1.0, 0.76, 0.2), text, Vector3.ZERO, 12.0)


func _show_lineup_marker() -> void:
	_place_marker(origin.to_world(origin.lineup_local()), true, Color(0.3, 0.9, 0.85),
		Loc.t("cue_turn_right"), Vector3.ZERO, 14.0)


func _show_nav_marker() -> void:
	if nav_index >= nav_points.size():
		_place_marker(dest.threshold_world(), true, Color(0.3, 0.9, 0.85), Loc.t("cue_final"), Vector3.ZERO, 30.0)
		return
	var p: Vector3 = nav_points[nav_index]
	var prev: Vector3 = aircraft.global_position if nav_index == 0 else nav_points[nav_index - 1]
	var face: Vector3 = p - prev
	if nav_index >= iaf_index:
		face = dest.runway_dir() if nav_index == faf_index else face
	var color: Color = Color(0.25, 0.85, 0.85) if nav_index == faf_index else Color(0.95, 0.56, 0.25)
	_min_dist = INF
	_far_time = 0.0
	_place_marker(p, false, color, "", Vector3(face.x, 0.0, face.z), RING_RADIUS)


## World position of the current navigation target (for HUD guidance).
func target_point() -> Vector3:
	match stage:
		Stage.TAXI, Stage.HOLD:
			return taxi_points[mini(taxi_index, taxi_points.size() - 1)]
		Stage.LINEUP:
			return origin.to_world(origin.lineup_local())
		Stage.TAKEOFF:
			return origin.to_world(Vector3(0, 0, -origin.half_length()))
		Stage.ENROUTE, Stage.APPROACH:
			if nav_index < nav_points.size():
				return nav_points[nav_index]
			return dest.threshold_world()
	return aircraft.global_position


func is_on_final() -> bool:
	return stage == Stage.APPROACH and nav_index > faf_index - 1


func glide_angle() -> float:
	var node: Node = airport_nodes.get(dest.code, null) if dest else null
	if node == null:
		return GLIDE_DEG
	return node.glide_angle(aircraft.global_position)


# --- per-frame logic ---------------------------------------------------------

func _physics_process(delta: float) -> void:
	if stage == Stage.IDLE or stage == Stage.DONE or stage == Stage.FAILED or aircraft == null:
		return
	if aircraft.crashed_flag or aircraft.frozen:
		return
	_hint_cd = maxf(_hint_cd - delta, 0.0)
	var pos: Vector3 = aircraft.global_position
	var speed: float = aircraft.airspeed
	if dest and airport_nodes.has(dest.code):
		airport_nodes[dest.code].update_papi(pos)
	if not aircraft.on_ground and aircraft.stall_warning and stage >= Stage.TAKEOFF:
		_hint("advice_stall", {}, false)
	match stage:
		Stage.TAXI:
			_update_taxi(pos, speed)
		Stage.HOLD:
			_update_hold(pos, speed)
		Stage.LINEUP:
			_update_lineup(pos, speed)
		Stage.TAKEOFF:
			_update_takeoff(pos, speed)
		Stage.ENROUTE, Stage.APPROACH:
			_update_nav(pos, speed, delta)
		Stage.ROLLOUT:
			_update_rollout(pos, speed)
	# Global limits.
	var d_origin: float = Vector2(pos.x - origin.center.x, pos.z - origin.center.z).length()
	var d_dest: float = Vector2(pos.x - dest.center.x, pos.z - dest.center.z).length()
	if (d_origin > 32000.0 and d_dest > 32000.0) or pos.y > 7000.0:
		_fail("fail_lost", 0.0)


func _update_taxi(pos: Vector3, speed: float) -> void:
	if speed > 15.4:
		_hint("advice_taxi_slow")
	var p: Vector3 = taxi_points[taxi_index]
	if Vector2(pos.x - p.x, pos.z - p.z).length() < TAXI_RADIUS:
		taxi_index += 1
		if taxi_index >= taxi_points.size() - 1:
			taxi_index = taxi_points.size() - 1
			_set_stage(Stage.HOLD)
			_set_objective("obj_hold")
		_show_taxi_marker()


func _update_hold(pos: Vector3, speed: float) -> void:
	var p: Vector3 = taxi_points[taxi_points.size() - 1]
	var d: float = Vector2(pos.x - p.x, pos.z - p.z).length()
	var l: Vector3 = origin.to_local(pos)
	if d < 30.0 and speed < 3.0:
		_go_lineup()
	elif l.x < AirportDef.HOLD_X - 8.0:
		if not _hold_warned:
			_hold_warned = true
			_hint("advice_hold_missed", {}, true)
		_go_lineup()


func _go_lineup() -> void:
	_set_stage(Stage.LINEUP)
	_set_objective("obj_enter")
	_show_lineup_marker()


func _heading_error(target_yaw: float) -> float:
	return absf(rad_to_deg(wrapf(aircraft.yaw - target_yaw, -PI, PI)))


func _update_lineup(pos: Vector3, speed: float) -> void:
	var target: Vector3 = origin.to_world(origin.lineup_local())
	var d: float = Vector2(pos.x - target.x, pos.z - target.z).length()
	var herr: float = _heading_error(origin.runway_yaw())
	var aligned_roll: bool = origin.is_on_runway(pos, 0.0) and herr < 12.0 and speed > 15.0
	if (d < 30.0 and herr < 20.0) or aligned_roll:
		_clear_marker()
		_set_stage(Stage.TAKEOFF)
		_set_objective("obj_takeoff")


func _update_takeoff(pos: Vector3, speed: float) -> void:
	var vr: float = aircraft.def.rotate_speed
	if speed >= vr * 0.92:
		if _objective_key != "obj_rotate":
			_set_objective("obj_rotate")
	elif speed > 20.0 and FlightInput.get_pitch() > 0.3:
		_hint("advice_wait_rotate", {"v": int(round(vr * 1.94384))})
	if aircraft.on_ground:
		var l: Vector3 = origin.to_local(pos)
		if l.z < -origin.half_length() - 60.0 and speed > 8.0:
			_fail("fail_overrun", 0.0)
		elif not origin.is_on_pavement(pos) and speed > 12.0:
			_fail("fail_offrunway", 0.0)


func _update_nav(pos: Vector3, speed: float, delta: float) -> void:
	if nav_index < nav_points.size():
		var p: Vector3 = nav_points[nav_index]
		var hd: float = Vector2(pos.x - p.x, pos.z - p.z).length()
		var dy: float = absf(pos.y - p.y)
		var passed: bool = hd < RING_RADIUS * 3.5 and dy < 320.0
		if hd < 1000.0:
			_min_dist = minf(_min_dist, hd)
		if _min_dist < 1000.0 and hd > _min_dist + 150.0:
			passed = true
		if passed:
			_advance_nav()
			return
		# Drifting away from the marker for a while -> guidance hint.
		if hd > 1500.0:
			var to_p: Vector3 = (p - pos)
			to_p.y = 0.0
			var fwd: Vector3 = -aircraft.basis.z
			fwd.y = 0.0
			if to_p.normalized().dot(fwd.normalized()) < 0.2:
				_far_time += delta
			else:
				_far_time = 0.0
			if _far_time > 6.0:
				_hint("advice_turn_to_marker")
	else:
		_update_final(pos, speed)
	if stage == Stage.APPROACH:
		var l: Vector3 = dest.to_local(pos)
		if l.z < -dest.half_length() and not aircraft.on_ground:
			_fail("fail_missed", 0.0)
		elif l.z > contract.iaf_distance + dest.half_length() + 5000.0:
			_fail("fail_missed", 0.0)


func _advance_nav() -> void:
	nav_index += 1
	if nav_index <= faf_index:
		toast.emit(Loc.t("toast_waypoint"))
	if nav_index == iaf_index:
		_set_objective("obj_iaf")
	elif nav_index == faf_index:
		_set_stage(Stage.APPROACH)
		_set_objective("obj_final")
	elif nav_index > faf_index:
		_set_objective("obj_final")
		if guidance:
			_hint("advice_papi", {}, true)
	_show_nav_marker()


func _update_final(pos: Vector3, speed: float) -> void:
	var l: Vector3 = dest.to_local(pos)
	var agl: float = aircraft.agl
	if agl < 14.0 and l.z < dest.half_length() + 400.0:
		if _objective_key != "obj_flare":
			_set_objective("obj_flare")
		return
	if not guidance:
		return
	var ga: float = glide_angle()
	var app: float = aircraft.def.approach_speed
	if absf(l.x) > 25.0 and l.z > dest.half_length():
		_hint("advice_steer_left" if l.x > 0.0 else "advice_steer_right")
	elif ga > 3.9:
		_hint("advice_too_high")
	elif ga < 2.1:
		_hint("advice_too_low")
	elif speed > app + 16.0:
		_hint("advice_too_fast")
	elif speed < aircraft.def.stall_speed * 1.08:
		_hint("advice_too_slow")


func _update_rollout(pos: Vector3, speed: float) -> void:
	var l: Vector3 = dest.to_local(pos)
	if l.z < -dest.half_length() - 40.0 and speed > 8.0:
		_fail("fail_overrun", 0.0)
		return
	if not dest.is_on_pavement(pos) and speed > 10.0:
		_fail("fail_offrunway", 0.0)
		return
	if speed < 1.0:
		_finish()


# --- events ------------------------------------------------------------------

func _on_liftoff() -> void:
	if stage == Stage.TAKEOFF:
		_set_stage(Stage.ENROUTE)
		_set_objective("obj_climb")
		toast.emit(Loc.t("toast_liftoff"))
		nav_index = 0
		_show_nav_marker()
	elif stage == Stage.ROLLOUT:
		# Touch-and-go: fly the approach again; the landing is re-scored.
		_set_stage(Stage.APPROACH)
		nav_index = faf_index + 1
		_set_objective("obj_final")
		_show_nav_marker()


func _on_touchdown(info: Dictionary) -> void:
	var pos: Vector3 = info["pos"]
	match stage:
		Stage.TAKEOFF:
			if not origin.is_on_runway(pos):
				_fail("fail_offrunway", 0.0)
			return
		Stage.ENROUTE, Stage.APPROACH:
			if dest.is_on_runway(pos):
				_score_landing(info)
				if stage == Stage.FAILED:
					return
				_clear_marker()
				_set_stage(Stage.ROLLOUT)
				_set_objective("obj_brake")
				toast.emit(Loc.t("toast_touchdown", {"g": landing_grade}))
			elif stage == Stage.ENROUTE and origin.is_on_runway(pos):
				# Settled back onto the departure runway right after liftoff.
				_set_stage(Stage.TAKEOFF)
				_set_objective("obj_rotate")
			else:
				var near_airport: bool = dest.to_local(pos).length() < 3500.0 or origin.to_local(pos).length() < 3500.0
				_fail("fail_offrunway" if near_airport else "fail_terrain", 0.0)


func _score_landing(info: Dictionary) -> void:
	var pos: Vector3 = info["pos"]
	var l: Vector3 = dest.to_local(pos)
	var center_off: float = absf(l.x)
	var yaw_v: float = info["yaw"]
	var heading_err: float = absf(rad_to_deg(wrapf(yaw_v - dest.runway_yaw(), -PI, PI)))
	if heading_err > 30.0:
		_fail("fail_offrunway", 0.0)
		return
	var zone: float = dest.half_length() - l.z
	var vs_v: float = info["vs"]
	var spd_v: float = info["speed"]
	var vs_fpm: float = maxf(vs_v * 196.85, 0.0)
	var spd_kt: float = spd_v * 1.94384
	var app_kt: float = aircraft.def.approach_speed * 1.94384
	var s_vs: float = clampf(1.0 - (vs_fpm - 150.0) / 1050.0, 0.0, 1.0)
	var s_center: float = clampf(1.0 - (center_off - 2.0) / 18.0, 0.0, 1.0)
	var s_head: float = clampf(1.0 - (heading_err - 1.5) / 12.0, 0.0, 1.0)
	var s_zone: float = 1.0
	if zone < 150.0:
		s_zone = clampf(zone / 150.0, 0.0, 1.0)
	elif zone > 700.0:
		s_zone = clampf(1.0 - (zone - 700.0) / 900.0, 0.0, 1.0)
	var s_speed: float = clampf(1.0 - absf(spd_kt - app_kt) / 30.0, 0.0, 1.0)
	var total: float = s_vs * 0.4 + s_center * 0.2 + s_head * 0.15 + s_zone * 0.15 + s_speed * 0.1
	landing_score = int(round(total * 100.0))
	if landing_score >= 80:
		landing_grade = Loc.t("grade_excellent")
	elif landing_score >= 55:
		landing_grade = Loc.t("grade_good")
	else:
		landing_grade = Loc.t("grade_firm")
	landing_feedback = [
		Loc.t("fb_vs", {"v": int(round(vs_fpm))}),
		Loc.t("fb_center", {"v": "%.1f" % center_off}),
		Loc.t("fb_heading", {"v": "%.1f" % heading_err}),
		Loc.t("fb_zone", {"v": int(round(zone))}),
		Loc.t("fb_speed", {"v": int(round(spd_kt))}),
	]


func _finish() -> void:
	if _complete_sent:
		return
	_complete_sent = true
	aircraft.freeze()
	_set_stage(Stage.DONE)
	_set_objective("obj_complete")
	var result: Dictionary = GameState.complete_run(run_id, landing_score)
	result["feedback"] = landing_feedback.duplicate()
	result["grade"] = landing_grade
	completed.emit(result)


func _on_crash(reason: String, value: float) -> void:
	_fail(reason, value)


func _fail(reason: String, value: float) -> void:
	if stage == Stage.FAILED or stage == Stage.DONE:
		return
	var retry: bool = can_retry_approach()
	_set_stage(Stage.FAILED)
	_clear_marker()
	if not aircraft.crashed_flag:
		aircraft.freeze()
	var adv_key: String = "fadv_" + reason.trim_prefix("fail_")
	failed.emit(Loc.t(reason, {"v": int(round(value))}), Loc.t(adv_key), retry)

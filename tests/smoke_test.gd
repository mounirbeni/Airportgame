extends Node3D
## Headless smoke test. Run:
##   godot --headless --path . res://tests/smoke_test.tscn
## Exits with code 0 when every check passes, 1 otherwise. Uses a separate
## save file, so real progress is not modified.

const Terrain = preload("res://scripts/world/terrain.gd")
const Aircraft = preload("res://scripts/aircraft/aircraft_controller.gd")
const Mission = preload("res://scripts/mission/mission_controller.gd")
const ContractDef = preload("res://scripts/data/contract_def.gd")

var failures: int = 0
var checks: int = 0
var terrain: Terrain
var aircraft: Aircraft
var phase: String = "takeoff"
var t: float = 0.0
var lifted: bool = false
var touchdown: Dictionary = {}
var crash_reason: String = ""


func check(cond: bool, what: String) -> void:
	checks += 1
	if cond:
		print("  PASS ", what)
	else:
		failures += 1
		printerr("  FAIL ", what)


func _ready() -> void:
	print("Atlas Air 3D smoke test")
	_test_data()
	_test_economy_and_save()
	_setup_flight()


func _test_data() -> void:
	check(DataDB.contracts.size() >= 2, "two contracts loaded")
	check(DataDB.airports.has("CMN") and DataDB.airports.has("RAK"), "CMN and RAK airports loaded")
	check(DataDB.get_aircraft("atlas_t2") != null, "starter aircraft loaded")
	check(tr("obj_taxi") != "obj_taxi", "localization loaded")


func _test_economy_and_save() -> void:
	SaveSystem.base_path = "user://smoke_test_save"
	SaveSystem.delete_save()
	GameState.reset_progress()
	var start: int = GameState.money
	var c: ContractDef = DataDB.get_contract("cmn_rak")
	var fez: ContractDef = DataDB.get_contract("cmn_fez")
	check(not GameState.is_unlocked(fez), "second contract locked at start")
	var run: String = GameState.accept_contract("cmn_rak")
	check(run != "", "contract accepted")
	check(GameState.money == start - c.cost, "contract cost charged once")
	check(GameState.accept_contract("cmn_rak") == "", "cannot open a second run while one is active")
	var r1: Dictionary = GameState.complete_run(run, 80)
	var after: int = GameState.money
	check(bool(r1.get("paid", false)), "first completion pays")
	check(after == start - c.cost + int(r1["payout"]), "payout added")
	var r2: Dictionary = GameState.complete_run(run, 80)
	check(bool(r2.get("duplicate", false)) and GameState.money == after, "duplicate completion does not pay again")
	check(GameState.is_unlocked(fez), "second contract unlocked by progress")
	GameState.money = 123456
	GameState.load_game()
	check(GameState.money == after, "progress restored from save")
	check(GameState.times_completed("cmn_rak") == 1, "completed contract persisted")
	check(not GameState.buy_upgrade("thrust_kit") or after >= 9000, "upgrade requires funds")
	GameState.money = 20000
	var base_thrust: float = GameState.effective_aircraft().max_thrust
	check(GameState.buy_upgrade("thrust_kit"), "upgrade purchased")
	check(GameState.effective_aircraft().max_thrust > base_thrust * 1.2, "upgrade improves thrust")
	check(not GameState.buy_upgrade("thrust_kit"), "upgrade cannot be bought twice")
	var raw: Dictionary = SaveSystem.load_data()
	check(int(raw.get("version", 0)) == SaveSystem.VERSION, "save is versioned")
	var migrated: Dictionary = SaveSystem.migrate({"completed": ["cmn_rak"], "money": 5})
	check(int(migrated["version"]) == 1 and int(migrated["completed"]["cmn_rak"]) == 1, "v0 save migrates")


func _setup_flight() -> void:
	terrain = Terrain.new()
	add_child(terrain)
	terrain.setup(DataDB.airports.values(), true)
	aircraft = Aircraft.new()
	add_child(aircraft)
	aircraft.terrain = terrain
	aircraft.setup(DataDB.get_aircraft("atlas_t2").with_upgrades([]))
	aircraft.lifted_off.connect(func() -> void: lifted = true)
	aircraft.touched_down.connect(func(info: Dictionary) -> void: touchdown = info)
	aircraft.crashed.connect(func(reason: String, _v: float) -> void: crash_reason = reason)
	var cmn = DataDB.get_airport("CMN")
	aircraft.place(cmn.to_world(cmn.lineup_local()), cmn.runway_yaw(), 0.0, true, 1.0)


func _hold_pitch(target_deg: float) -> void:
	var err: float = target_deg - rad_to_deg(aircraft.pitch)
	Input.action_release(&"pitch_up")
	Input.action_release(&"pitch_down")
	if err > 0.3:
		Input.action_press(&"pitch_up", clampf(err / 3.0, 0.1, 1.0))
	elif err < -0.3:
		Input.action_press(&"pitch_down", clampf(-err / 3.0, 0.1, 1.0))


func _physics_process(delta: float) -> void:
	t += delta
	if phase == "takeoff":
		FlightInput.set_throttle(1.0)
		if aircraft.on_ground and aircraft.airspeed > aircraft.def.rotate_speed * 0.93:
			_hold_pitch(8.0)
		elif not aircraft.on_ground:
			_hold_pitch(7.0)
		if t > 75.0:
			check(lifted, "aircraft lifts off under keyboard-style input")
			check(aircraft.agl > 150.0, "aircraft climbs after liftoff (agl %.0f m)" % aircraft.agl)
			check(crash_reason == "", "no crash during takeoff")
			var rak = DataDB.get_airport("RAK")
			aircraft.place(rak.approach_fix(4000.0, tan(deg_to_rad(3.0)) * 4300.0), rak.runway_yaw(), 74.0, false, 0.25)
			phase = "landing"
			t = 0.0
	elif phase == "landing":
		if aircraft.agl < 12.0:
			FlightInput.set_throttle(0.0)
			_hold_pitch(5.0)
		else:
			FlightInput.set_throttle(0.25)
			_hold_pitch(1.0)
		if not touchdown.is_empty() or crash_reason != "" or t > 150.0:
			var rak = DataDB.get_airport("RAK")
			check(crash_reason == "", "approach and flare without crash (%s)" % crash_reason)
			check(not touchdown.is_empty(), "touchdown detected")
			if not touchdown.is_empty():
				var vs_fpm: float = float(touchdown["vs"]) * 196.85
				print("    touchdown %.0f ft/min at %.0f kt" % [vs_fpm, float(touchdown["speed"]) * 1.94384])
				check(rak.is_on_runway(touchdown["pos"]), "touchdown on the runway")
				check(vs_fpm < 900.0, "gentle touchdown")
			phase = "brake"
			t = 0.0
	elif phase == "brake":
		Input.action_press(&"brake")
		if aircraft.airspeed < 1.0 or t > 60.0:
			check(aircraft.airspeed < 1.0, "aircraft brakes to a full stop")
			FlightInput.release_all()
			check(not Input.is_action_pressed(&"brake"), "release_all releases held inputs")
			_finish()


func _finish() -> void:
	phase = "done"
	SaveSystem.delete_save()
	SaveSystem.base_path = "user://atlas_air_save"
	GameState.load_game()
	print("%d checks, %d failures" % [checks, failures])
	get_tree().quit(1 if failures > 0 else 0)

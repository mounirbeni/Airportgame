extends Node
## Persistent progress and airline economy: money, fleet, upgrades, completed
## contracts and settings. Contract payouts are idempotent per run id, so a
## retried or duplicated completion event can never pay twice.

const AircraftDef = preload("res://scripts/data/aircraft_def.gd")
const ContractDef = preload("res://scripts/data/contract_def.gd")

signal money_changed(value: int)
signal progress_changed
signal settings_changed

const MAX_RUN_HISTORY: int = 40

var money: int = 0
var owned_aircraft: Array[String] = []
var active_aircraft: String = ""
var owned_upgrades: Array[String] = []
var completed: Dictionary = {}      # contract id -> times completed
var run_results: Dictionary = {}    # run id -> result dictionary (paid runs)
var run_order: Array[String] = []   # paid run ids, oldest first
var active_run: Dictionary = {}     # {run_id, contract_id}
var settings: Dictionary = {
	"lang": "ar",
	"quality": "high",
	"guidance": true,
	"camera": 0,
	"volume": 0.8,
}


func _ready() -> void:
	load_game()


func load_game() -> void:
	var d: Dictionary = SaveSystem.load_data()
	if d.is_empty():
		_new_game()
		save_game()
	else:
		money = int(d.get("money", DataDB.start_money))
		owned_aircraft = _str_array(d.get("owned_aircraft", []))
		active_aircraft = str(d.get("active_aircraft", ""))
		owned_upgrades = _str_array(d.get("owned_upgrades", []))
		var comp: Variant = d.get("completed", {})
		completed = comp if typeof(comp) == TYPE_DICTIONARY else {}
		var rr: Variant = d.get("run_results", {})
		run_results = rr if typeof(rr) == TYPE_DICTIONARY else {}
		run_order = _str_array(d.get("run_order", []))
		var ar: Variant = d.get("active_run", {})
		active_run = ar if typeof(ar) == TYPE_DICTIONARY else {}
		var st: Variant = d.get("settings", {})
		if typeof(st) == TYPE_DICTIONARY:
			var sd: Dictionary = st
			for k in sd.keys():
				settings[k] = sd[k]
	_validate()
	Loc.set_language(str(settings.get("lang", "ar")))


func _new_game() -> void:
	money = DataDB.start_money
	owned_aircraft = []
	for id in DataDB.aircraft.keys():
		var a: AircraftDef = DataDB.aircraft[id]
		if a.price == 0:
			owned_aircraft.append(a.id)
	active_aircraft = owned_aircraft[0] if not owned_aircraft.is_empty() else ""
	owned_upgrades = []
	completed = {}
	run_results = {}
	run_order = []
	active_run = {}


func _validate() -> void:
	if owned_aircraft.is_empty():
		_new_game()
	if not owned_aircraft.has(active_aircraft):
		active_aircraft = owned_aircraft[0]
	if not active_run.is_empty() and DataDB.get_contract(str(active_run.get("contract_id", ""))) == null:
		active_run = {}


func save_game() -> void:
	SaveSystem.save_data({
		"money": money,
		"owned_aircraft": owned_aircraft,
		"active_aircraft": active_aircraft,
		"owned_upgrades": owned_upgrades,
		"completed": completed,
		"run_results": run_results,
		"run_order": run_order,
		"active_run": active_run,
		"settings": settings,
	})


func reset_progress() -> void:
	var keep: Dictionary = settings.duplicate()
	_new_game()
	settings = keep
	save_game()
	money_changed.emit(money)
	progress_changed.emit()


# --- Settings -------------------------------------------------------------

func get_setting(key: String, default_value: Variant = null) -> Variant:
	return settings.get(key, default_value)


func set_setting(key: String, value: Variant) -> void:
	settings[key] = value
	if key == "lang":
		Loc.set_language(str(value))
	save_game()
	settings_changed.emit()


# --- Contracts ------------------------------------------------------------

func times_completed(contract_id: String) -> int:
	return int(completed.get(contract_id, 0))


func is_unlocked(c: ContractDef) -> bool:
	for r in c.requires:
		if times_completed(r) <= 0:
			return false
	return true


## Returns "" when the contract can be accepted, else a localization key.
func accept_error(c: ContractDef) -> String:
	if not is_unlocked(c):
		return "ui_locked"
	if money < c.cost:
		return "ui_insufficient"
	return ""


## Charges the contract cost and opens a run. Returns the run id or "".
func accept_contract(contract_id: String) -> String:
	var c: ContractDef = DataDB.get_contract(contract_id)
	if c == null or accept_error(c) != "":
		return ""
	if has_active_run():
		return ""
	money -= c.cost
	var run_id: String = "run_%d_%d" % [int(Time.get_unix_time_from_system()), randi() % 1000000]
	active_run = {"run_id": run_id, "contract_id": contract_id, "cost": c.cost}
	save_game()
	money_changed.emit(money)
	return run_id


func has_active_run() -> bool:
	return not active_run.is_empty()


func abandon_run() -> void:
	active_run = {}
	save_game()


## Pays a completed run exactly once. Repeated calls with the same run id
## return the original result with "duplicate" = true and change nothing.
func complete_run(run_id: String, landing_score: int) -> Dictionary:
	if run_results.has(run_id):
		var prev: Dictionary = run_results[run_id].duplicate()
		prev["duplicate"] = true
		return prev
	if active_run.is_empty() or str(active_run.get("run_id", "")) != run_id:
		return {"paid": false, "duplicate": false, "error": "unknown_run"}
	var cid: String = str(active_run.get("contract_id", ""))
	var c: ContractDef = DataDB.get_contract(cid)
	if c == null:
		return {"paid": false, "duplicate": false, "error": "unknown_contract"}
	var score: int = clampi(landing_score, 0, 100)
	var payout: int = payout_for(c, score)
	var cost: int = int(active_run.get("cost", c.cost))
	money += payout
	completed[cid] = times_completed(cid) + 1
	var result: Dictionary = {
		"paid": true, "duplicate": false, "contract_id": cid, "score": score,
		"payout": payout, "cost": cost, "profit": payout - cost,
	}
	run_results[run_id] = result
	run_order.append(run_id)
	while run_order.size() > MAX_RUN_HISTORY:
		var old: String = run_order.pop_front()
		run_results.erase(old)
	active_run = {}
	save_game()
	money_changed.emit(money)
	progress_changed.emit()
	return result


static func payout_for(c: ContractDef, score: int) -> int:
	return int(round(c.payout * (0.8 + 0.4 * float(score) / 100.0)))


# --- Fleet & upgrades -----------------------------------------------------

func has_upgrade(id: String) -> bool:
	return owned_upgrades.has(id)


func buy_upgrade(id: String) -> bool:
	var u: Dictionary = DataDB.get_upgrade(id)
	if u.is_empty() or has_upgrade(id):
		return false
	var price: int = int(u.get("price", 0))
	if money < price:
		return false
	money -= price
	owned_upgrades.append(id)
	save_game()
	money_changed.emit(money)
	progress_changed.emit()
	return true


## Active aircraft with installed upgrades applied.
func effective_aircraft() -> AircraftDef:
	var base: AircraftDef = DataDB.get_aircraft(active_aircraft)
	var ups: Array = []
	for u in DataDB.upgrades_for(active_aircraft):
		var ud: Dictionary = u
		if has_upgrade(str(ud.get("id", ""))):
			ups.append(ud)
	return base.with_upgrades(ups)


static func _str_array(v: Variant) -> Array[String]:
	var out: Array[String] = []
	if typeof(v) == TYPE_ARRAY:
		for e in v:
			out.append(str(e))
	return out

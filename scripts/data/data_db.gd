extends Node
## Loads aircraft, upgrade, airport and contract definitions from data files.

const AircraftDef = preload("res://scripts/data/aircraft_def.gd")
const AirportDef = preload("res://scripts/data/airport_def.gd")
const ContractDef = preload("res://scripts/data/contract_def.gd")

var aircraft: Dictionary = {}     # id -> AircraftDef
var upgrades: Dictionary = {}     # id -> Dictionary
var airports: Dictionary = {}     # code -> AirportDef
var contracts: Array = []         # ContractDef, in display order
var home_airport: String = "CMN"
var start_money: int = 3000


func _ready() -> void:
	var ac: Dictionary = _load_json("res://data/aircraft.json")
	for d in ac.get("aircraft", []):
		var a: AircraftDef = AircraftDef.from_dict(d)
		aircraft[a.id] = a
	for d in ac.get("upgrades", []):
		var u: Dictionary = d
		upgrades[str(u.get("id", ""))] = u
	var world: Dictionary = _load_json("res://data/world.json")
	home_airport = str(world.get("home_airport", "CMN"))
	start_money = int(world.get("start_money", 3000))
	for d in world.get("airports", []):
		var ap: AirportDef = AirportDef.from_dict(d)
		airports[ap.code] = ap
	for d in world.get("contracts", []):
		var c: ContractDef = ContractDef.from_dict(d)
		contracts.append(c)


func get_aircraft(id: String) -> AircraftDef:
	return aircraft.get(id, null)


func get_airport(code: String) -> AirportDef:
	return airports.get(code, null)


func get_contract(id: String) -> ContractDef:
	for c in contracts:
		var cd: ContractDef = c
		if cd.id == id:
			return cd
	return null


func get_upgrade(id: String) -> Dictionary:
	return upgrades.get(id, {})


func upgrades_for(aircraft_id: String) -> Array:
	var out: Array = []
	for u in upgrades.values():
		var ud: Dictionary = u
		if str(ud.get("aircraft", "")) == aircraft_id:
			out.append(ud)
	return out


func _load_json(path: String) -> Dictionary:
	var f: FileAccess = FileAccess.open(path, FileAccess.READ)
	if f == null:
		push_error("Missing data file: " + path)
		return {}
	var parsed: Variant = JSON.parse_string(f.get_as_text())
	f.close()
	if typeof(parsed) != TYPE_DICTIONARY:
		push_error("Invalid JSON: " + path)
		return {}
	return parsed

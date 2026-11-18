extends RefCounted
## Passenger contract (loaded from data/world.json).

var id: String = ""
var from_code: String = ""
var to_code: String = ""
var name_key: String = ""
var brief_key: String = ""
var cost: int = 0
var payout: int = 0
var tutorial: bool = false
var requires: Array[String] = []
var iaf_distance: float = 6500.0
var faf_distance: float = 4000.0
var waypoints: Array[Vector3] = []


static func from_dict(d: Dictionary) -> RefCounted:
	var c = load("res://scripts/data/contract_def.gd").new()
	c.id = str(d.get("id", ""))
	c.from_code = str(d.get("from", ""))
	c.to_code = str(d.get("to", ""))
	c.name_key = str(d.get("name_key", ""))
	c.brief_key = str(d.get("brief_key", ""))
	c.cost = int(d.get("cost", 0))
	c.payout = int(d.get("payout", 0))
	c.tutorial = bool(d.get("tutorial", false))
	var req: Array = d.get("requires", [])
	for r in req:
		c.requires.append(str(r))
	c.iaf_distance = float(d.get("iaf_distance", 6500.0))
	c.faf_distance = float(d.get("faf_distance", 4000.0))
	var wps: Array = d.get("waypoints", [])
	for w in wps:
		var arr: Array = w
		c.waypoints.append(Vector3(float(arr[0]), float(arr[1]), float(arr[2])))
	return c


## Maximum payout (perfect landing).
func max_payout() -> int:
	return int(round(payout * 1.2))

extends RefCounted
## Airport layout definition. All airports share one procedural layout that is
## placed by center + yaw. Local frame: the runway lies along local Z from
## -L/2 to +L/2; the primary direction (takeoff/landing) points to local -Z.
## The apron, taxiway and buildings sit on the local +X side.

const TAXIWAY_X: float = 150.0
const APRON_X: float = 250.0
const TERMINAL_X: float = 345.0
const HOLD_X: float = 75.0

var code: String = ""
var name_key: String = ""
var center: Vector3 = Vector3.ZERO
var yaw_deg: float = 0.0
var runway_length: float = 2400.0
var runway_width: float = 45.0
var rwy_primary: String = "17"
var rwy_opposite: String = "35"
var has_hangar: bool = false
var terminal_color: Color = Color("#b5583a")
var city: String = ""


static func from_dict(d: Dictionary) -> RefCounted:
	var a = load("res://scripts/data/airport_def.gd").new()
	a.code = str(d.get("code", ""))
	a.name_key = str(d.get("name_key", ""))
	var c: Array = d.get("center", [0, 0, 0])
	a.center = Vector3(float(c[0]), float(c[1]), float(c[2]))
	a.yaw_deg = float(d.get("yaw_deg", 0.0))
	a.runway_length = float(d.get("runway_length", 2400.0))
	a.runway_width = float(d.get("runway_width", 45.0))
	a.rwy_primary = str(d.get("rwy_primary", "17"))
	a.rwy_opposite = str(d.get("rwy_opposite", "35"))
	a.has_hangar = bool(d.get("has_hangar", false))
	a.terminal_color = Color(str(d.get("terminal_color", "#b5583a")))
	a.city = str(d.get("city", ""))
	return a


func get_transform() -> Transform3D:
	return Transform3D(Basis(Vector3.UP, deg_to_rad(yaw_deg)), center)


func to_world(local: Vector3) -> Vector3:
	return get_transform() * local


func to_local(world: Vector3) -> Vector3:
	return get_transform().affine_inverse() * world


## Unit vector of the primary runway direction (world).
func runway_dir() -> Vector3:
	var y: float = deg_to_rad(yaw_deg)
	return Vector3(-sin(y), 0.0, -cos(y))


## Aircraft yaw (radians, Godot convention) that faces the primary direction.
func runway_yaw() -> float:
	return deg_to_rad(yaw_deg)


func half_length() -> float:
	return runway_length * 0.5


func threshold_world() -> Vector3:
	return to_world(Vector3(0, 0, half_length()))


## True when a world point lies on the runway pavement (with margin).
func is_on_runway(world: Vector3, margin: float = 6.0) -> bool:
	var l: Vector3 = to_local(world)
	return absf(l.x) <= runway_width * 0.5 + margin and absf(l.z) <= half_length() + 30.0


## Rough test for any paved surface (runway, taxiway, apron).
func is_on_pavement(world: Vector3) -> bool:
	var l: Vector3 = to_local(world)
	if is_on_runway(world, 4.0):
		return true
	if absf(l.z) <= half_length() and absf(l.x - TAXIWAY_X) < 16.0:
		return true
	if l.x > TAXIWAY_X and l.x < TERMINAL_X - 25.0 and absf(l.z) < 520.0:
		return true
	return false


## Gate stand: position + yaw. Parked facing the departure end along the apron.
func gate_pose() -> Dictionary:
	var local := Vector3(APRON_X + 20.0, 0, -80.0)
	# Face local +Z (towards the threshold end) = yaw + PI.
	return {"pos": to_world(local), "yaw": deg_to_rad(yaw_deg) + PI}


## Taxi checkpoints from gate to the hold line of the primary threshold.
func taxi_points_local() -> Array[Vector3]:
	var hl: float = half_length()
	var conn_z: float = hl - 40.0
	return [
		Vector3(APRON_X + 20.0, 0, 380.0),
		Vector3(TAXIWAY_X, 0, 520.0),
		Vector3(TAXIWAY_X, 0, conn_z - 80.0),
		Vector3(TAXIWAY_X - 25.0, 0, conn_z),
		Vector3(HOLD_X + 12.0, 0, conn_z),
	]


func connector_z() -> float:
	return half_length() - 40.0


func lineup_local() -> Vector3:
	return Vector3(0, 0, connector_z() - 70.0)


## Fix on the extended centerline, `dist` metres before the threshold.
func approach_fix(dist: float, alt: float) -> Vector3:
	var p: Vector3 = threshold_world() - runway_dir() * dist
	p.y = alt
	return p

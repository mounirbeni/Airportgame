extends RefCounted
## Aircraft performance and livery definition (loaded from data/aircraft.json).

var id: String = ""
var name_key: String = ""
var price: int = 0
var max_thrust: float = 3.4          # m/s^2 at full throttle
var drag_coef: float = 0.00015       # parasitic drag: k * v^2
var induced_coef: float = 0.6        # induced drag: k * cl^2 * q
var speedbrake_decel: float = 0.9    # extra airborne drag while braking
var ref_speed: float = 70.0          # m/s where cl = 1 carries the weight
var cl0: float = 0.35                # lift coefficient at zero angle of attack
var cl_per_deg: float = 0.13
var cl_max: float = 2.0
var stall_speed: float = 50.0        # 1 g stall speed (warnings, HUD advice)
var rotate_speed: float = 64.0
var approach_speed: float = 70.0
var max_speed: float = 160.0
var pitch_rate: float = 14.0         # deg/s
var roll_rate: float = 38.0          # deg/s
var brake_decel: float = 3.6
var align_rate: float = 2.5          # sideslip removal (weathervane), 1/s
var spool_rate: float = 0.45         # throttle units per second
var body_color: Color = Color("#f2ecdf")
var tail_color: Color = Color("#0f3f45")
var accent_color: Color = Color("#b8743d")
var upgrades: Array[String] = []


static func from_dict(d: Dictionary) -> RefCounted:
	var a = load("res://scripts/data/aircraft_def.gd").new()
	a.id = str(d.get("id", ""))
	a.name_key = str(d.get("name_key", ""))
	a.price = int(d.get("price", 0))
	a.max_thrust = float(d.get("max_thrust", a.max_thrust))
	a.drag_coef = float(d.get("drag_coef", a.drag_coef))
	a.induced_coef = float(d.get("induced_coef", a.induced_coef))
	a.speedbrake_decel = float(d.get("speedbrake_decel", a.speedbrake_decel))
	a.ref_speed = float(d.get("ref_speed", a.ref_speed))
	a.cl0 = float(d.get("cl0", a.cl0))
	a.cl_per_deg = float(d.get("cl_per_deg", a.cl_per_deg))
	a.cl_max = float(d.get("cl_max", a.cl_max))
	a.stall_speed = float(d.get("stall_speed", a.stall_speed))
	a.rotate_speed = float(d.get("rotate_speed", a.rotate_speed))
	a.approach_speed = float(d.get("approach_speed", a.approach_speed))
	a.max_speed = float(d.get("max_speed", a.max_speed))
	a.pitch_rate = float(d.get("pitch_rate", a.pitch_rate))
	a.roll_rate = float(d.get("roll_rate", a.roll_rate))
	a.brake_decel = float(d.get("brake_decel", a.brake_decel))
	a.align_rate = float(d.get("align_rate", a.align_rate))
	a.spool_rate = float(d.get("spool_rate", a.spool_rate))
	a.body_color = Color(str(d.get("body_color", "#f2ecdf")))
	a.tail_color = Color(str(d.get("tail_color", "#0f3f45")))
	a.accent_color = Color(str(d.get("accent_color", "#b8743d")))
	return a


## Copy with upgrade multipliers applied.
func with_upgrades(upgrade_defs: Array) -> RefCounted:
	var c = duplicate_def()
	for u in upgrade_defs:
		var ud: Dictionary = u
		c.max_thrust *= float(ud.get("thrust_mul", 1.0))
		c.spool_rate *= float(ud.get("spool_mul", 1.0))
		c.brake_decel *= float(ud.get("brake_mul", 1.0))
		c.upgrades.append(str(ud.get("id", "")))
	return c


func duplicate_def() -> RefCounted:
	var c = load("res://scripts/data/aircraft_def.gd").new()
	for p in ["id", "name_key", "price", "max_thrust", "drag_coef", "induced_coef",
			"speedbrake_decel", "ref_speed", "cl0", "cl_per_deg", "cl_max", "stall_speed", "rotate_speed",
			"approach_speed", "max_speed", "pitch_rate", "roll_rate", "brake_decel",
			"align_rate", "spool_rate", "body_color", "tail_color", "accent_color"]:
		c.set(p, get(p))
	c.upgrades = upgrades.duplicate()
	return c


## Angle of attack (deg) at which the wing stalls.
func stall_aoa() -> float:
	return (cl_max - cl0) / cl_per_deg

extends Node3D
## Approachable flight model. Lift = q * cl(angle of attack), so airspeed and
## nose attitude together decide climb or sink; drag = parasitic + induced;
## banking gives a coordinated turn (with a small lift assist); exceeding the
## stall angle drops lift and the nose. On the
## ground the aircraft steers with the nosewheel, brakes, and rotates at Vr.
## Reads only FlightInput, so keyboard and touch drive the same controls.

const AircraftDef = preload("res://scripts/data/aircraft_def.gd")
const AircraftModel = preload("res://scripts/aircraft/aircraft_model.gd")

signal touched_down(info: Dictionary)
signal lifted_off
signal crashed(reason: String, value: float)

const GRAVITY: float = 9.81
const GEAR_H: float = 3.15
const WHEELBASE: float = 14.7
const ROLL_FRICTION: float = 0.12
const CRASH_VS: float = 7.5            # m/s (~1475 ft/min), forgiving tutorial limit
const MAX_TOUCHDOWN_ROLL: float = 20.0 # degrees
const OBSTACLE_MASK: int = 2

var def: AircraftDef
var terrain: Node
var model: AircraftModel
var velocity: Vector3 = Vector3.ZERO
var yaw: float = 0.0
var pitch: float = 0.0
var roll: float = 0.0
var throttle: float = 0.0
var on_ground: bool = true
var frozen: bool = true
var crashed_flag: bool = false
var gear_down: bool = true
var stall_warning: bool = false
var braking: bool = false
var airspeed: float = 0.0
var agl: float = 0.0
var ground_time: float = 0.0
var aoa: float = 0.0

var _shape := BoxShape3D.new()
var _query := PhysicsShapeQueryParameters3D.new()


func _ready() -> void:
	model = AircraftModel.new()
	model.name = "Model"
	add_child(model)
	_shape.size = Vector3(28.0, 4.0, 32.0)
	_query.shape = _shape
	_query.collision_mask = OBSTACLE_MASK


func setup(d: AircraftDef) -> void:
	def = d
	model.build(d)


func place(pos: Vector3, p_yaw: float, speed: float, grounded: bool, thr: float) -> void:
	yaw = p_yaw
	pitch = 0.0
	roll = 0.0
	on_ground = grounded
	if grounded:
		pos.y = ground_height(pos) + GEAR_H
	position = pos
	if not grounded and speed > 1.0:
		# Trim for level flight: cl * q = 1.
		var q: float = pow(speed / def.ref_speed, 2.0)
		pitch = deg_to_rad(clampf((1.0 / q - def.cl0) / def.cl_per_deg, -2.0, 10.0))
	_update_basis()
	velocity = Vector3(-sin(yaw), 0.0, -cos(yaw)) * speed
	throttle = thr
	FlightInput.set_throttle(thr)
	crashed_flag = false
	frozen = false
	ground_time = 0.0
	airspeed = speed
	gear_down = grounded or pos.y < 600.0
	model.set_gear(gear_down)
	model.rotation = Vector3.ZERO


func ground_height(p: Vector3) -> float:
	if terrain:
		return terrain.height_at(p.x, p.z)
	return 0.0


func heading_deg() -> float:
	return fposmod(rad_to_deg(-yaw), 360.0)


func forward() -> Vector3:
	return -basis.z


func _update_basis() -> void:
	basis = Basis.from_euler(Vector3(pitch, yaw, -roll))


func _physics_process(delta: float) -> void:
	if frozen or crashed_flag or def == null:
		return
	braking = FlightInput.is_braking()
	throttle = move_toward(throttle, FlightInput.throttle, def.spool_rate * delta)
	if on_ground:
		_ground_step(delta)
	else:
		_air_step(delta)
	airspeed = velocity.length()
	agl = position.y - GEAR_H - ground_height(position)
	if not crashed_flag:
		_check_obstacles()
	var want_gear: bool = on_ground or agl < 300.0 or airspeed < 85.0
	if want_gear != gear_down:
		gear_down = want_gear
		model.set_gear(gear_down)


## Lift coefficient for an angle of attack (deg); reduced when stalled.
func lift_coef(aoa_deg: float) -> float:
	var cl: float = clampf(def.cl0 + def.cl_per_deg * aoa_deg, -0.6, def.cl_max)
	if aoa_deg > def.stall_aoa():
		cl *= 0.6
	return cl


func _ground_step(delta: float) -> void:
	ground_time += delta
	stall_warning = false
	aoa = rad_to_deg(pitch)
	var r_in: float = FlightInput.get_roll()
	var p_in: float = FlightInput.get_pitch()
	var fwd_flat := Vector3(-sin(yaw), 0.0, -cos(yaw))
	var speed: float = maxf(velocity.dot(fwd_flat), 0.0)
	var q: float = pow(speed / def.ref_speed, 2.0)
	var cl: float = lift_coef(aoa)
	var acc: float = throttle * def.max_thrust - def.drag_coef * speed * speed - def.induced_coef * cl * cl * q
	if speed > 0.01:
		acc -= ROLL_FRICTION
	if braking:
		acc -= def.brake_decel
	speed = maxf(speed + acc * delta, 0.0)
	# Nosewheel steering: tight at taxi speed, gentle on the takeoff roll.
	var steer_max: float = lerpf(deg_to_rad(50.0), deg_to_rad(3.0), clampf(speed / 45.0, 0.0, 1.0))
	var yaw_rate: float = speed * tan(r_in * steer_max) / WHEELBASE
	yaw -= clampf(yaw_rate, -0.6, 0.6) * delta
	# Rotation needs takeoff power and ~Vr; otherwise the nose settles down.
	if speed >= def.rotate_speed * 0.92 and p_in > 0.05 and throttle > 0.5:
		pitch = move_toward(pitch, deg_to_rad(12.0), deg_to_rad(def.pitch_rate * 0.7) * p_in * delta)
	else:
		pitch = move_toward(pitch, 0.0, deg_to_rad(4.0) * delta)
	roll = move_toward(roll, 0.0, deg_to_rad(20.0) * delta)
	_update_basis()
	velocity = fwd_flat * speed
	position += velocity * delta
	position.y = ground_height(position) + GEAR_H
	# Liftoff once the wing carries the weight.
	if GRAVITY * q * cl > GRAVITY * 1.02 and ground_time > 1.5:
		on_ground = false
		velocity = -basis.z * speed
		lifted_off.emit()


func _air_step(delta: float) -> void:
	var p_in: float = FlightInput.get_pitch()
	var r_in: float = FlightInput.get_roll()
	var speed: float = velocity.length()
	var authority: float = clampf(speed / def.stall_speed, 0.3, 1.0)
	pitch += deg_to_rad(def.pitch_rate) * p_in * authority * delta
	roll += deg_to_rad(def.roll_rate) * r_in * authority * delta
	if absf(r_in) < 0.05:
		roll = move_toward(roll, 0.0, deg_to_rad(10.0) * delta)
	roll = clampf(roll, deg_to_rad(-45.0), deg_to_rad(45.0))
	var vel_dir: Vector3 = velocity / speed if speed > 1.0 else -basis.z
	var gamma: float = asin(clampf(vel_dir.y, -1.0, 1.0))
	aoa = rad_to_deg(pitch - gamma)
	var stalled: bool = aoa > def.stall_aoa()
	stall_warning = aoa > def.stall_aoa() - 2.5 or speed < def.stall_speed * 1.05
	if stalled:
		# Stall: the nose drops until the wing flies again.
		pitch = move_toward(pitch, deg_to_rad(-10.0), deg_to_rad(12.0) * delta)
	pitch = clampf(pitch, deg_to_rad(-20.0), deg_to_rad(25.0))
	# Coordinated turn: right bank increases heading (decreases yaw).
	yaw -= GRAVITY * tan(roll) / maxf(speed, 40.0) * delta
	_update_basis()

	var fwd: Vector3 = -basis.z
	var up: Vector3 = basis.y
	var q: float = pow(speed / def.ref_speed, 2.0)
	var cl: float = lift_coef(aoa)
	# Turn assist: extra lift in banks so level turns need little back pressure.
	var bank_comp: float = 1.0 / maxf(cos(roll), 0.75)
	var lift_dir: Vector3 = (up - vel_dir * up.dot(vel_dir)).normalized()
	var drag: float = def.drag_coef * speed * speed + def.induced_coef * cl * cl * q
	if braking:
		drag += def.speedbrake_decel
	var acc: Vector3 = fwd * (throttle * def.max_thrust) - vel_dir * drag \
		+ lift_dir * (GRAVITY * q * cl * bank_comp) + Vector3.DOWN * GRAVITY
	velocity += acc * delta
	# Weathervane: remove sideslip by turning horizontal velocity to the nose.
	var hv := Vector2(velocity.x, velocity.z)
	var hs: float = hv.length()
	var hf := Vector2(fwd.x, fwd.z)
	if hs > 1.0 and hf.length() > 0.05:
		hv = (hv / hs).slerp(hf.normalized(), clampf(def.align_rate * delta, 0.0, 1.0)) * hs
		velocity.x = hv.x
		velocity.z = hv.y
	position += velocity * delta
	var gh: float = ground_height(position)
	if position.y - GEAR_H <= gh:
		_touchdown(gh)


func _touchdown(gh: float) -> void:
	var vs: float = -velocity.y
	var info: Dictionary = {
		"vs": vs,
		"speed": velocity.length(),
		"pos": position,
		"heading": heading_deg(),
		"yaw": yaw,
		"roll": rad_to_deg(roll),
		"pitch": rad_to_deg(pitch),
	}
	position.y = gh + GEAR_H
	if vs > CRASH_VS:
		_crash("fail_hard_landing", vs * 196.85)
		return
	if absf(rad_to_deg(roll)) > MAX_TOUCHDOWN_ROLL:
		_crash("fail_wingstrike", 0.0)
		return
	if rad_to_deg(pitch) < -5.0:
		_crash("fail_nose_first", 0.0)
		return
	on_ground = true
	ground_time = 0.0
	pitch = minf(pitch, deg_to_rad(4.0))
	velocity.y = 0.0
	touched_down.emit(info)


func _check_obstacles() -> void:
	_query.transform = Transform3D(basis, position)
	var hits: Array[Dictionary] = get_world_3d().direct_space_state.intersect_shape(_query, 1)
	if not hits.is_empty():
		_crash("fail_crash_obstacle", 0.0)


func _crash(reason: String, value: float) -> void:
	if crashed_flag:
		return
	crashed_flag = true
	velocity = Vector3.ZERO
	stall_warning = false
	model.rotation = Vector3(deg_to_rad(-6.0), 0.0, deg_to_rad(9.0))
	crashed.emit(reason, value)


func freeze() -> void:
	frozen = true
	velocity = Vector3.ZERO
	airspeed = 0.0
	stall_warning = false

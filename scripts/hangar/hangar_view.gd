extends Node3D
## 3D hangar: a showcase copy of the active aircraft inside the Casablanca
## hangar with a slow orbiting camera. Installed upgrades are visible on the
## model (copper intake lips, larger nacelles, winglets).

const AircraftDef = preload("res://scripts/data/aircraft_def.gd")
const AircraftModel = preload("res://scripts/aircraft/aircraft_model.gd")

var camera: Camera3D
var model: AircraftModel
var _angle: float = 0.6
var _active: bool = false


func _ready() -> void:
	model = AircraftModel.new()
	model.name = "ShowcaseAircraft"
	add_child(model)
	model.position = Vector3(0, AircraftModel.GEAR_HEIGHT + 0.15, 0)
	# Nose towards the open door (local -X).
	model.rotation.y = PI * 0.5
	camera = Camera3D.new()
	camera.fov = 58.0
	camera.near = 0.3
	camera.far = 3000.0
	add_child(camera)
	visible = false


func open(def: AircraftDef) -> void:
	model.build(def)
	model.set_gear(true)
	visible = true
	_active = true
	_angle = 0.6
	_update_camera()
	camera.make_current()


func close() -> void:
	_active = false
	visible = false
	camera.clear_current(false)


func refresh(def: AircraftDef) -> void:
	if _active:
		model.build(def)
		model.set_gear(true)


func _process(delta: float) -> void:
	if not _active:
		return
	_angle += delta * 0.18
	_update_camera()


func _update_camera() -> void:
	# Stay inside the hangar walls (depth 70, width 84): ellipse around the jet.
	var p := Vector3(cos(_angle) * 26.0, 9.0 + sin(_angle * 0.7) * 2.0, sin(_angle) * 33.0)
	camera.position = p
	camera.look_at(global_position + Vector3(0, 3.0, 0), Vector3.UP)

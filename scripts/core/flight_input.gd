extends Node
## Single source of flight input. Keyboard and touch controls drive the same
## InputMap actions; the throttle is a persistent value shared by the keyboard
## and the on-screen slider. All held inputs are released when a touch is
## cancelled, the window/app loses focus, or the game is paused.

signal throttle_changed(value: float)
signal inputs_released

const HELD_ACTIONS: Array[StringName] = [&"pitch_up", &"pitch_down", &"roll_left", &"roll_right", &"brake"]
const THROTTLE_KEY_RATE: float = 0.55

var throttle: float = 0.0
var enabled: bool = true


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_register_actions()


func _register_actions() -> void:
	_add(&"pitch_up", [KEY_S, KEY_DOWN])        # pull back = nose up
	_add(&"pitch_down", [KEY_W, KEY_UP])        # push = nose down
	_add(&"roll_left", [KEY_A, KEY_LEFT])
	_add(&"roll_right", [KEY_D, KEY_RIGHT])
	_add(&"throttle_up", [KEY_SHIFT, KEY_E, KEY_PAGEUP])
	_add(&"throttle_down", [KEY_CTRL, KEY_Q, KEY_PAGEDOWN])
	_add(&"brake", [KEY_SPACE, KEY_B])
	_add(&"camera_toggle", [KEY_C])
	_add(&"guidance_toggle", [KEY_G])
	_add(&"pause_game", [KEY_ESCAPE, KEY_P])
	_add(&"retry_approach", [KEY_R])


func _add(action: StringName, keys: Array) -> void:
	if not InputMap.has_action(action):
		InputMap.add_action(action, 0.1)
	for k in keys:
		var ev := InputEventKey.new()
		ev.physical_keycode = k
		InputMap.action_add_event(action, ev)


func _process(delta: float) -> void:
	if not enabled or get_tree().paused:
		return
	var d: float = 0.0
	if Input.is_action_pressed(&"throttle_up"):
		d += THROTTLE_KEY_RATE * delta
	if Input.is_action_pressed(&"throttle_down"):
		d -= THROTTLE_KEY_RATE * delta
	if d != 0.0:
		set_throttle(throttle + d)


func set_throttle(v: float) -> void:
	var nv: float = clampf(v, 0.0, 1.0)
	if is_equal_approx(nv, throttle):
		return
	throttle = nv
	throttle_changed.emit(throttle)


## Nose-up positive, -1..1.
func get_pitch() -> float:
	if not enabled:
		return 0.0
	return Input.get_action_strength(&"pitch_up") - Input.get_action_strength(&"pitch_down")


## Right positive, -1..1.
func get_roll() -> float:
	if not enabled:
		return 0.0
	return Input.get_action_strength(&"roll_right") - Input.get_action_strength(&"roll_left")


func is_braking() -> bool:
	return enabled and Input.is_action_pressed(&"brake")


func release_all() -> void:
	for a in HELD_ACTIONS:
		Input.action_release(a)
	Input.action_release(&"throttle_up")
	Input.action_release(&"throttle_down")
	inputs_released.emit()


func _notification(what: int) -> void:
	match what:
		NOTIFICATION_APPLICATION_FOCUS_OUT, NOTIFICATION_WM_WINDOW_FOCUS_OUT, NOTIFICATION_APPLICATION_PAUSED, NOTIFICATION_WM_CLOSE_REQUEST:
			release_all()

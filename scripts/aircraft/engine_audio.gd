extends AudioStreamPlayer
## Procedural engine audio (no audio assets): turbine whine + fan rumble that
## follow throttle, wind that follows airspeed, tyre chirp on touchdown,
## runway rumble while rolling and a stall warning tone.

const Aircraft = preload("res://scripts/aircraft/aircraft_controller.gd")
const MIX_RATE: float = 22050.0

var aircraft: Aircraft
var volume: float = 0.8
var _pb: AudioStreamGeneratorPlayback
var _phase_a: float = 0.0
var _phase_b: float = 0.0
var _phase_s: float = 0.0
var _noise_lp: float = 0.0
var _rumble_lp: float = 0.0
var _chirp: float = 0.0
var _rng := RandomNumberGenerator.new()


func _ready() -> void:
	var gen := AudioStreamGenerator.new()
	gen.mix_rate = MIX_RATE
	gen.buffer_length = 0.15
	stream = gen
	bus = &"Master"
	play()
	_pb = get_stream_playback()


func chirp(intensity: float) -> void:
	_chirp = clampf(0.4 + intensity * 0.15, 0.0, 1.0)


func _process(_delta: float) -> void:
	if _pb == null or aircraft == null:
		return
	var thr: float = aircraft.throttle
	var spd: float = aircraft.airspeed
	var rolling: bool = aircraft.on_ground and spd > 2.0
	var stall: bool = aircraft.stall_warning
	var active: bool = not aircraft.frozen and not aircraft.crashed_flag
	var amp: float = volume * (1.0 if active else 0.0)
	var f_whine: float = 420.0 + thr * 900.0
	var f_fan: float = 55.0 + thr * 70.0
	var wind: float = clampf(spd / 140.0, 0.0, 1.0)
	var frames: int = _pb.get_frames_available()
	for i in range(frames):
		_phase_a = fmod(_phase_a + f_whine / MIX_RATE, 1.0)
		_phase_b = fmod(_phase_b + f_fan / MIX_RATE, 1.0)
		var white: float = _rng.randf() * 2.0 - 1.0
		_noise_lp += (white - _noise_lp) * (0.08 + thr * 0.25)
		_rumble_lp += (white - _rumble_lp) * 0.02
		var s: float = sin(_phase_a * TAU) * 0.05 * (0.3 + thr)
		s += sin(_phase_b * TAU) * 0.12 * (0.4 + thr)
		s += _noise_lp * (0.18 + thr * 0.35 + wind * 0.25)
		if rolling:
			s += _rumble_lp * 1.4 * clampf(spd / 40.0, 0.0, 1.0)
		if _chirp > 0.001:
			s += white * _chirp * 0.6
			_chirp *= 0.9993
		if stall:
			_phase_s = fmod(_phase_s + 880.0 / MIX_RATE, 1.0)
			var gate: float = 1.0 if fmod(Time.get_ticks_msec() / 1000.0, 0.5) < 0.25 else 0.0
			s += (0.12 if _phase_s < 0.5 else -0.12) * gate
		s = clampf(s * amp, -1.0, 1.0)
		_pb.push_frame(Vector2(s, s))

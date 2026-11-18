extends Node3D
## Sunset sky, sun light, fog and the quality presets (mobile-friendly).

var env: Environment
var sun: DirectionalLight3D


func _ready() -> void:
	var sky_mat := ProceduralSkyMaterial.new()
	sky_mat.sky_top_color = Color(0.2, 0.33, 0.5)
	sky_mat.sky_horizon_color = Color(0.98, 0.66, 0.42)
	sky_mat.sky_curve = 0.12
	sky_mat.ground_bottom_color = Color(0.3, 0.22, 0.17)
	sky_mat.ground_horizon_color = Color(0.9, 0.6, 0.42)
	sky_mat.sun_angle_max = 8.0
	sky_mat.sun_curve = 0.1
	var sky := Sky.new()
	sky.sky_material = sky_mat
	sky.radiance_size = Sky.RADIANCE_SIZE_64
	env = Environment.new()
	env.background_mode = Environment.BG_SKY
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.ambient_light_energy = 0.7
	env.reflected_light_source = Environment.REFLECTION_SOURCE_SKY
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.tonemap_exposure = 1.05
	env.fog_enabled = true
	env.fog_light_color = Color(0.95, 0.7, 0.52)
	env.fog_density = 0.00005
	env.fog_sky_affect = 0.25
	env.fog_aerial_perspective = 0.4
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)
	sun = DirectionalLight3D.new()
	sun.light_color = Color(1.0, 0.78, 0.55)
	sun.light_energy = 1.25
	# Low western sun (sunset) — light travels towards the east.
	sun.rotation_degrees = Vector3(-14.0, -100.0, 0.0)
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_ORTHOGONAL
	sun.directional_shadow_max_distance = 260.0
	sun.shadow_bias = 0.08
	add_child(sun)


## "high": shadows, MSAA 2x, glow, full resolution.
## "low": no shadows, no MSAA/glow, 75% 3D resolution, lighter fog.
func apply_quality(preset: String) -> void:
	var vp: Viewport = get_viewport()
	if preset == "low":
		sun.shadow_enabled = false
		env.glow_enabled = false
		env.fog_aerial_perspective = 0.0
		vp.msaa_3d = Viewport.MSAA_DISABLED
		vp.scaling_3d_scale = 0.75
	else:
		sun.shadow_enabled = true
		env.glow_enabled = true
		env.glow_intensity = 0.6
		env.glow_bloom = 0.05
		env.fog_aerial_perspective = 0.4
		vp.msaa_3d = Viewport.MSAA_2X
		vp.scaling_3d_scale = 1.0

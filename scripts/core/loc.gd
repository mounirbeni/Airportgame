extends Node
## Localization loader. Builds Translation objects at runtime from JSON files
## in res://localization so text (including flight advice) stays separate from
## physics and mission logic and needs no import step.

signal language_changed(lang: String)

const LANGS: Array[String] = ["ar", "en"]
const RTL_LANGS: Array[String] = ["ar"]

var current: String = "ar"


func _ready() -> void:
	for lang in LANGS:
		var path: String = "res://localization/%s.json" % lang
		var f: FileAccess = FileAccess.open(path, FileAccess.READ)
		if f == null:
			push_error("Missing localization file: " + path)
			continue
		var parsed: Variant = JSON.parse_string(f.get_as_text())
		f.close()
		if typeof(parsed) != TYPE_DICTIONARY:
			push_error("Invalid localization JSON: " + path)
			continue
		var data: Dictionary = parsed
		var res := Translation.new()
		res.locale = lang
		for key in data.keys():
			res.add_message(StringName(str(key)), StringName(str(data[key])))
		TranslationServer.add_translation(res)
	set_language(current)


func set_language(lang: String) -> void:
	if not LANGS.has(lang):
		lang = "en"
	current = lang
	TranslationServer.set_locale(lang)
	language_changed.emit(lang)


func is_rtl() -> bool:
	return RTL_LANGS.has(current)


## Translate a key and substitute {placeholders}.
func t(key: String, args: Dictionary = {}) -> String:
	var s: String = tr(key)
	if args.is_empty():
		return s
	return s.format(args)


func money(v: int) -> String:
	return t("money_fmt", {"v": group_digits(v)})


static func group_digits(v: int) -> String:
	var neg: bool = v < 0
	var s: String = str(absi(v))
	var out: String = ""
	var count: int = 0
	for i in range(s.length() - 1, -1, -1):
		out = s[i] + out
		count += 1
		if count % 3 == 0 and i > 0:
			out = "," + out
	return ("-" if neg else "") + out

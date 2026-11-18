extends Node
## Versioned local save. Writes atomically (temp file + rename, previous file
## kept as .bak) and migrates older save versions on load.

const VERSION: int = 1

## Base file name; tests point this elsewhere so real progress is untouched.
var base_path: String = "user://atlas_air_save"
var SAVE_PATH: String:
	get: return base_path + ".json"
var TMP_PATH: String:
	get: return base_path + ".json.tmp"
var BAK_PATH: String:
	get: return base_path + ".json.bak"


func load_data() -> Dictionary:
	var d: Dictionary = _read(SAVE_PATH)
	if d.is_empty():
		d = _read(BAK_PATH)
	if d.is_empty():
		return {}
	return migrate(d)


func save_data(data: Dictionary) -> bool:
	var payload: Dictionary = data.duplicate(true)
	payload["version"] = VERSION
	var f: FileAccess = FileAccess.open(TMP_PATH, FileAccess.WRITE)
	if f == null:
		push_error("Save failed: cannot open temp file (%s)" % error_string(FileAccess.get_open_error()))
		return false
	f.store_string(JSON.stringify(payload, "\t"))
	f.close()
	if FileAccess.file_exists(SAVE_PATH):
		if FileAccess.file_exists(BAK_PATH):
			DirAccess.remove_absolute(BAK_PATH)
		DirAccess.rename_absolute(SAVE_PATH, BAK_PATH)
	var err: Error = DirAccess.rename_absolute(TMP_PATH, SAVE_PATH)
	if err != OK:
		push_error("Save failed: rename error %s" % error_string(err))
		return false
	return true


func delete_save() -> void:
	for p in [SAVE_PATH, TMP_PATH, BAK_PATH]:
		if FileAccess.file_exists(p):
			DirAccess.remove_absolute(p)


## Upgrade older payloads to the current schema.
func migrate(d: Dictionary) -> Dictionary:
	var v: int = int(d.get("version", 0))
	if v < 1:
		# v0 (pre-release prototype) stored completed contracts as an array.
		var completed: Variant = d.get("completed", {})
		if typeof(completed) == TYPE_ARRAY:
			var as_dict: Dictionary = {}
			for id in completed:
				as_dict[str(id)] = 1
			d["completed"] = as_dict
		v = 1
	d["version"] = v
	return d


func _read(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		return {}
	var f: FileAccess = FileAccess.open(path, FileAccess.READ)
	if f == null:
		return {}
	var parsed: Variant = JSON.parse_string(f.get_as_text())
	f.close()
	if typeof(parsed) != TYPE_DICTIONARY:
		push_warning("Save file unreadable: " + path)
		return {}
	return parsed

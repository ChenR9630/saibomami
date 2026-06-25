import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def parse_args():
    marker = "--"
    args = sys.argv[sys.argv.index(marker) + 1 :] if marker in sys.argv else []
    if len(args) != 3:
        raise SystemExit(
            "Usage: blender --background source.blend --python scripts/export-master-cat.py -- source.blend output.glb report.json"
        )
    return [Path(value).expanduser().resolve() for value in args]


def object_bounds(objects):
    min_values = [float("inf"), float("inf"), float("inf")]
    max_values = [float("-inf"), float("-inf"), float("-inf")]
    for obj in objects:
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            for index, value in enumerate(world):
                min_values[index] = min(min_values[index], value)
                max_values[index] = max(max_values[index], value)
    if min_values[0] == float("inf"):
        return None
    size = [max_values[index] - min_values[index] for index in range(3)]
    return {
        "min": min_values,
        "max": max_values,
        "size": size,
    }


def main():
    source_path, output_path, report_path = parse_args()
    scene_objects = list(bpy.context.scene.objects)
    view_layer_objects = set(bpy.context.view_layer.objects)
    mesh_objects = [obj for obj in scene_objects if obj.type == "MESH"]
    armatures = [obj for obj in scene_objects if obj.type == "ARMATURE"]
    export_meshes = [
        obj for obj in mesh_objects
        if obj in view_layer_objects
        and not obj.name.startswith("WGT-")
        and len(obj.data.polygons) > 0
    ]
    used_armature_names = {
        modifier.object.name
        for obj in export_meshes
        for modifier in obj.modifiers
        if modifier.type == "ARMATURE" and modifier.object
    }
    export_armatures = [
        obj for obj in armatures
        if obj in view_layer_objects and obj.name in used_armature_names
    ]
    if not export_armatures and armatures:
        export_armatures = [obj for obj in armatures if obj in view_layer_objects][:1]
    export_objects = export_meshes + export_armatures
    actions = list(bpy.data.actions)

    for obj in view_layer_objects:
        obj.select_set(False)
    for obj in export_objects:
        obj.select_set(True)
    active_candidates = [obj for obj in export_objects if obj.type == "ARMATURE"] or export_objects
    bpy.context.view_layer.objects.active = active_candidates[0] if active_candidates else None

    output_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(output_path),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=False,
        export_animations=True,
        export_nla_strips=True,
        export_skins=True,
        export_morph=True,
        export_materials="EXPORT",
    )

    report = {
        "source": str(source_path),
        "output": str(output_path),
        "meshes": [
            {
                "name": obj.name,
                "vertexCount": len(obj.data.vertices),
                "polygonCount": len(obj.data.polygons),
                "materials": [slot.material.name for slot in obj.material_slots if slot.material],
                "armatureModifiers": [
                    modifier.object.name
                    for modifier in obj.modifiers
                    if modifier.type == "ARMATURE" and modifier.object
                ],
            }
            for obj in mesh_objects
        ],
        "armatures": [
            {
                "name": armature.name,
                "boneCount": len(armature.data.bones),
                "bones": [bone.name for bone in armature.data.bones],
            }
            for armature in armatures
        ],
        "actions": [
            {
                "name": action.name,
                "frameStart": action.frame_range[0],
                "frameEnd": action.frame_range[1],
                "fCurveCount": len(action.fcurves),
            }
            for action in actions
        ],
        "exportedObjects": [obj.name for obj in export_objects],
        "runtimeExport": {
            "meshes": [obj.name for obj in export_meshes],
            "armatures": [obj.name for obj in export_armatures],
        },
        "bounds": object_bounds(mesh_objects),
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "output": str(output_path),
        "report": str(report_path),
        "meshCount": len(mesh_objects),
        "armatureCount": len(armatures),
        "actionCount": len(actions),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()

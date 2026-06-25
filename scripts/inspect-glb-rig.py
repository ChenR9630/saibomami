import json
import sys
from pathlib import Path

import bpy


def parse_args():
    marker = "--"
    args = sys.argv[sys.argv.index(marker) + 1 :] if marker in sys.argv else []
    if len(args) < 2:
        raise SystemExit(
            "Usage: blender --background --factory-startup --python scripts/inspect-glb-rig.py -- output.json model.glb [animation.glb ...]"
        )
    return Path(args[0]).expanduser().resolve(), [
        Path(value).expanduser().resolve() for value in args[1:]
    ]


def reset_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def inspect_file(path):
    reset_scene()
    bpy.ops.import_scene.gltf(filepath=str(path))

    objects = list(bpy.context.scene.objects)
    meshes = [obj for obj in objects if obj.type == "MESH"]
    skinned_meshes = [
        obj for obj in meshes
        if any(modifier.type == "ARMATURE" for modifier in obj.modifiers)
        or any(group.name for group in obj.vertex_groups)
    ]
    armatures = [obj for obj in objects if obj.type == "ARMATURE"]
    bones = []
    for armature in armatures:
        bones.extend([bone.name for bone in armature.data.bones])

    actions = []
    for action in bpy.data.actions:
        fcurves = list(getattr(action, "fcurves", []) or [])
        track_names = sorted({
            curve.data_path.split('"')[1]
            for curve in fcurves
            if 'pose.bones["' in curve.data_path
        })
        actions.append({
            "name": action.name,
            "frameStart": action.frame_range[0],
            "frameEnd": action.frame_range[1],
            "fCurveCount": len(fcurves),
            "animatedBoneCount": len(track_names),
            "animatedBonesSample": track_names[:80],
        })

    vertex_groups = sorted({
        group.name
        for mesh in meshes
        for group in mesh.vertex_groups
    })
    return {
        "path": str(path),
        "objectCount": len(objects),
        "meshCount": len(meshes),
        "skinnedMeshCount": len(skinned_meshes),
        "skinnedMeshes": [
            {
                "name": obj.name,
                "vertexCount": len(obj.data.vertices),
                "polygonCount": len(obj.data.polygons),
                "vertexGroupCount": len(obj.vertex_groups),
                "armatureModifiers": [
                    modifier.object.name
                    for modifier in obj.modifiers
                    if modifier.type == "ARMATURE" and modifier.object
                ],
            }
            for obj in skinned_meshes
        ],
        "armatures": [
            {
                "name": armature.name,
                "boneCount": len(armature.data.bones),
                "bonesSample": [bone.name for bone in armature.data.bones[:120]],
            }
            for armature in armatures
        ],
        "boneCount": len(set(bones)),
        "bones": sorted(set(bones)),
        "vertexGroupCount": len(vertex_groups),
        "vertexGroups": vertex_groups,
        "actions": actions,
    }


def main():
    output_path, glb_paths = parse_args()
    inspections = [inspect_file(path) for path in glb_paths]
    base_bones = set(inspections[0]["bones"]) if inspections else set()
    comparisons = []
    for inspection in inspections[1:]:
        other_bones = set(inspection["bones"])
        animated = {
            name
            for action in inspection["actions"]
            for name in action["animatedBonesSample"]
        }
        comparisons.append({
            "path": inspection["path"],
            "sharedBoneCount": len(base_bones & other_bones),
            "baseOnlyBoneCount": len(base_bones - other_bones),
            "otherOnlyBoneCount": len(other_bones - base_bones),
            "sharedBonesSample": sorted(base_bones & other_bones)[:120],
            "animatedBoneNamesPresentInBase": sorted(animated & base_bones)[:120],
            "animatedBoneNamesMissingFromBase": sorted(animated - base_bones)[:120],
        })

    output = {
        "base": inspections[0]["path"] if inspections else "",
        "files": inspections,
        "comparisonsToBase": comparisons,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "output": str(output_path),
        "fileCount": len(inspections),
        "baseBoneCount": len(base_bones),
        "comparisons": comparisons,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()

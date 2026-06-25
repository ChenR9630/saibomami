import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def parse_args():
    marker = "--"
    args = sys.argv[sys.argv.index(marker) + 1 :] if marker in sys.argv else []
    if len(args) != 4:
        raise SystemExit(
            "Usage: blender --background --factory-startup --python scripts/rebind-identity-to-master.py -- master.glb identity.glb output.glb report.json"
        )
    return [Path(value).expanduser().resolve() for value in args]


def reset_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def import_glb(path):
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    return [obj for obj in bpy.context.scene.objects if obj not in before]


def bounds(objects):
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
    return {
        "min": min_values,
        "max": max_values,
        "size": [max_values[index] - min_values[index] for index in range(3)],
        "center": [(min_values[index] + max_values[index]) / 2 for index in range(3)],
    }


def apply_world_transform(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def align_meshes_to_master(identity_meshes, master_meshes):
    master_bounds = bounds(master_meshes)
    identity_bounds = bounds(identity_meshes)
    if not master_bounds or not identity_bounds:
        return master_bounds, identity_bounds

    master_size = max(master_bounds["size"])
    identity_size = max(identity_bounds["size"])
    scale = master_size / identity_size if identity_size else 1

    for obj in identity_meshes:
        obj.scale = [axis * scale for axis in obj.scale]
    bpy.context.view_layer.update()

    scaled_bounds = bounds(identity_meshes)
    offset = Vector(master_bounds["center"]) - Vector(scaled_bounds["center"])
    offset.z += master_bounds["min"][2] - scaled_bounds["min"][2]
    for obj in identity_meshes:
        obj.location += offset
        apply_world_transform(obj)
    bpy.context.view_layer.update()
    return master_bounds, bounds(identity_meshes)


def copy_master_rest_pose_action(master_armature):
    action = bpy.data.actions.new("master-cat-rest")
    master_armature.animation_data_create()
    master_armature.animation_data.action = action
    return action


def distance_to_segment(point, start, end):
    segment = end - start
    length_squared = segment.length_squared
    if length_squared == 0:
        return (point - start).length
    factor = max(0, min(1, (point - start).dot(segment) / length_squared))
    closest = start + segment * factor
    return (point - closest).length


def build_nearest_bone_weights(meshes, armature):
    bpy.context.view_layer.update()
    candidates = []
    for bone in armature.data.bones:
      if (
          bone.name == "root"
          or bone.name == "neck"
          or bone.name == "head"
          or bone.name.startswith("DEF-")
      ):
          head = armature.matrix_world @ bone.head_local
          tail = armature.matrix_world @ bone.tail_local
          candidates.append((bone.name, head, tail))
    if not candidates:
        candidates = [
            (bone.name, armature.matrix_world @ bone.head_local, armature.matrix_world @ bone.tail_local)
            for bone in armature.data.bones
        ]

    for mesh in meshes:
        mesh.vertex_groups.clear()
        groups = {
            bone_name: mesh.vertex_groups.new(name=bone_name)
            for bone_name, _, _ in candidates
        }
        for vertex in mesh.data.vertices:
            world = mesh.matrix_world @ vertex.co
            nearest = sorted(
                (
                    (distance_to_segment(world, head, tail), bone_name)
                    for bone_name, head, tail in candidates
                ),
                key=lambda item: item[0],
            )[:4]
            total = sum(1 / max(distance, 0.0001) for distance, _ in nearest)
            for distance, bone_name in nearest:
                weight = (1 / max(distance, 0.0001)) / total
                groups[bone_name].add([vertex.index], weight, "ADD")


def ensure_armature_binding(meshes, armature):
    for mesh in meshes:
        mesh.parent = armature
        mesh.matrix_parent_inverse = armature.matrix_world.inverted()
        modifier = next((item for item in mesh.modifiers if item.type == "ARMATURE"), None)
        if not modifier:
            modifier = mesh.modifiers.new("master-cat-rig", "ARMATURE")
        modifier.object = armature
        modifier.use_vertex_groups = True


def main():
    master_path, identity_path, output_path, report_path = parse_args()
    reset_scene()

    master_objects = import_glb(master_path)
    master_meshes = [
        obj for obj in master_objects
        if obj.type == "MESH" and len(obj.data.polygons) > 0
    ]
    master_armatures = [obj for obj in master_objects if obj.type == "ARMATURE"]
    master_armature = next((obj for obj in master_armatures if obj.name == "rig"), None)
    master_armature = master_armature or (master_armatures[0] if master_armatures else None)
    if not master_armature:
        raise RuntimeError("MASTER_ARMATURE_NOT_FOUND")

    identity_objects = import_glb(identity_path)
    identity_meshes = [
        obj for obj in identity_objects
        if obj.type == "MESH" and len(obj.data.polygons) > 0
    ]
    identity_armatures = [obj for obj in identity_objects if obj.type == "ARMATURE"]
    if not identity_meshes:
        raise RuntimeError("IDENTITY_MESH_NOT_FOUND")

    master_bounds_before, identity_bounds_after = align_meshes_to_master(
        identity_meshes,
        master_meshes,
    )

    for obj in identity_meshes:
        for modifier in list(obj.modifiers):
            if modifier.type == "ARMATURE":
                obj.modifiers.remove(modifier)
        obj.vertex_groups.clear()

    removed_identity_armature_names = [obj.name for obj in identity_armatures]
    for armature in identity_armatures:
        bpy.data.objects.remove(armature, do_unlink=True)

    bpy.ops.object.select_all(action="DESELECT")
    for obj in identity_meshes:
        obj.select_set(True)
    master_armature.select_set(True)
    bpy.context.view_layer.objects.active = master_armature
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    ensure_armature_binding(identity_meshes, master_armature)

    if min((len(obj.vertex_groups) for obj in identity_meshes), default=0) < 8:
        build_nearest_bone_weights(identity_meshes, master_armature)
        ensure_armature_binding(identity_meshes, master_armature)

    for obj in master_meshes:
        bpy.data.objects.remove(obj, do_unlink=True)

    copy_master_rest_pose_action(master_armature)

    export_objects = identity_meshes + [master_armature]
    bpy.ops.object.select_all(action="DESELECT")
    for obj in export_objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = master_armature

    output_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(output_path),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=False,
        export_animations=False,
        export_skins=True,
        export_morph=True,
        export_materials="EXPORT",
    )

    report = {
        "master": str(master_path),
        "identity": str(identity_path),
        "output": str(output_path),
        "masterArmature": master_armature.name,
        "masterBoneCount": len(master_armature.data.bones),
        "identityMeshes": [
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
            for obj in identity_meshes
        ],
        "removedIdentityArmatures": removed_identity_armature_names,
        "masterBounds": master_bounds_before,
        "reboundIdentityBounds": identity_bounds_after,
        "exportedObjects": [obj.name for obj in export_objects],
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "output": str(output_path),
        "report": str(report_path),
        "masterBoneCount": report["masterBoneCount"],
        "identityMeshes": report["identityMeshes"],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()

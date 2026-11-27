#!/usr/bin/env python3
"""Convert Hero Forge's free Explorer Tabletop demo to a local GLB.

This utility accepts only the single-mesh Explorer sample bundle. It keeps
the source bundle and intermediates in a temporary directory, then writes the
requested GLB. UnityPy and Blender must be installed locally.
"""

from __future__ import annotations

import argparse
import hashlib
import os
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

MAX_ARCHIVE_BYTES = 32 * 1024 * 1024
MAX_MEMBER_BYTES = 32 * 1024 * 1024
EXPECTED_MEMBER = "Hero_Forge_Explorer_Demo.unity3d"
EXPECTED_ARCHIVE_SHA256 = "0b1ac787be4b30936b7ce1c2517337ca8a256818f56c0ff8f6b22150cbba717e"


def _blender_script() -> str:
    return r'''import bpy, json, os
from mathutils import Vector

cfg = json.load(open(os.environ["HF_CONVERT_CONFIG"], "r", encoding="utf-8"))
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.wm.obj_import(filepath=cfg["obj"])
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
if len(meshes) != 1:
    raise RuntimeError("Expected exactly one imported mesh")
mesh = meshes[0]

# UnityPy's OBJ is already Z-up. Clear the OBJ importer's Y-up adjustment.
mesh.rotation_euler[0] = 0.0
mesh.scale = (0.038, 0.038, 0.038)
bpy.context.view_layer.objects.active = mesh
mesh.select_set(True)
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

# Center the imported geometry without changing its exported axis orientation.
corners = [mesh.matrix_world @ Vector(c) for c in mesh.bound_box]
minimum = Vector(tuple(min(v[i] for v in corners) for i in range(3)))
maximum = Vector(tuple(max(v[i] for v in corners) for i in range(3)))
center = (minimum + maximum) * 0.5
mesh.location -= center

# Use the diffuse atlas as the glTF base-color texture. Blender embeds it in GLB.
image = bpy.data.images.load(cfg["texture"], check_existing=True)
if not mesh.data.materials:
    material = bpy.data.materials.new("Hero Forge Explorer")
    mesh.data.materials.append(material)
for material in mesh.data.materials:
    material.use_nodes = True
    nodes = material.node_tree.nodes
    principled = next((n for n in nodes if n.type == "BSDF_PRINCIPLED"), None)
    if principled is None:
        principled = nodes.new("ShaderNodeBsdfPrincipled")
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = image
    material.node_tree.links.new(texture.outputs["Color"], principled.inputs["Base Color"])

bpy.ops.object.select_all(action="DESELECT")
mesh.select_set(True)
bpy.context.view_layer.objects.active = mesh
bpy.ops.export_scene.gltf(filepath=cfg["output"], export_format="GLB", use_selection=True)

if cfg.get("render_dir"):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 700
    scene.render.resolution_y = 700
    scene.render.resolution_percentage = 100
    scene.eevee.taa_render_samples = 8
    scene.world.color = (0.035, 0.035, 0.035)
    extent = max(maximum[i] - minimum[i] for i in range(3))
    light_data = bpy.data.lights.new("Key", "AREA")
    light = bpy.data.objects.new("Key", light_data)
    scene.collection.objects.link(light)
    light.location = center + Vector((extent, -extent, extent * 1.3))
    light_data.energy = 40000
    light_data.size = extent * 0.8
    camera_data = bpy.data.cameras.new("Review Camera")
    camera = bpy.data.objects.new("Review Camera", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = extent * 1.3
    os.makedirs(cfg["render_dir"], exist_ok=True)
    for name, direction, up in (
        ("front", (0, -1, 0), "Z"),
        ("rear", (0, 1, 0), "Z"),
        ("top", (0, 0, 1), "Y"),
    ):
        d = Vector(direction)
        camera.location = center + d * extent * 2
        camera.rotation_euler = (-d).to_track_quat("-Z", up).to_euler()
        scene.render.filepath = os.path.join(cfg["render_dir"], name + ".png")
        bpy.ops.render.render(write_still=True)
'''


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path, help="Official Explorer Tabletop ZIP")
    parser.add_argument("output", type=Path, help="Destination GLB file")
    parser.add_argument("--blender", help="Blender executable (default: locate on PATH)")
    parser.add_argument(
        "--render-dir",
        type=Path,
        help="Optional directory for front.png, rear.png, and top.png review renders",
    )
    args = parser.parse_args()

    archive = args.archive.expanduser().resolve()
    output = args.output.expanduser().resolve()
    if archive == output:
        parser.error('choose a GLB destination separate from the archive')
    if not archive.is_file():
        parser.error(f"archive does not exist: {archive}")
    if archive.stat().st_size > MAX_ARCHIVE_BYTES:
        parser.error("archive exceeds 32 MiB limit")
    archive_digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    if archive_digest != EXPECTED_ARCHIVE_SHA256:
        parser.error("archive SHA-256 does not match the verified official Explorer demo")
    blender = args.blender or shutil.which("blender")
    if not blender:
        parser.error("Blender was not found; pass --blender /path/to/blender")

    try:
        import UnityPy
    except ImportError:
        parser.error("UnityPy is required in this Python environment (python -m pip install UnityPy)")

    output.parent.mkdir(parents=True, exist_ok=True)
    render_dir = args.render_dir.expanduser().resolve() if args.render_dir else None
    if render_dir:
        render_dir.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(archive) as zf:
        infos = zf.infolist()
        if len(infos) != 1 or infos[0].filename != EXPECTED_MEMBER:
            parser.error(f"expected exactly one archive member named {EXPECTED_MEMBER}")
        info = infos[0]
        if info.file_size <= 0 or info.file_size > MAX_MEMBER_BYTES:
            parser.error("Unity asset bundle exceeds 32 MiB limit or is empty")
        if info.compress_size <= 0 or info.file_size / info.compress_size > 100:
            parser.error("suspicious ZIP compression ratio")
        bundle_bytes = zf.read(info)

    with tempfile.TemporaryDirectory(prefix="hf-explorer-") as tmp_name:
        tmp = Path(tmp_name)
        bundle = tmp / EXPECTED_MEMBER
        bundle.write_bytes(bundle_bytes)
        env = UnityPy.load(str(bundle))
        objects = list(env.objects)
        meshes = [obj for obj in objects if obj.type.name == "Mesh"]
        renderers = [obj for obj in objects if obj.type.name == "MeshRenderer"]
        if len(meshes) != 1 or len(renderers) != 1:
            parser.error("asset is not the recognized single-mesh Explorer demo")
        mesh = meshes[0].read()
        obj_text = mesh.export("obj")
        obj_path = tmp / "default.obj"
        obj_path.write_text("mtllib default.mtl\ng default\nusemtl HF_Diffuse\n" + obj_text, encoding="utf-8")

        diffuse = None
        for obj in objects:
            if obj.type.name == "Texture2D":
                texture = obj.read()
                if "diffuse" in getattr(texture, "m_Name", "").lower():
                    diffuse = texture
                    break
        if diffuse is None or diffuse.m_Width > 8192 or diffuse.m_Height > 8192:
            parser.error("missing or oversized diffuse texture")
        texture_path = tmp / "diffuse.png"
        diffuse.image.save(texture_path, format="PNG")
        if texture_path.stat().st_size > 16 * 1024 * 1024:
            parser.error("diffuse texture exceeds 16 MiB limit")
        (tmp / "default.mtl").write_text(
            "newmtl HF_Diffuse\nKd 1 1 1\nKa 0.2 0.2 0.2\nmap_Kd diffuse.png\n",
            encoding="utf-8",
        )
        config_path = tmp / "config.json"
        import json

        config_path.write_text(
            json.dumps(
                {
                    "obj": str(obj_path),
                    "texture": str(texture_path),
                    "output": str(output),
                    "render_dir": str(render_dir) if render_dir else None,
                }
            ),
            encoding="utf-8",
        )
        script_path = tmp / "convert.py"
        script_path.write_text(_blender_script(), encoding="utf-8")
        subprocess.run(
            [
                str(blender),
                "--factory-startup",
                "--disable-autoexec",
                "--background",
                "--python-exit-code", "1",
                "--python", str(script_path),
            ],
            check=True,
            timeout=180,
            env={**os.environ, "HF_CONVERT_CONFIG": str(config_path), "PYTHONDONTWRITEBYTECODE": "1"},
        )

    print(f"Wrote {output} ({output.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

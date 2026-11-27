const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseStudioMiniatureGlb } = require("./studio-miniature-glb.js");

function makeGlb({
  uri = false,
  mode = 4,
  scale = [2, 1, 1],
  image = true,
  indices = [0, 1, 2],
  requiredExtension = false,
  alphaCutoff = 0.5,
  matrix = null,
} = {}) {
  const chunks = [],
    views = [],
    accessors = [];
  let offset = 0;
  function add(data, target) {
    const start = offset;
    chunks.push(data);
    offset += data.length;
    views.push({
      buffer: 0,
      byteOffset: start,
      byteLength: data.length,
      ...(target ? { target } : {}),
    });
    return views.length - 1;
  }
  function acc(data, type, count, componentType, view) {
    accessors.push({ bufferView: view, componentType, count, type });
    return accessors.length - 1;
  }
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const pview = add(new Uint8Array(positions.buffer), 34962),
    pa = acc(positions, "VEC3", 3, 5126, pview);
  const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]);
  const nview = add(new Uint8Array(normals.buffer), 34962),
    na = acc(normals, "VEC3", 3, 5126, nview);
  const uvs = new Float32Array([0, 0, 1, 0, 0, 1]);
  const uview = add(new Uint8Array(uvs.buffer), 34962),
    ua = acc(uvs, "VEC2", 3, 5126, uview);
  const inds = new Uint16Array(indices);
  const iview = add(new Uint8Array(inds.buffer), 34963),
    ia = acc(inds, "SCALAR", inds.length, 5123, iview);
  let im = null;
  if (image) {
    const png = new Uint8Array(24);
    png.set([137, 80, 78, 71, 13, 10, 26, 10]);
    png.set([0, 0, 0, 13], 8);
    png.set([73, 72, 68, 82], 12);
    new DataView(png.buffer).setUint32(16, 1);
    new DataView(png.buffer).setUint32(20, 1);
    const v = add(png);
    im = { bufferView: v, mimeType: "image/png" };
  }
  const gltf = {
    asset: { version: "2.0" },
    buffers: [
      {
        byteLength: offset,
        ...(uri ? { uri: "https://bad.invalid/model.bin" } : {}),
      },
    ],
    bufferViews: views,
    accessors,
    meshes: [
      {
        name: "mini",
        primitives: [
          {
            attributes: { POSITION: pa, NORMAL: na, TEXCOORD_0: ua },
            indices: ia,
            material: 0,
            mode,
          },
        ],
      },
    ],
    materials: [
      {
        alphaCutoff,
        pbrMetallicRoughness: {
          baseColorFactor: [0.2, 0.4, 0.6, 1],
          ...(image ? { baseColorTexture: { index: 0 } } : {}),
        },
      },
    ],
    nodes: [
      matrix ? { mesh: 0, matrix } : { mesh: 0, translation: [3, 4, 5], scale },
    ],
    scenes: [{ nodes: [0] }],
    scene: 0,
  };
  if (requiredExtension)
    gltf.extensionsRequired = ["KHR_draco_mesh_compression"];
  if (image) ((gltf.images = [im]), (gltf.textures = [{ source: 0 }]));
  const json = new TextEncoder().encode(JSON.stringify(gltf));
  const jp = (json.length + 3) & ~3,
    bp = (offset + 3) & ~3,
    total = 12 + 8 + jp + 8 + bp,
    out = new Uint8Array(total),
    dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jp, true);
  dv.setUint32(16, 0x4e4f534a, true);
  out.fill(32, 20, 20 + jp);
  out.set(json, 20);
  const bstart = 20 + jp;
  dv.setUint32(bstart, bp, true);
  dv.setUint32(bstart + 4, 0x004e4942, true);
  let cursor = bstart + 8;
  for (const c of chunks) {
    out.set(c, cursor);
    cursor += c.length;
  }
  return out;
}
test("parses static geometry, material, embedded image and bakes node transform", () => {
  const model = parseStudioMiniatureGlb(makeGlb());
  const mesh = model.meshes[0];
  assert.equal(mesh.name, "mini");
  assert.deepEqual([...mesh.positions.slice(0, 3)], [3, 4, 5]);
  assert.deepEqual([...mesh.positions.slice(3, 6)], [5, 4, 5]);
  assert.deepEqual([...mesh.uvs], [0, 0, 1, 0, 0, 1]);
  assert.deepEqual([...mesh.indices], [0, 1, 2]);
  [0.2, 0.4, 0.6, 1].forEach((v, i) =>
    assert.ok(Math.abs(mesh.material.baseColorFactor[i] - v) < 1e-6),
  );
  assert.deepEqual(
    [
      mesh.material.baseColorTexture.width,
      mesh.material.baseColorTexture.height,
    ],
    [1, 1],
  );
  assert.equal(mesh.material.baseColorTexture.mimeType, "image/png");
  assert.equal(model.vertexCount, 3);
});
test("rejects truncated headers, external buffers and non-triangle primitives", () => {
  assert.throws(() => parseStudioMiniatureGlb(new Uint8Array(10)), /file size/);
  assert.throws(
    () => parseStudioMiniatureGlb(makeGlb({ uri: true })),
    /external/,
  );
  assert.throws(
    () => parseStudioMiniatureGlb(makeGlb({ mode: 1 })),
    /triangle/,
  );
});
test("enforces resource ceilings and embedded image validation", () => {
  assert.throws(
    () => parseStudioMiniatureGlb(makeGlb(), { limits: { vertices: 2 } }),
    /accessor count/,
  );
  const bad = makeGlb({ image: false });
  const dv = new DataView(bad.buffer);
  dv.setUint32(8, bad.length - 4, true);
  assert.throws(() => parseStudioMiniatureGlb(bad), /header/);
});
test("uses the full 3D determinant for mirrored triangle winding", () => {
  const mesh = parseStudioMiniatureGlb(makeGlb({ scale: [2, 1, -1] }))
    .meshes[0];
  assert.deepEqual([...mesh.indices], [0, 2, 1]);
  assert.ok(mesh.normals.every((value) => Number.isFinite(value)));
});
test("rejects malformed index counts, required extensions, matrices and alpha cutoffs", () => {
  assert.throws(
    () => parseStudioMiniatureGlb(makeGlb({ indices: [0, 1] })),
    /divisible by 3/,
  );
  assert.throws(
    () => parseStudioMiniatureGlb(makeGlb({ requiredExtension: true })),
    /extensions/,
  );
  assert.throws(
    () =>
      parseStudioMiniatureGlb(
        makeGlb({ matrix: [1, 0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }),
      ),
    /affine/,
  );
  assert.throws(
    () => parseStudioMiniatureGlb(makeGlb({ alphaCutoff: 1.1 })),
    /alpha cutoff/,
  );
});
test("applies the independent index budget before allocating the index array", () => {
  assert.throws(
    () =>
      parseStudioMiniatureGlb(makeGlb(), {
        limits: { vertices: 3, indices: 2 },
      }),
    /accessor count/,
  );
});

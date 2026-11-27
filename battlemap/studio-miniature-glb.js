/* Strict, dependency-free GLB 2.0 reader for static miniature geometry. */
const GLB_MAGIC = 0x46546c67,
  GLB_VERSION = 2,
  JSON_CHUNK = 0x4e4f534a,
  BIN_CHUNK = 0x004e4942;
const DEFAULT_LIMITS = Object.freeze({
  fileBytes: 32 * 1024 * 1024,
  jsonBytes: 2 * 1024 * 1024,
  vertices: 500000,
  indices: 1500000,
  primitives: 256,
  nodes: 512,
  depth: 32,
  textureBytes: 16 * 1024 * 1024,
  textureDimension: 8192,
});
const COMPONENTS = {
  5120: { bytes: 1, get: "getInt8", min: -128, max: 127 },
  5121: { bytes: 1, get: "getUint8", min: 0, max: 255 },
  5122: { bytes: 2, get: "getInt16", min: -32768, max: 32767 },
  5123: { bytes: 2, get: "getUint16", min: 0, max: 65535 },
  5125: { bytes: 4, get: "getUint32", min: 0, max: 4294967295 },
  5126: { bytes: 4, get: "getFloat32" },
};
const TYPE_SIZE = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT2: 4,
  MAT3: 9,
  MAT4: 16,
};
function fail(message) {
  throw new Error(`Invalid GLB: ${message}`);
}
function integer(v, name, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isInteger(v) || v < min || v > max) fail(`${name} out of range`);
  return v;
}
function finiteArray(v, n, name) {
  if (!Array.isArray(v) || v.length !== n || !v.every(Number.isFinite))
    fail(`invalid ${name}`);
  return v;
}
function bytesOf(input) {
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input))
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  fail("input must be an ArrayBuffer or typed array");
}
function mul(a, b) {
  const o = new Float64Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++)
      for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
function nodeMatrix(node) {
  if (node.matrix) {
    if (node.translation || node.rotation || node.scale)
      fail("node has matrix and TRS");
    const matrix = new Float64Array(
      finiteArray(node.matrix, 16, "node matrix"),
    );
    if (
      matrix[3] !== 0 ||
      matrix[7] !== 0 ||
      matrix[11] !== 0 ||
      matrix[15] !== 1
    )
      fail("node matrix must be affine");
    return matrix;
  }
  const t = node.translation ?? [0, 0, 0],
    q = node.rotation ?? [0, 0, 0, 1],
    s = node.scale ?? [1, 1, 1];
  finiteArray(t, 3, "translation");
  finiteArray(q, 4, "rotation");
  finiteArray(s, 3, "scale");
  const [x, y, z, w] = q,
    l = Math.hypot(x, y, z, w);
  if (l < 1e-12) fail("zero node quaternion");
  const X = x / l,
    Y = y / l,
    Z = z / l,
    W = w / l;
  return new Float64Array([
    (1 - 2 * (Y * Y + Z * Z)) * s[0],
    2 * (X * Y + Z * W) * s[0],
    2 * (X * Z - Y * W) * s[0],
    0,
    2 * (X * Y - Z * W) * s[1],
    (1 - 2 * (X * X + Z * Z)) * s[1],
    2 * (Y * Z + X * W) * s[1],
    0,
    2 * (X * Z + Y * W) * s[2],
    2 * (Y * Z - X * W) * s[2],
    (1 - 2 * (X * X + Y * Y)) * s[2],
    0,
    t[0],
    t[1],
    t[2],
    1,
  ]);
}
function determinant3(m) {
  return (
    m[0] * (m[5] * m[10] - m[9] * m[6]) -
    m[4] * (m[1] * m[10] - m[9] * m[2]) +
    m[8] * (m[1] * m[6] - m[5] * m[2])
  );
}
function point(m, x, y, z, w = 1) {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12] * w,
    m[1] * x + m[5] * y + m[9] * z + m[13] * w,
    m[2] * x + m[6] * y + m[10] * z + m[14] * w,
  ];
}
function normalMatrix(m) {
  const a = m[0],
    b = m[4],
    c = m[8],
    d = m[1],
    e = m[5],
    f = m[9],
    g = m[2],
    h = m[6],
    i = m[10],
    A = e * i - f * h,
    B = f * g - d * i,
    C = d * h - e * g,
    det = a * A + b * B + c * C;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12)
    fail("singular node transform");
  return [
    A / det,
    (c * h - b * i) / det,
    (b * f - c * e) / det,
    B / det,
    (a * i - c * g) / det,
    (c * d - a * f) / det,
    C / det,
    (b * g - a * h) / det,
    (a * e - b * d) / det,
  ];
}
function imageDimensions(data, mime, limits) {
  let w = 0,
    h = 0;
  if (mime === "image/png") {
    if (
      data.length < 24 ||
      data[0] !== 137 ||
      String.fromCharCode(...data.slice(1, 4)) !== "PNG" ||
      String.fromCharCode(...data.slice(12, 16)) !== "IHDR"
    )
      fail("invalid PNG image");
    const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
    w = v.getUint32(16);
    h = v.getUint32(20);
  } else {
    if (data.length < 4 || data[0] !== 255 || data[1] !== 216)
      fail("invalid JPEG image");
    let p = 2;
    while (p + 4 <= data.length) {
      if (data[p++] !== 255) {
        continue;
      }
      let marker = data[p++];
      while (marker === 255) marker = data[p++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (
        [0xd8, 0x01, 0xd0, 0xd1, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7].includes(
          marker,
        )
      )
        continue;
      const n = (data[p] << 8) | data[p + 1];
      if (n < 2 || p + n > data.length) fail("invalid JPEG segment");
      if (
        [
          0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd,
          0xce, 0xcf,
        ].includes(marker)
      ) {
        h = (data[p + 3] << 8) | data[p + 4];
        w = (data[p + 5] << 8) | data[p + 6];
        break;
      }
      p += n;
    }
  }
  if (!w || !h || w > limits.textureDimension || h > limits.textureDimension)
    fail("texture dimensions exceed limit or are invalid");
  return { width: w, height: h };
}
function parseStudioMiniatureGlb(input, options = {}) {
  const lim = { ...DEFAULT_LIMITS, ...options.limits },
    bytes = bytesOf(input);
  if (bytes.byteLength < 20 || bytes.byteLength > lim.fileBytes)
    fail("file size outside limit");
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    dv.getUint32(0, true) !== GLB_MAGIC ||
    dv.getUint32(4, true) !== GLB_VERSION ||
    dv.getUint32(8, true) !== bytes.length
  )
    fail("bad GLB header");
  let p = 12,
    jsonBytes = null,
    bin = null,
    seenJson = false,
    seenBin = false;
  while (p < bytes.length) {
    if (p + 8 > bytes.length) fail("truncated chunk header");
    const n = dv.getUint32(p, true),
      type = dv.getUint32(p + 4, true);
    p += 8;
    if (n === 0 || p + n > bytes.length) fail("invalid chunk length");
    if (type === JSON_CHUNK && !seenJson) {
      if (n > lim.jsonBytes) fail("JSON exceeds limit");
      jsonBytes = bytes.subarray(p, p + n);
      seenJson = true;
    } else if (type === BIN_CHUNK && !seenBin && seenJson) {
      bin = bytes.subarray(p, p + n);
      seenBin = true;
    } else fail("unsupported, duplicate, or out-of-order chunk");
    p += n;
  }
  if (!jsonBytes) fail("missing JSON chunk");
  let gltf;
  try {
    gltf = JSON.parse(
      new TextDecoder("utf-8", { fatal: true })
        .decode(jsonBytes)
        .replace(/[\u0000\u0020]+$/g, ""),
    );
  } catch {
    fail("invalid JSON");
  }
  if (gltf.asset?.version !== "2.0") fail("asset version must be 2.0");
  if (gltf.extensionsRequired?.length)
    fail("required glTF extensions are unsupported");
  if ((gltf.buffers ?? []).length > 1)
    fail("only one embedded buffer is supported");
  if (gltf.buffers?.length) {
    const b = gltf.buffers[0];
    if (b.uri) fail("external/data URI buffers are not supported");
    if (
      !bin ||
      integer(b.byteLength, "buffer byteLength") > bin.length ||
      bin.length - b.byteLength > 3
    )
      fail("invalid embedded buffer length");
  } else if (bin?.length) fail("unexpected binary chunk");
  const views = gltf.bufferViews ?? [],
    accessors = gltf.accessors ?? [];
  function accessor(index, kind, maxCount = lim.vertices) {
    const a =
      accessors[integer(index, "accessor index", 0, accessors.length - 1)];
    if (a.sparse !== undefined || a.bufferView === undefined)
      fail("sparse or implicit accessors unsupported");
    const view =
        views[integer(a.bufferView, "bufferView index", 0, views.length - 1)],
      comp = COMPONENTS[a.componentType],
      size = TYPE_SIZE[a.type];
    if (!comp || !size) fail("unsupported accessor type");
    const count = integer(a.count, "accessor count", 1, maxCount);
    if (
      kind === "POSITION" &&
      (a.type !== "VEC3" || a.componentType !== 5126 || a.normalized)
    )
      fail("POSITION must be float VEC3");
    if (
      kind === "NORMAL" &&
      (a.type !== "VEC3" || a.componentType !== 5126 || a.normalized)
    )
      fail("NORMAL must be float VEC3");
    if (
      kind === "TEXCOORD_0" &&
      (a.type !== "VEC2" || ![5126, 5121, 5123].includes(a.componentType))
    )
      fail("unsupported TEXCOORD_0");
    const stride = view.byteStride ?? comp.bytes * size;
    if (stride < comp.bytes * size || stride % comp.bytes)
      fail("invalid accessor stride");
    const start =
        integer(view.byteOffset ?? 0, "view offset") +
        integer(a.byteOffset ?? 0, "accessor offset"),
      end = start + (count - 1) * stride + comp.bytes * size;
    if (
      !bin ||
      view.buffer !== 0 ||
      integer(view.byteLength, "view byteLength") +
        integer(view.byteOffset ?? 0, "view offset") >
        bin.length ||
      end > integer(view.byteOffset ?? 0, "view offset") + view.byteLength
    )
      fail("accessor outside embedded buffer");
    const bd = new DataView(bin.buffer, bin.byteOffset, bin.byteLength),
      out = new Float64Array(count * size);
    for (let r = 0; r < count; r++)
      for (let c = 0; c < size; c++) {
        let v = bd[comp.get](start + r * stride + c * comp.bytes, true);
        if (a.normalized && a.componentType !== 5126)
          v = comp.min < 0 ? Math.max(v / comp.max, -1) : v / comp.max;
        if (!Number.isFinite(v)) fail("non-finite accessor value");
        out[r * size + c] = v;
      }
    return { values: out, count, size, componentType: a.componentType };
  }
  const images = [];
  let imageBytes = 0;
  for (const im of gltf.images ?? []) {
    if (
      im.uri ||
      im.bufferView === undefined ||
      !["image/png", "image/jpeg"].includes(im.mimeType)
    )
      fail("images must be embedded PNG/JPEG bufferViews");
    const v =
        views[integer(im.bufferView, "image bufferView", 0, views.length - 1)],
      off = integer(v.byteOffset ?? 0, "image offset"),
      n = integer(v.byteLength, "image length");
    imageBytes += n;
    if (
      v.buffer !== 0 ||
      !bin ||
      n > lim.textureBytes ||
      imageBytes > lim.textureBytes ||
      off + n > bin.length
    )
      fail("image outside buffer or over limit");
    const data = bin.slice(off, off + n),
      dims = imageDimensions(data, im.mimeType, lim);
    images.push({ mimeType: im.mimeType, data, ...dims });
  }
  const textures = (gltf.textures ?? []).map((t) => {
    const source = integer(t.source, "texture source", 0, images.length - 1);
    return images[source];
  });
  const materials = (gltf.materials ?? []).map((m) => {
    const pbr = m.pbrMetallicRoughness ?? {},
      factor = finiteArray(
        pbr.baseColorFactor ?? [1, 1, 1, 1],
        4,
        "baseColorFactor",
      );
    if (factor.some((v) => v < 0 || v > 1)) fail("base color outside 0..1");
    let texture = null;
    if (pbr.baseColorTexture) {
      if (
        pbr.baseColorTexture.texCoord !== undefined &&
        pbr.baseColorTexture.texCoord !== 0
      )
        fail("only TEXCOORD_0 textures supported");
      texture =
        textures[
          integer(
            pbr.baseColorTexture.index,
            "texture index",
            0,
            textures.length - 1,
          )
        ];
    }
    const alphaMode = m.alphaMode ?? "OPAQUE";
    if (!["OPAQUE", "MASK", "BLEND"].includes(alphaMode))
      fail("invalid alpha mode");
    const alphaCutoff = m.alphaCutoff ?? 0.5;
    if (!Number.isFinite(alphaCutoff) || alphaCutoff < 0 || alphaCutoff > 1)
      fail("invalid alpha cutoff");
    return {
      name: typeof m.name === "string" ? m.name : "",
      baseColorFactor: new Float32Array(factor),
      baseColorTexture: texture,
      alphaMode,
      alphaCutoff,
      doubleSided: !!m.doubleSided,
      metallicFactor: pbr.metallicFactor ?? 1,
      roughnessFactor: pbr.roughnessFactor ?? 1,
    };
  });
  const meshes = gltf.meshes ?? [];
  if (meshes.length > lim.primitives) fail("too many meshes");
  let totalV = 0,
    totalI = 0,
    primitives = 0;
  const output = [];
  function visit(nodeIndex, parent, stack) {
    integer(nodeIndex, "node index", 0, (gltf.nodes ?? []).length - 1);
    if (stack.has(nodeIndex)) fail("node cycle");
    if (stack.size >= lim.depth) fail("node depth exceeds limit");
    const node = gltf.nodes[nodeIndex],
      world = mul(parent, nodeMatrix(node)),
      next = new Set(stack);
    next.add(nodeIndex);
    if (node.mesh !== undefined) {
      const mesh =
        meshes[integer(node.mesh, "mesh index", 0, meshes.length - 1)];
      for (const prim of mesh.primitives ?? []) {
        if (++primitives > lim.primitives) fail("too many primitives");
        if ((prim.mode ?? 4) !== 4) fail("only triangle primitives supported");
        const attrs = prim.attributes ?? {},
          pos = accessor(attrs.POSITION, "POSITION"),
          norm =
            attrs.NORMAL === undefined
              ? null
              : accessor(attrs.NORMAL, "NORMAL"),
          uv =
            attrs.TEXCOORD_0 === undefined
              ? null
              : accessor(attrs.TEXCOORD_0, "TEXCOORD_0");
        if (
          (norm && norm.count !== pos.count) ||
          (uv && uv.count !== pos.count)
        )
          fail("attribute counts differ");
        totalV += pos.count;
        if (totalV > lim.vertices) fail("vertex budget exceeded");
        const positions = new Float32Array(pos.count * 3),
          normals = new Float32Array(pos.count * 3),
          uvs = uv ? new Float32Array(pos.count * 2) : null,
          nmat = normalMatrix(world);
        for (let i = 0; i < pos.count; i++) {
          const pp = point(world, ...pos.values.slice(i * 3, i * 3 + 3));
          if (
            !pp.every(Number.isFinite) ||
            pp.some((value) => !Number.isFinite(Math.fround(value)))
          )
            fail("transformed position exceeds float32 range");
          positions.set(pp, i * 3);
          if (norm) {
            let x = norm.values[i * 3],
              y = norm.values[i * 3 + 1],
              z = norm.values[i * 3 + 2],
              nx = nmat[0] * x + nmat[3] * y + nmat[6] * z,
              ny = nmat[1] * x + nmat[4] * y + nmat[7] * z,
              nz = nmat[2] * x + nmat[5] * y + nmat[8] * z,
              l = Math.hypot(nx, ny, nz) || 1;
            if (![nx / l, ny / l, nz / l].every(Number.isFinite))
              fail("transformed normal is not finite");
            normals.set([nx / l, ny / l, nz / l], i * 3);
          }
          if (uv) uvs.set(uv.values.slice(i * 2, i * 2 + 2), i * 2);
        }
        let indices;
        if (prim.indices !== undefined) {
          const a = accessor(prim.indices, "INDICES", lim.indices);
          if (a.size !== 1 || ![5121, 5123, 5125].includes(a.componentType))
            fail("indices must be unsigned scalar");
          if (a.count % 3) fail("triangle index count must be divisible by 3");
          indices = new Uint32Array(a.count);
          for (let i = 0; i < a.count; i++) {
            const ix = a.values[i];
            if (ix >= pos.count) fail("index exceeds vertex count");
            indices[i] = ix;
          }
        } else {
          if (pos.count % 3)
            fail("unindexed triangle vertex count must be divisible by 3");
          indices = Uint32Array.from({ length: pos.count }, (_, i) => i);
        }
        totalI += indices.length;
        if (totalI > lim.indices) fail("index budget exceeded");
        if (determinant3(world) < 0)
          for (let i = 0; i < indices.length; i += 3)
            [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
        const material =
          prim.material === undefined
            ? {
                name: "",
                baseColorFactor: new Float32Array([1, 1, 1, 1]),
                baseColorTexture: null,
                alphaMode: "OPAQUE",
                alphaCutoff: 0.5,
                doubleSided: false,
                metallicFactor: 1,
                roughnessFactor: 1,
              }
            : materials[
                integer(
                  prim.material,
                  "material index",
                  0,
                  materials.length - 1,
                )
              ];
        output.push({
          name: mesh.name ?? "",
          positions,
          normals: norm ? normals : null,
          uvs,
          indices,
          material,
        });
      }
    }
    for (const child of node.children ?? []) visit(child, world, next);
  }
  const nodes = gltf.nodes ?? [];
  if (nodes.length > lim.nodes) fail("too many nodes");
  const scene = gltf.scenes?.[gltf.scene ?? 0];
  if (scene) {
    for (const root of scene.nodes ?? [])
      visit(
        root,
        new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
        new Set(),
      );
  } else if (nodes.length) {
    const children = new Set(nodes.flatMap((n) => n.children ?? []));
    for (let i = 0; i < nodes.length; i++)
      if (!children.has(i))
        visit(
          i,
          new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
          new Set(),
        );
  }
  if (!output.length) fail("no triangle geometry found");
  return { meshes: output, images, vertexCount: totalV, indexCount: totalI };
}
if (typeof module === "object" && module.exports)
  module.exports = { parseStudioMiniatureGlb, DEFAULT_LIMITS };

/* Battlemap Studio — Map Composer core.
 * Independent, non-destructive map-piece model. No DOM or renderer dependencies.
 * Integration with the scene renderer, asset manager and room sync is deliberately
 * separate so existing scene-floor behavior remains unchanged.
 */
(function (global) {
  'use strict';
  const SCHEMA = 1;
  const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
  const id = () => (global.crypto && typeof global.crypto.randomUUID === 'function')
    ? global.crypto.randomUUID()
    : 'map-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  const copy = value => JSON.parse(JSON.stringify(value));
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  function normalizePoint(point) {
    assert(Array.isArray(point) && point.length >= 2, 'Crop point must be [u,v].');
    const x = finite(point[0], NaN), y = finite(point[1], NaN);
    assert(Number.isFinite(x) && Number.isFinite(y), 'Crop point coordinates must be finite.');
    return [clamp(x, 0, 1), clamp(y, 0, 1)];
  }
  function normalizeCrop(input) {
    const crop = input || { type: 'rect', x: 0, y: 0, width: 1, height: 1 };
    if (crop.type === 'bezier') {
      assert(Array.isArray(crop.segments) && crop.segments.length >= 2, 'Bézier crop needs at least two segments.');
      // Closed path: first anchor is start; each subsequent cubic ends at next anchor.
      return { type: 'bezier', segments: crop.segments.map(segment => ({
        anchor: normalizePoint(segment.anchor),
        in: normalizePoint(segment.in || segment.anchor),
        out: normalizePoint(segment.out || segment.anchor)
      })) };
    }
    assert(crop.type === 'rect', 'Unknown crop type.');
    const x = clamp(finite(crop.x, 0), 0, 1), y = clamp(finite(crop.y, 0), 0, 1);
    return { type: 'rect', x, y,
      width: clamp(finite(crop.width, 1), 0.0001, 1 - x),
      height: clamp(finite(crop.height, 1), 0.0001, 1 - y) };
  }
  function normalizeCalibration(value) {
    if (!value) return null;
    const c = {};
    for (const key of ['ox', 'oy', 'xx', 'xy', 'yx', 'yy']) {
      c[key] = Number(value[key]);
      assert(Number.isFinite(c[key]), 'Invalid piece calibration: ' + key);
    }
    assert(Math.abs(c.xx * c.yy - c.xy * c.yx) > 1e-8, 'Piece calibration must be invertible.');
    return c;
  }
  function normalizePiece(value) {
    assert(value && typeof value === 'object', 'Map piece must be an object.');
    assert(typeof value.assetId === 'string' && value.assetId.trim(), 'Map piece requires an existing asset ID.');
    const width = finite(value.width, 25), depth = finite(value.depth, 25);
    assert(width > 0 && depth > 0, 'Map piece dimensions must be positive.');
    return {
      id: String(value.id || id()), assetId: value.assetId,
      name: String(value.name || 'Map piece').slice(0, 120),
      x: finite(value.x, 0), y: finite(value.y, 0), z: finite(value.z, 0),
      width, depth, rotation: finite(value.rotation, 0),
      crop: normalizeCrop(value.crop),
      calibration: normalizeCalibration(value.calibration),
      opacity: clamp(finite(value.opacity, 1), 0, 1),
      order: Math.trunc(finite(value.order, 0)),
      visible: value.visible !== false, locked: value.locked === true
    };
  }
  function worldFromLocal(piece, u, v) {
    const a = piece.rotation * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    const dx = (u - 0.5) * piece.width, dy = (v - 0.5) * piece.depth;
    return [piece.x + dx * c - dy * s, piece.y + dx * s + dy * c, piece.z];
  }
  function localFromWorld(piece, x, y) {
    const a = -piece.rotation * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    const dx = x - piece.x, dy = y - piece.y;
    return [0.5 + (dx * c - dy * s) / piece.width, 0.5 + (dx * s + dy * c) / piece.depth];
  }
  function createStore(initial) {
    let pieces = (initial || []).map(normalizePiece);
    assert(new Set(pieces.map(p => p.id)).size === pieces.length, 'Duplicate map-piece IDs.');
    const subscribers = new Set();
    const emit = (kind, pieceId) => subscribers.forEach(fn => fn({ kind, pieceId, pieces: snapshot() }));
    const snapshot = () => copy(pieces);
    const locate = pieceId => pieces.findIndex(piece => piece.id === pieceId);
    return Object.freeze({
      list: snapshot,
      get: pieceId => { const p = pieces[locate(pieceId)]; return p ? copy(p) : null; },
      subscribe(fn) { assert(typeof fn === 'function', 'Subscriber must be a function.'); subscribers.add(fn); return () => subscribers.delete(fn); },
      add(input) {
        const piece = normalizePiece(input);
        assert(locate(piece.id) < 0, 'Duplicate map-piece ID.');
        pieces.push(piece); emit('add', piece.id); return copy(piece);
      },
      update(pieceId, patch) {
        const index = locate(pieceId);
        assert(index >= 0, 'Map piece not found.');
        assert(!pieces[index].locked, 'Unlock map piece before editing.');
        assert(!('id' in patch) || patch.id === pieceId, 'Map-piece ID cannot change.');
        const next = normalizePiece({ ...pieces[index], ...patch, id: pieceId });
        pieces[index] = next; emit('update', pieceId); return copy(next);
      },
      remove(pieceId) {
        const index = locate(pieceId);
        if (index < 0) return false;
        assert(!pieces[index].locked, 'Unlock map piece before deleting.');
        pieces.splice(index, 1); emit('remove', pieceId); return true;
      },
      setLocked(pieceId, locked) {
        const index = locate(pieceId);
        assert(index >= 0, 'Map piece not found.');
        pieces[index] = { ...pieces[index], locked: Boolean(locked) };
        emit('lock', pieceId);
      },
      replace(next) {
        const normalized = next.map(normalizePiece);
        assert(new Set(normalized.map(p => p.id)).size === normalized.length, 'Duplicate map-piece IDs.');
        pieces = normalized; emit('replace', null);
      },
      serialize: () => ({ schema: SCHEMA, pieces: snapshot() })
    });
  }
  function deserialize(payload) {
    if (!payload) return createStore([]);
    assert(payload.schema === SCHEMA && Array.isArray(payload.pieces), 'Unsupported Map Composer data.');
    return createStore(payload.pieces);
  }
  global.BattlemapMapComposer = Object.freeze({
    version: '0.1.0', schema: SCHEMA, normalizePiece, normalizeCrop,
    worldFromLocal, localFromWorld, createStore, deserialize
  });
})(window);

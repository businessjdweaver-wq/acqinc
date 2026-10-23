/* RQV2 Adventure Path — static campaign rules, v1.
 * No network calls, ticket spending, or client-side reward claims.
 * Every new village path resets its own rank gate: background-only until
 * its finale is cleared; class-rank heroes are then eligible in that path.
 */
(function (root) {
  'use strict';
  const PATHS = Object.freeze({
    village_01: {
      id: 'village_01',
      title: 'Trouble in the Village',
      chapter: 1,
      startingRank: 'background',
      finaleId: 'crisis',
      nextPathId: 'outskirts_01',
      nodes: [
        { id: 'village', type: 'story', name: 'Village Square', requiresAny: [], free: true, x: 0.5, y: 0.08 },
        { id: 'harvest', type: 'puzzle', name: 'Harvest Fields', encounterId: 'harvest', requiresAny: ['village'], x: 0.24, y: 0.28 },
        { id: 'merchant', type: 'combat', name: "Merchant's Shop", encounterId: 'shopkeeper', requiresAny: ['village'], x: 0.76, y: 0.28 },
        { id: 'granary', type: 'combat', name: 'Village Granary', encounterId: 'rats', requiresAny: ['harvest'], x: 0.24, y: 0.55 },
        { id: 'lore', type: 'puzzle', name: 'Old Archives', encounterId: 'lore', requiresAny: ['merchant'], x: 0.76, y: 0.55 },
        { id: 'crisis', type: 'finale', name: 'Village Crisis', encounterId: null, requiresAny: ['granary', 'lore'], x: 0.5, y: 0.82 }
      ]
    },
    outskirts_01: {
      id: 'outskirts_01',
      title: 'The Outskirts',
      chapter: 2,
      requiresFinale: { pathId: 'village_01', nodeId: 'crisis' },
      nodes: []
    }
  });
  function completionKey(pathId, nodeId) { return pathId + ':' + nodeId; }
  function status(pathId, completedKeys) {
    const path = PATHS[pathId];
    if (!path) throw new Error('Unknown adventure path: ' + pathId);
    const completed = new Set(completedKeys || []);
    const chapterOpen = !path.requiresFinale ||
      completed.has(completionKey(path.requiresFinale.pathId, path.requiresFinale.nodeId));
    return path.nodes.map(node => {
      const done = completed.has(completionKey(pathId, node.id));
      const unlocked = chapterOpen && (!node.requiresAny.length ||
        node.requiresAny.some(id => completed.has(completionKey(pathId, id))));
      return { id: node.id, state: done ? 'completed' : unlocked ? 'available' : 'locked' };
    });
  }
  function eligibleParty(pathId, completedKeys, members) {
    const path = PATHS[pathId];
    if (!path) return { ok: false, reason: 'Unknown adventure path' };
    const cleared = new Set(completedKeys || []).has(completionKey(pathId, path.finaleId));
    if (!Array.isArray(members) || members.length !== 3 || members.some(m => !m))
      return { ok: false, reason: 'Choose three party members' };
    // Background = archetype 0–5; class rank = archetype 6+.
    if (path.startingRank === 'background' && !cleared &&
        members.some(m => !Number.isInteger(Number(m.archetype)) || Number(m.archetype) >= 6))
      return { ok: false, reason: 'Village encounters require three background-rank characters until the village finale is completed' };
    return { ok: true };
  }
  root.RQV2AdventurePath = Object.freeze({ paths: PATHS, status, eligibleParty, completionKey });
})(typeof window !== 'undefined' ? window : globalThis);

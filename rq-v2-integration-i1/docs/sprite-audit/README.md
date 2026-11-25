# Playable sprite audit and Corvin pilot

Reviewed main at `18cea9fe5294a9e5b88b224fd30cbdba7f87f0fd` (application build `I1.16.264`). The catalog and combat sprite roster agree on 24 playable archetypes. Six are one-star and 18 are two-star. The three-star design notes describe future characters. Grim and Hester have PNGs and do not appear in the playable catalog.

The three style references are Alda, Pip, and Tor. They establish compact three-quarter poses, large readable heads, planted boots, warm broken outlines, and selective texture on cloth, leather, and metal. They differ in canvas size, so the audit compares apparent pixel density at display scale. All three original PNGs were retrieved and inspected. Their Git blob SHAs match the pinned tree.

## Contact sheets

Each sheet repeats the three references. Sprites are cropped for display using the alpha ≥80 silhouette and scaled with nearest-neighbor sampling to the same 157-pixel height, aligned at the baseline. Hair, headgear, and equipment that extend the silhouette remain in view. This is a visual comparison proxy for body height, especially for raised equipment. The pilot comparison uses the same method at 180 pixels.

- [Batch 1 · One-star roster](roster-1.png)
- [Batch 2 · Orin through Morrow](roster-2.png)
- [Batch 3 · Kael through Aster](roster-3.png)
- [Batch 4 · Vega, Rusk, Kestrel, and legacy variants](roster-4.png)
- [Corvin · before and pilot](pilot-comparison.png)

## Inventory

Asset paths are relative to `rq-v2-integration-i1/assets/sprites/`. Dimensions are the original PNG canvas, in pixels. Classification is based on the active sprite. Every active PNG decoded and has both transparent and opaque pixels. A compliant decision means leave the current asset in place.

| ID | Character | Background | Tier | Active PNG | Dimensions | Classification and action |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | Mira · Scholar | Sage | 1 | `clean/rqv2-mira-idle.png` | 224 × 296 | Compliant. Magenta curls, magnifier, compact boots and patterned fabric read clearly. |
| 1 | Tobin · Farmer | Folk Hero | 1 | `clean/rqv2-tobin-idle.png` | 268 × 296 | Compliant. Straw, broad shoes, pitchfork and mastiff retain their separate shapes. |
| 2 | Lark · Entertainer | Entertainer | 1 | `clean/rqv2-lark-idle.png` | 212 × 296 | Compliant. Warm lattice shading, simplified face and lute read at the reference scale. |
| 3 | Sable · Locksmith | Criminal / Guild Artisan | 1 | `clean/rqv2-sable-idle.png` | 236 × 280 | Compliant. Hood, broad shoes, and gold key ring remain distinct. |
| 4 | Bran · Veteran | Soldier | 1 | `clean/rqv2-bran-idle.png` | 244 × 296 | Compliant. Large bearded profile, stance and textured round shield fit the set. |
| 5 | Nessa · Wayfarer | Outlander | 1 | `clean/rqv2-nessa-idle.png` | 200 × 280 | Compliant. Red hair, green hood and compass stay legible on a compact figure. |
| 6 | Orin · Artificer | Guild Artisan | 2 | `clean/rqv2-orin-idle.png` | 960 × 1200 | Minor correction. Consolidate tiny highlights and soften cooler outlines. Retain goggles, wrench, and mechanical pack. |
| 7 | Pip · Swarmkeeper | Outlander | 2 | `clean/rqv2-pip-idle.png` | 288 × 296 | Compliant. Canonical. Preserve the rat companions, goggles, and exact PNG. |
| 8 | Vex · Saboteur | Criminal | 2 | `clean/rqv2-vex-idle.png` | 960 × 976 | Minor correction. Break up smooth cloak and face shading with intentional pixel clusters. Keep the hood and lit charge. |
| 9 | Alda · Warden | Soldier | 2 | `clean/rqv2-alda-idle.png` | 272 × 296 | Compliant. Canonical. Preserve the plate armor, blue shield, and exact PNG. |
| 10 | Iris · Chronomancer | Sage | 2 | `clean/rqv2-iris-idle.png` | 212 × 280 | Compliant. Strong face silhouette and hourglass against a balanced plum-and-gold costume. |
| 11 | Elowen · Illusionist | Charlatan | 2 | `clean/rqv2-elowen-idle.png` | 264 × 296 | Compliant. Blue illusion reads separately from the pink hair, robes, and planted boots. |
| 12 | Seren · Twilight Cleric | Acolyte | 2 | `clean/rqv2-seren-idle.png` | 272 × 296 | Compliant. Lantern, hood and wide stance stay clear under textured purple-and-gold shading. |
| 13 | Morrow · Fungus Druid | Hermit | 2 | `clean/rqv2-morrow-idle.png` | 268 × 296 | Compliant. Warm grouped fungi and foliage preserve a distinct mushroom silhouette. The roster title is Shroomkeeper. |
| 14 | Tor · Juggernaut Barbarian | Outlander | 2 | `clean/rqv2-tor-idle.png` | 960 × 912 | Compliant. Canonical. Preserve the broad frame, hammer, and exact PNG. |
| 15 | Kael · Astral Self Monk | Hermit | 2 | `clean/rqv2-kael-idle.png` | 848 × 1184 | Minor correction. Compact the upright stance and simplify layered blue highlights. Keep the facial identity and astral arms. |
| 16 | Rook · Battle Master Fighter | Soldier | 2 | `clean/rqv2-rook-idle.png` | 240 × 296 | Compliant. Broad grounded boots, restrained leather detail and readable fighter silhouette. |
| 17 | Malvek · Fiend Warlock | Charlatan | 2 | `clean/rqv2-malvek-idle.png` | 264 × 296 | Compliant. Warm red cloth and flame staff stay distinct while retaining large head and planted stance. |
| 18 | Corvin · Whispers Bard | Entertainer | 2 | `clean/corvin_final_transparent.png` | 187 × 208 | Regeneration required. Thin upright body, strong dark contour and flat bright masses need a new treatment. Preserve skin tone, purple coils, turquoise accents, outfit, and bowed instrument. First pilot held. |
| 19 | Merrix Duran · Wild Magic Sorcerer | Sage | 2 | `clean/rqv2-merrix-idle.png` | 41 × 68 | Regeneration required. Narrow vertical costume and high-contrast stacked jewels read too coarse. Keep pale swept hair, vivid gems and distinctive outfit. |
| 20 | Aster · Oath of the Watchers Paladin | Acolyte | 2 | `clean/rqv2-aster-idle.png` | 1281 × 1227 | Minor correction. Larger readable head clusters and fewer fine armor glints would bring the grounded pose closer. Keep eyes, blade, hair, and blue-and-gold armor. |
| 21 | Vega · Circle of Stars Druid | Hermit | 2 | `clean/rqv2-vega-idle.png` | 1223 × 1286 | Compliant. Compact stance, star cape and staff read clearly at the reference scale. |
| 22 | Rusk · Beast Master Ranger | Outlander | 2 | `clean/rqv2-rusk-idle.png` | 1312 × 1199 | Compliant. Compact spear bearer and crocodilian companion have distinct silhouettes and warm clustered shading. |
| 23 | Kestrel · Soulknife Rogue | Criminal | 2 | `clean/rqv2-kestrel-idle.png` | 868 × 953 | Minor correction. Reduce smooth bright hair clusters and excess psychic glow. Preserve the face markings, hair shape, and blade. |

## Runtime and manifest reconciliation

- The active combat renderer draws the clean PNGs, using `corvin_final_transparent.png` for Corvin and `rqv2-merrix-idle.png` for Merrix Duran. Cloud Collection uses the same clean naming convention and Corvin special case and explicitly normalizes the Merrix Duran slug. Character Manager uses those filenames for its 20-name portrait allowlist and displays fallback icons for Aster, Vega, Rusk, and Kestrel. The lab also exposes original and prepared variants.
- The roster manifest records 17 of 24 playable IDs. Its null entries 4–15 have live PNGs, and its paths for Lark, Sable, and Nessa refer to legacy root variants. The clean manifest lists eight preparation outputs. It describes the older prepared sizes for Kael, Orin, Tor, and Vex, while the active files now have the dimensions above. The clean Lark, Nessa, and Sable legacy alternates are 46 × 59, 46 × 55, and 46 × 54.
- The approved one-star base64s and raw PNGs on disk are source or lab variants. Other Corvin idle and portrait files do not replace his active runtime path. The Merrix portrait file has the same bytes as his idle file despite the roster manifest specifying a portrait crop. Treat the preparation manifest as tooling output. Reconcile stale roster records separately or when an approved replacement makes a manifest change necessary.
- The preparation script operates on source variants and can rewrite clean outputs and its manifest. Running it wholesale would risk replacing canonical or compliant art. It was inspected and left untouched.

## Pilot and Sprite Workshop handoff

One ImageGen edit received the local, hash-verified Alda, Pip and Tor originals plus the existing Corvin PNG as explicit image references. The call returned a [separately staged transparent PNG](corvin-pilot.png). The output closely tracks the current Corvin's hair, costume, colors and instrument, but the body remains narrow and tall, the face and boots use large flat highlights, and dark contours are more uniform than in the exemplars. There are also faint alpha flecks outside the main subject. Hold this candidate. The 1189 × 1323 PNG has a main alpha ≥80 bounding box of (244, 27)–(943, 1251), while low alpha extends to the canvas edges. A successful reference-bearing tool call establishes the supplied inputs, without independently isolating the influence of each reference.

1. **First Workshop batch.** Corvin redraw, Merrix redraw, Kael touch-up, and Kestrel touch-up. Attach all three canonical PNGs and the character's active original to each individual edit. For Corvin, ask for a wider planted stance, shortened torso, warmer broken outline and shaded fabric clusters. For Merrix, preserve the gems and wild-magic identity while simplifying jewelry and introducing grouped texture at the canonical density. For Kael and Kestrel, retain their distinctive anatomy and keep effects secondary to the figure.
2. **Second Workshop batch.** Orin, Vex and Aster. Keep the characteristic equipment in the silhouette. Give Orin tighter highlight clusters, Vex richer shadow clusters, and Aster clearer head-to-body proportions without introducing finer ornament.
3. **Approval and integration.** Stage one transparent sprite per character and reserve comparisons for the owner before replacing originals. Verify opaque bounds and alpha fringe at 1×. Check roster tile and profile clipping plus rear, center and front combat scale and feet alignment. Preserve runtime IDs, filenames and unaffected assets. Update manifests only where integration requires it and synchronize the next visible build at that point.

## Verification

The 24 catalog IDs matched the combat roster and all mapped PNGs decoded. Sprite files, manifests, and app behavior were untouched in this PR. On the pinned build both Node suites passed with `node --test card-mechanics.test.js conditions.test.js`, and `node tools/check-build-version.js` confirmed five matching `I1.16.264` markers. Browser launch was blocked by the environment sandbox. Roster/profile cropping and combat formation rendering remain unverified.

# Tutorial island overhaul

## Build now
- Expand the starter island to roughly four times its land area, with readable pale terrain, grass patches, hills, trails, and solid trees.
- Place a wooden fortress beyond the first hill, with tents, a campfire, guards, a boss, and a sniper tower with an interior climbable ladder.
- Add Space jumping, left-click sword attacks, right-click/two-finger-click blocking, player and enemy health, enemy knockback, and physical ragdoll falls.
- Defeating the boss opens the reward room; interact with its chest to obtain Winged Boots. A dedicated button triggers repeatable forward air-hops with a short cooldown, no upward climbing, and immediate reset on landing.
- Preserve the minimap, full-map pause menu, blue sky, ocean boundary, and drowning return to the island. Pause must actually stop gameplay.

## Not part of this phase
The prologue, narrator, mainland redesign, ocean departure cutscene, regional quests, and portable save codes remain future work.

## Technical implementation
- Split terrain/placement and combat/traversal rules into browser-safe simulation modules, with one frame stepper and focused tests.
- Use locally hosted CC0 low-poly assets where available, and Rapier for physical enemy falls.
- Keep a development-only state/teleport/simulation hook for checking combat, reward gating, climbing, and movement.
- Verify the island, camp, tower, combat, reward, pause, and desktop/small-screen rendering in the browser; report sound and real-device feel as unverified.
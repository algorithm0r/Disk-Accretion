# Disk Accretion — DEVPLAN
*Living document, not frozen. Update as the design evolves.*

## Built
- Scaffolded from engine v2 (vanilla-JS canvas + standard DB client). Demo "drifters"
  model runs in-browser and headless.

## Not yet built
- The actual Disk Accretion model.

## Stages
### Stage 1 — Replace the demo model  [ ACTIVE ]
- [ ] Define state + parameters in `params.js`
- [ ] Implement the agent/world dynamics (`agent.js`, `world.js`)
- [ ] Pick the metric(s) and wire `datamanager.js`
**Done when:** the sim shows the intended dynamics in-browser and `smoketest.mjs` asserts a
real invariant (not the demo drift check).

### Stage 2 — {{NEXT STAGE}}  [ PLANNED ]
- [ ] ...
**Done when:** ...

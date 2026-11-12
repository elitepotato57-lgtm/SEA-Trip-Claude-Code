# SEA-Trip: progress log

Branch `claude/fixes-and-cambodia` (worktree `.claude/worktrees/optimistic-dhawan-3046f6`), stacked on
`claude/optimistic-dhawan-3046f6` (Indonesia researched layer, pushed, PR not yet opened because `gh` isn't installed:
[open the PR](https://github.com/elitepotato57-lgtm/SEA-Trip-Claude-Code/compare/main...claude/optimistic-dhawan-3046f6?expand=1)).
Nothing is merged into `main` or deployed. The main checkout (`claude/modules-and-design-lab`) was clean and is untouched.
Everything stays at £0: no billing, paid programmes or trials.

## Current work

Fixes 1–12 from the brief, then Cambodia.

## Findings so far (before fixing)

- **Price filters**: the map used £/££/£££ bands, the lists a select (Gaffs and Munch only, none for Activities).
  Indonesian estimates were converted to pounds as if they were baht (`gbpOrEst` used `"THB"`), so rupiah places fell out of price filters.
- **Transport counts**: zoomed out, the Transport counts added up every transport kind and ignored the Airport/Bus/... filter
  (Thailand has 45 airports but 2,664 transport places), so "Airports" showed thousands.
- **Location**: `testLoc` defaulted to "Bangkok", so a fresh install pretended to be in Bangkok and never asked for GPS.
- **Camera translator**: needs a Google key with Cloud Vision (Google requires a billing account for that API).

## Completed

- Indonesia researched layer (250 places, 35 sourced legs, 17 photos): committed `c030868`, `npm test` passed.

## Test results

- Before starting the fixes: `npm test` passed (49 unit checks, full browser run "All checks passed").

## Blockers

- None yet.

## Remaining

See the plan: price filters, nearest-place requests, heading arrow, converter/Budget/Wi-Fi/Design Lab, camera translator,
booking links, transport counts, location defaults, photo audit, Cambodia.

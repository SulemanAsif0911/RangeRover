# Range Rover — A Lineage

A scroll-driven, real-time 3D chronicle of seven Range Rovers — Classic,
Supercharged, Evoque, Velar, Sport, SV Coupé, and a bespoke Midnight edition —
in chronological chapters with alternating left/right staging, a chrome/
platinum identity (no borrowed colours), and a vertical chapter timeline.

## Files

```
index.html              Markup + content copy for the intro and all 7 chapters
style.css               All visual styling
script.js               Three.js scene, progressive model loading, scroll animation
assets/models/*.glb     The seven 3D models (~80MB combined)
```

## Running it

Browsers block local file:// fetches, which is how the models load, so this
needs a tiny local web server — no build step required.

**Node.js**: `npx serve .`
**Python 3**: `python3 -m http.server 8080`
**VS Code**: install "Live Server", right-click `index.html` → *Open with
Live Server*.

Then open the printed local address in a modern browser (WebGL2 required).

## How it works

- **Alternating entrances**: each chapter's car enters from, and rests on,
  the opposite side of the previous one (right, left, right, left…), and the
  text panel always sits on the opposite side from the car so they never
  overlap. Off-stage, a car is fully off-screen; only when its chapter
  scrolls near the centre of the viewport does it slide in to its docked
  spot, at full size, in a 3/4 hero angle.
- **Only ever ~1-2 of the seven models are actually rendered** at any given
  moment (everything else is hidden outright, not just moved off-screen),
  which is what keeps scrolling smooth despite the total asset size.
- **Progressive loading**: with ~80MB across seven files, waiting for all of
  them before showing anything would be a bad first impression. Only chapter
  one's model blocks the preloader; the other six quietly finish loading in
  the background right after the page becomes interactive. If you scroll to
  a later chapter before its file has finished, the car simply appears the
  moment it's ready.
- **Front-facing orientation** was derived, not eyeballed, by parsing each
  GLB's actual node/material names and geometry — named wheel nodes
  (`_fr/_fl/_rl/_rr`, `FL/FR/BL/BR Wheel`), grille, bumper, and boot meshes
  gave a verifiable answer for six of the seven files. The Midnight Blue
  file has no named parts at all (generic `Object_N` meshes), so its
  rotation is a best-effort match to the Classic's axis — if it ever shows
  its rear, add `Math.PI` to its `frontTurn` value in `script.js`.
- Lighting is a neutral chrome-studio setup (key + fill + rim + a faint
  ground bounce, plus a generated room-environment map) — tuned for legible
  paint reflections without leaning on any one accent colour.
- Textures are deliberately kept simple (low anisotropy, no extra mipmaps)
  and antialiasing is off, trading a little edge crispness for a
  meaningfully smoother scroll across seven heavy files.
- Fully respects `prefers-reduced-motion`.

## Notes

Content is original descriptive copy, not copied marketing text. Range Rover
and all model names are trademarks of Jaguar Land Rover; this is an
unofficial fan showcase.

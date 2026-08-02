# Range Rover — A Lineage

A scroll-driven, real-time 3D chronicle of seven Range Rovers, in this order:
Classic → Supercharged → Evoque → Midnight → Sport → Velar → SV Coupé —
staged with alternating left/right entrances, a chrome/platinum identity,
and a vertical chapter timeline.

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
  the opposite side of the previous one, and the text panel always sits on
  the opposite side from the car so they never overlap.
- **Bonnet faces the text**: rather than a fixed hero angle applied the same
  way to every model, each car's rotation turns it specifically toward its
  own chapter's text panel — cars on the right turn left toward the copy,
  cars on the left turn right toward it.
- **Zoom**: achieved with a narrower field of view and the camera held
  further back (a "longer lens"), which reads as genuine automotive-photo
  magnification rather than just scaling geometry up.
- **Only ever ~1-2 of the seven models are actually rendered** at any given
  moment (everything else is hidden outright), which is what keeps
  scrolling smooth despite the total asset size — combined with a bloom
  post-process pass that's cheap precisely because so little is on screen
  at once.
- **Progressive loading**: only chapter one's model blocks the preloader;
  the other six finish loading quietly in the background right after the
  page becomes interactive.
- **Texture fix**: materials are no longer forced fully opaque. That earlier
  "reduce quality" pass had set every material's `transparent` to `false`,
  which broke glass — windows rendered as solid colour blocks instead of
  tinted, see-through glass. Materials are now left exactly as authored.
- **Front-facing orientation** was derived, not eyeballed, by parsing each
  GLB's actual node/material names and geometry — named wheel nodes
  (`_fr/_fl/_rl/_rr`, `FL/FR/BL/BR Wheel`), grille, bumper, and boot meshes
  gave a verifiable answer for six of the seven files. The Midnight Blue
  file has no named parts at all, so its rotation is a best-effort match to
  the Classic's axis — if it ever shows its rear, add `Math.PI` to its
  `frontTurn` value in `script.js`.
- Lighting is a neutral chrome-studio setup (key + fill + rim + a faint
  ground bounce, plus a generated room-environment map) with a small bloom
  pass that lifts specular hotspots on chrome and glass for a more
  "hyper-real" showroom look, without being gaudy about it.
- Fully respects `prefers-reduced-motion`.

## Notes

Content is original descriptive copy, not copied marketing text. Range Rover
and all model names are trademarks of Jaguar Land Rover; this is an
unofficial fan showcase.

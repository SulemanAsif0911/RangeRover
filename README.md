# Range Rover — A Lineage

A scroll-driven, real-time 3D chronicle of six Range Rovers, in this order:
Classic → Supercharged → Evoque → Midnight → Sport → Velar — staged with
alternating left/right entrances, a chrome/platinum identity, and a
vertical chapter timeline.

## Files

```
index.html              Markup + content copy for the intro and all 6 chapters
style.css               All visual styling
script.js               Three.js scene, progressive model loading, scroll animation
assets/models/*.glb     The six 3D models
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
- **Only ever ~1-2 of the six models are actually rendered** at any given
  moment (everything else is hidden outright, not just moved off-screen),
  which is what keeps scrolling smooth.
- **Progressive loading**: only chapter one's model blocks the preloader;
  the other five finish loading quietly in the background right after the
  page becomes interactive.
- **Texture fix retained**: materials are left exactly as authored rather
  than forced fully opaque — an earlier pass had set every material's
  `transparent` to `false`, which broke glass (windows rendered as solid
  colour blocks instead of tinted, see-through glass).
- **Front-facing orientation** was derived, not eyeballed, by parsing each
  GLB's actual node/material names and geometry — named wheel nodes
  (`_fr/_fl/_rl/_rr`, `FL/FR/BL/BR Wheel`), grille, bumper, and boot meshes
  gave a verifiable answer for five of the six files. The Midnight Blue
  file has no named parts at all, so its rotation is a best-effort match to
  the Classic's axis — if it ever shows its rear, add `Math.PI` to its
  `frontTurn` value in `script.js`.
- Lighting is a neutral chrome-studio setup (key + fill + rim + a faint
  ground bounce, plus a generated room-environment map).
- Fully respects `prefers-reduced-motion`.

## Notes

Content is original descriptive copy, not copied marketing text. Range Rover
and all model names are trademarks of Jaguar Land Rover; this is an
unofficial fan showcase.

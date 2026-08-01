# Range Rover — A Lineage

A scroll-driven, real-time 3D chronicle of three Range Rovers — the original
Classic, the performance-minded Sport, and a bespoke Midnight edition —
staged in an editorial, chapter-by-chapter layout (text left, car right,
vertical timeline nav) with a cool, indigo-accented dark theme.

## Files

```
index.html              Markup + content copy for every chapter
style.css               All visual styling
script.js               Three.js scene, model loading, scroll-linked animation
assets/models/*.glb     The three 3D models
```

## Running it

Browsers block local file:// fetches, which is how the models load, so this
needs a tiny local web server — no build step required.

**Node.js**
```
npx serve .
```

**Python 3**
```
python3 -m http.server 8080
```

**VS Code**: install "Live Server", right-click `index.html` → *Open with
Live Server*.

Then open the printed local address in a modern browser (WebGL2 required).

## How it works

- Each chapter's model sits fully off-screen until its text panel scrolls
  near the centre of the viewport; from there it slides in to a spot on the
  right, at full size, in a 3/4 "hero" angle — then slides back out as the
  next chapter takes over. Only the active model is ever rendered, so there's
  never more than one heavy asset on screen at once.
- **Front-facing orientation**: rather than eyeball each model's rotation, I
  wrote a parser that reads each GLB's actual node/material names and
  geometry. The Classic model has explicit `_fr` / `_fl` / `_rl` / `_rr`
  wheel nodes and a named grille mesh; the Sport model has explicit
  `FL/FR/BL/BR Wheel` nodes. Both gave a hard, verifiable answer for which
  way is "front." The Midnight model has no named parts at all (generic
  `Object_N` meshes), so its rotation is a best-effort match to the Classic's
  axis — if it ever shows its rear instead of its front, open `script.js`
  and add `Math.PI` to its `frontTurn` value in the `MODELS` array.
- **Lighting** is tuned for legible paint reflections: a bright neutral
  spotlight for form and highlights, a soft fill to open the shadows, and an
  indigo-tinted rim light that echoes the UI's accent colour, plus a
  generated room-environment map for realistic reflections.
- Fully respects `prefers-reduced-motion`.

## Notes

Content is original descriptive copy, not copied marketing text. Range Rover
and all model names are trademarks of Jaguar Land Rover; this is an
unofficial fan showcase.

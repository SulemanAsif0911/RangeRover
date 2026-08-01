# Range Rover — A Legacy in Chrome

A scroll‑driven, real‑time 3D showcase of four Range Rover models — the 2006
Supercharged, 2011 Evoque, Velar, and SV Coupé — rendered with Three.js and
staged against a brushed‑chrome / carbon‑fibre theme.

## Files

```
index.html              Markup + content copy for every section
style.css               All visual styling (carbon backdrop, chrome type, layout)
script.js               Three.js scene, model loading, scroll‑linked animation
assets/models/*.glb     The four 3D models
```

## Running it

Browsers block `fetch`/XHR requests for local files opened directly as
`file://…`, which is how the 3D models are loaded — so this needs a tiny local
web server (no build step, no install beyond what's already on your machine).

Pick whichever you have available, from the project folder:

**Node.js**
```
npx serve .
```

**Python 3**
```
python3 -m http.server 8080
```

**VS Code**
Install the "Live Server" extension, right‑click `index.html` → *Open with
Live Server*.

Then open the printed local address (e.g. `http://localhost:8080`) in a
modern desktop or mobile browser (Chrome, Edge, Safari, Firefox — anything
with WebGL2).

## How it works

- The three models sit fixed at either side of the screen and stay in the
  scene the whole time; scrolling only changes each one's **weight** (0 → 1),
  computed from how close its text panel is to the vertical centre of the
  viewport.
- That weight drives opacity, scale, in‑from‑the‑wings position, and rotation
  every frame, so the outgoing model fades/slides away right as the next one
  fades/slides in — a continuous crossfade rather than a hard swap.
- A tiny procedural contact‑shadow (a canvas‑generated radial gradient, no
  extra image asset) grounds each car.
- Lighting uses a key + rim + fill light setup plus a generated room
  environment map, so painted and chrome surfaces on the models pick up
  believable reflections.
- Everything respects `prefers-reduced-motion` (idle rotation and camera
  parallax are switched off).

## Notes

- Total model payload is ~28 MB — the chrome preloader tracks real byte
  progress across all four files before revealing the page.
- Content is original descriptive copy, not copied marketing text. Range
  Rover and the model names are trademarks of Jaguar Land Rover; this is an
  unofficial fan showcase.

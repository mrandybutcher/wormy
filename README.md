# wormy

An 8-bit adventure game inspired by the Oliver Twins.

Built with **Phaser 3** and **Tiled**. The world map (`Maps/wholemap.json`) is laid out as adjacent screens (24×13 tiles each, 16×16 px per tile). The camera snaps between screens Dizzy-style as the player walks off the left or right edge.

## Run

Some browsers block fetches from `file://`, so use a local server:

```bash
python3 -m http.server 8080
```

Then open [http://localhost:8080/](http://localhost:8080/).

## Controls

- **Left/Right**: move
- **Up**: jump (only when grounded)

## Tiled integration

Phaser loads **Tiled JSON**, not `.tmx` directly.

Export your map from Tiled: **File → Export As… → JSON map files (`.json`)** → save as `Maps/wholemap.json` (or update `TILEMAP_JSON_URL` in `main.js`).

The game expects:

- `Maps/wholemap.json`
- `Tilesets/spelunky_shop.png` (set `TILESET_IMAGE_URL` in `main.js` if you use a different image)

Embedded tilesets in the JSON work out of the box. External `.tsx` references are normalized at load time.

### Collision layer

Mark any tile layer as collidable with a layer property `collides = true`, or name the layer **`Collisions`**. Any non-empty tile on `Collisions` is solid.

### Spawn point (optional)

Add an **Object Layer** named **`Objects`** with an object named **`Spawn`**. Otherwise the player spawns at `DEFAULT_SPAWN_TILE` in `main.js`.

### Multiple screens

Extend the map width in multiples of **24 tiles** (one screen). Screens are detected automatically; no `Rooms` layer is required unless you want irregular layouts.

Optional: add a **`Rooms`** object layer with rectangles sized **384×208** px (24×13 tiles at 16 px) for manual screen bounds.

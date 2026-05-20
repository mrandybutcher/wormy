# Phaser 3 + Tiled (Room Screens) Template

## Run

- Option A: open `index.html` (some browsers block fetches from `file://`, so Option B is safer)
- Option B: run a local server:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080/`.

## Controls

- **Left/Right**: move
- **Up**: jump (only when grounded)

## Tiled integration

Phaser loads **Tiled JSON**, not `.tmx` directly in this template.

You already have `Maps/test.tmx` — export it as JSON:

- In Tiled: **File → Export As… → JSON map files (`.json`)**
- Save as: `Maps/test.json`

Then place/copy your tileset image where the game can load it.

By default this template expects:

- `Maps/test.json`
- `assets/spelunky_shop.png`

### External `.tsx` tilesets are supported

Your `Maps/test.json` can reference external tilesets like:

- `"tilesets": [{ "source": "../Tilesets/spelunky_shop.tsx" }]`

This template **loads the `.tsx` as text and parses it at runtime**, so you don’t need an “embed tilesets” export option.

Make sure `main.js` points at:

- `TILESET_TSX_URL` → your `.tsx`
- `TILESET_IMAGE_URL` → the tileset **image** (png/jpg) used by that `.tsx`

### Tileset naming requirement

In `main.js`, the code auto-detects the **first tileset name** from the map JSON and uses that.

If your map uses multiple tilesets, add more `addTilesetImage(...)` calls.

### Collision layer

Mark any tile layer as collidable by setting either:

- **Layer property**: `collides = true` (recommended)
- Or name the layer **`Collisions`**

For property-based collision, set the tile property:

- **Tile property**: `collides = true` (on the tiles that should collide)

### Spawn point (optional)

Add an **Object Layer** named **`Objects`** and add an object named **`Spawn`**.
The player spawns at that object’s `(x,y)`.

## Multiple screens / rooms (Dizzy-style)

Add an **Object Layer** named **`Rooms`**.

Create rectangle objects where each rectangle is one “screen”:

- Each rectangle should be exactly the size of the camera viewport (default \(960 \times 640\))
- Place them adjacent/overlapping however your world is laid out
- Optionally name each rectangle (used as the room id)

When `Rooms` exist:

- The camera **does not follow** the player
- It slides to the active room as the player crosses into another room rectangle

Tweak the feel in `main.js` via `_updateRoomCamera()` by changing the `lerp` value.


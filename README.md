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
- **Arrow keys**: select an item or the Close button when inventory is open
- **Return**: pick up a nearby item; open inventory; use the selected item on a nearby object (inventory open); drop selected item when not near an object; choose Close when inventory is open
- **Escape**: close inventory

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

## Inventory System

The game includes a Fantasy World Dizzy-style inventory system:

- **Capacity**: 3 items maximum (classic Dizzy style)
- **Pick up items**: Stand near an item and press **Return**
- **View inventory**: Press **Return** when no item is nearby
- **Drop items**: Press **Return** while the inventory is open to drop the selected item in front of the player

### Adding Items in Tiled

1. Create an **Object Layer** named **`Items`** in your Tiled map
2. Add point or rectangle objects where you want items to appear
3. Add a custom property to each object:
   - Property name: `itemType`
   - Property value: one of `key`, `coin`, `potion`, `gem`, or `apple`
4. Alternatively, name the object with the item type (e.g., "key", "coin", etc.)

Items will spawn at the object's position when the map loads.

## Using items on objects (interactions)

Stand near an interactable object, press **Return** to open your inventory, select the item you want to use, then press **Return** again to use it on the object.

### Tiled setup

1. Create an **Object Layer** named **`Interactions`**
2. Add objects for your puzzles (see below)
3. Export the map JSON and refresh the browser

Every object on `Interactions` can be referenced by **name** as a `target` for other interactions.

### Interaction object properties

Place a **rectangle** (or point) where the player should stand to use something. Add these custom properties:

| Property | Type | Description |
|----------|------|-------------|
| `action` | string | What to do — see built-in actions below |
| `requiredItem` | string | Inventory item needed (e.g. `key`, `matches`) |
| `target` | string | Name of another object on `Interactions` (the door tiles, fire location, etc.) |
| `layer` | string | For `hide_tiles`: tile layer(s) to clear, comma-separated (default: `Collisions`) |
| `initialState` | string | Starting state (default: `default`) |
| `requiredState` | string | State required to work (defaults to `initialState`) |
| `resultState` | string | State after success (e.g. `unlocked`, `lit`) |
| `consumeItem` | bool | Remove item from inventory on use (default: `true`) |
| `once` | bool | Only works once per state cycle (default: `true`) |

### Built-in actions

| `action` | What it does |
|----------|----------------|
| `unlock_door` | Removes left/right collision inside the `target` rectangle so the player can walk through; floor tiles keep their top surface |
| `hide_tiles` | Erases tiles inside `target` on `layer` (door graphics disappear; use a tight rectangle) |
| `open_door` | Walk-through + erases door tiles on both `Collisions` and `Background` inside `target` |
| `light_fire` | Spawns a fire effect at the `target` rectangle (or on the interaction zone if no target) |

To add more behaviours, register a handler in `INTERACTION_HANDLERS` at the top of `main.js`:

```js
const INTERACTION_HANDLERS = {
  // ...existing handlers...
  my_custom_action(scene, interaction) {
    const rect = scene._getInteractionTargetRect(interaction.target);
    if (!rect) return false;
    // scene._disableHorizontalCollisionInRect(rect);
    // scene._removeTilesInRectOnLayer("Background", rect);
    scene._showGameMessage("Something happened.");
    return true; // false = key not consumed / interaction failed
  },
};
```

Then set `action` = `my_custom_action` on your `FrontDoor` object in Tiled.

**Helpers you can call from handlers:**

- `scene._getInteractionTargetRect(name)` — pixel rectangle from a named `Interactions` object
- `scene._disableHorizontalCollisionInRect(rect)` — open a doorway without removing graphics
- `scene._removeTilesInRectOnLayer(layerName, rect)` — erase tiles on `Background`, `Collisions`, etc.
- `scene._showGameMessage(text)` — brief on-screen message

### Example: key unlocks a door

1. On **`Collisions`**, place solid tiles where the locked door blocks the player
2. On **`Interactions`**, add a rectangle named **`DoorTiles`** covering those collision tiles (invisible in-game; used only as a target)
3. On **`Interactions`**, add a smaller rectangle in front of the door named **`FrontDoor`**
4. Set properties on **`FrontDoor`**:
   - `action` = `open_door` (or `unlock_door` if you only want walk-through without removing graphics)
   - `requiredItem` = `key`
   - `target` = `DoorTiles`
   - `initialState` = `locked`
   - `requiredState` = `locked`
   - `resultState` = `unlocked`
5. Place a key on the **`Items`** layer (`itemType` = `key`)

Walk up to the door, press **Return** to open your inventory, select the key, and press **Return** again — the door collision is removed.

### Example: matches light a fire

1. On **`Interactions`**, add a rectangle named **`CampfireSpot`** where the flames should appear
2. Add another rectangle (or point) in front of it named **`UnlitFire`**
3. Set properties on **`UnlitFire`**:
   - `action` = `light_fire`
   - `requiredItem` = `matches`
   - `target` = `CampfireSpot`
   - `initialState` = `unlit`
   - `requiredState` = `unlit`
   - `resultState` = `lit`
4. Add matches to **`Items`** (`itemType` = `matches`)

Stand near the fire, open your inventory, select the matches, and press **Return**.

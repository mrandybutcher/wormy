/* global Phaser */

// Player art should be the same pixel size you display (e.g. 16×16 to match `tilewidth` in Tiled).
// A 32×32 image scaled down with setDisplaySize makes the Arcade body use scale 0.5, which breaks
// body offset vs. display origin and gives wrong collisions (one horizontal direction) and floaty feet.
// Replace the procedural texture below with: this.load.image("player", "assets/player.png");

// --- Tiled configuration (adjust to your files) ---
const TILEMAP_JSON_URL = "Maps/wholemap.json"; // export your growing Tiled world JSON to this path
// If your map JSON has an embedded tileset (tilesets[0].name + tilesets[0].image),
// the easiest path is to copy that image into your project and set TILESET_IMAGE_URL to it.
const TILESET_IMAGE_URL = "Tilesets/spelunky_shop.png";

// Optional fallback if you later reintroduce TSX-based tilesets:
// const TILESET_TSX_URL = "Tilesets/spelunky_shop.tsx";
const COLLISION_LAYER_NAME = "Collisions"; // alternatively use layer property: collides=true

// Used only when the map has no object named "Spawn" on layer "Objects".
// Tile column / row in 0-based indices — same numbers Tiled shows when you hover a tile (not 1-based).
// `y` is the row of the **solid floor tile** you stand on; feet go on that tile's top edge (sprite origin is bottom-center).
const DEFAULT_SPAWN_TILE = { x: 2, y: 5 };

// Player sprite size (what you see)
const PLAYER_WIDTH = 16;
const PLAYER_HEIGHT = 16;

// Player physics hitbox in texture pixels (with native 1:1 texture scale, world size matches tiles).
const PLAYER_BODY_WIDTH = PLAYER_WIDTH;
const PLAYER_BODY_HEIGHT = PLAYER_HEIGHT;
const PLAYER_BODY_OFFSET_X = 0;
const PLAYER_BODY_OFFSET_Y = 0;

// Classic Dizzy-like feel: constant walk speed (no horizontal accel), strong gravity, modest jump.
const PHYS_GRAVITY_Y = 440;
const PHYS_WALK_SPEED_X = 100;
const PHYS_MAX_SPEED_Y = 200;
// Peak jump height ∝ velocity² at fixed gravity — ×2 height ⇒ velocity × √2
const PHYS_JUMP_VELOCITY = Math.round(360 * Math.SQRT2);

// Each Dizzy-style screen is exactly one Tiled screen: 24×13 tiles at 16×16 px.
const SCREEN_TILE_WIDTH = 24;
const SCREEN_TILE_HEIGHT = 13;
const SCREEN_PIXEL_WIDTH = SCREEN_TILE_WIDTH * 16;
const SCREEN_PIXEL_HEIGHT = SCREEN_TILE_HEIGHT * 16;

// Extra magnification (Phaser scale.zoom does not apply to WIDTH_CONTROLS_HEIGHT’s CSS sizing).
const VIEW_ZOOM = 1;
const GAME_WIDTH = SCREEN_PIXEL_WIDTH * VIEW_ZOOM;
const GAME_HEIGHT = SCREEN_PIXEL_HEIGHT * VIEW_ZOOM;
const ITEM_PICKUP_MARGIN = 12;
const INTERACTIONS_LAYER_NAME = "Interactions";
const INTERACTION_USE_MARGIN = 12;

const MAX_ENERGY = 50;
const START_ENERGY = MAX_ENERGY;
const START_LIVES = 3;
const RESPAWN_INVULN_MS = 2000;
/** Falls shorter than this (px) do not drain energy. */
const FALL_DAMAGE_MIN_PX = 48;
const FALL_DAMAGE_ENERGY_PER_PX = 0.35;

/**
 * Registered interaction actions. Add new entries here for custom behaviour.
 * Each handler receives (scene, interaction) and returns true on success.
 */
const INTERACTION_HANDLERS = {
  unlock_door(scene, interaction) {
    const rect = scene._getInteractionTargetRect(interaction.target);
    if (!rect) return false;
    scene._disableHorizontalCollisionInRect(rect);
    scene._showGameMessage("The door unlocks.");
    return true;
  },
  /** Erases tiles on named layer(s) inside `target`. Optional property `layer` (default `Collisions`). */
  hide_tiles(scene, interaction) {
    const rect = scene._getInteractionTargetRect(interaction.target);
    if (!rect) return false;
    const layerNames = (interaction.layer || "Collisions").split(",").map((s) => s.trim());
    for (const layerName of layerNames) {
      scene._removeTilesInRectOnLayer(layerName, rect);
    }
    scene._showGameMessage("It opens.");
    return true;
  },
  /** Walk-through + remove door collision tiles above the floor in `target` (Background unchanged). */
  open_door(scene, interaction) {
    const rect = scene._getInteractionTargetRect(interaction.target);
    if (!rect) return false;
    scene._disableHorizontalCollisionInRect(rect);
    scene._removeDoorTilesInRect(rect, ["Collisions"]);
    scene._showGameMessage("The door opens.");
    return true;
  },
  light_fire(scene, interaction) {
    const rect = scene._getInteractionTargetRect(interaction.target) ?? interaction.bounds;
    scene._spawnFireEffect(rect.centerX, rect.bottom);
    scene._showGameMessage("You light a fire.");
    return true;
  },
};

/** Module-level key state — window listeners always update the live scene (no stale `this`). */
const WORMY_KEYS = {
  left: false,
  right: false,
  jumpQueued: false,
  enterQueued: false,
  escQueued: false,
  invNavDir: null,
};

let wormyActiveScene = null;

function installWormyKeyboard() {
  if (installWormyKeyboard.done) return;
  installWormyKeyboard.done = true;

  const captured = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter", "Escape"];
  const shouldCapture = (code) => captured.includes(code);

  const clearKeys = () => {
    WORMY_KEYS.left = false;
    WORMY_KEYS.right = false;
    WORMY_KEYS.jumpQueued = false;
    WORMY_KEYS.enterQueued = false;
    WORMY_KEYS.escQueued = false;
    WORMY_KEYS.invNavDir = null;
  };

    const onDown = (e) => {
    if (shouldCapture(e.code)) e.preventDefault();
    if (e.repeat) return;

    if (e.code === "ArrowLeft") {
      WORMY_KEYS.left = true;
      WORMY_KEYS.invNavDir = "left";
    } else if (e.code === "ArrowRight") {
      WORMY_KEYS.right = true;
      WORMY_KEYS.invNavDir = "right";
    } else if (e.code === "ArrowUp") {
      WORMY_KEYS.invNavDir = "up";
      WORMY_KEYS.jumpQueued = true;
    } else if (e.code === "ArrowDown") {
      WORMY_KEYS.invNavDir = "down";
    } else if (e.code === "Enter") {
      WORMY_KEYS.enterQueued = true;
    } else if (e.code === "Escape") {
      WORMY_KEYS.escQueued = true;
    }
  };

  const onUp = (e) => {
    if (shouldCapture(e.code)) e.preventDefault();
    if (e.code === "ArrowLeft") WORMY_KEYS.left = false;
    else if (e.code === "ArrowRight") WORMY_KEYS.right = false;
  };

  window.addEventListener("keydown", onDown, { capture: true, passive: false });
  window.addEventListener("keyup", onUp, { capture: true, passive: false });
  window.addEventListener("blur", clearKeys, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") clearKeys();
  }, { passive: true });
}

installWormyKeyboard();

class MainScene extends Phaser.Scene {
  constructor() {
    super("main");
    this.player = null;
    this.map = null;
    this.rooms = [];
    /** true → object layer "Rooms" in Tiled; false → screens auto-tiled from map + zoom viewport */
    this._roomsFromTiled = false;
    this.activeRoomId = null;
    this.roomCamTarget = null;
    this._vw = SCREEN_PIXEL_WIDTH;
    this._vh = SCREEN_PIXEL_HEIGHT;
    this._maxScrollX = 0;
    this._maxScrollY = 0;
    this._gridCols = 1;
    this._gridRows = 1;
    this._mapEnabled = true;
    this.inventory = [];
    this.inventoryMaxSize = 3;
    this.inventoryVisible = false;
    this.inventoryUI = null;
    this.worldItems = null;
    this.interactions = [];
    this.interactionTargets = new Map();
    this.collidableLayers = [];
    /** TilemapLayer instances by Tiled layer name (for removeTileAt etc.). */
    this.tilemapLayersByName = new Map();
    this.selectedInventorySlot = 0;
    this._inventoryReturnSlot = 0;
    this.spawnX = 0;
    this.spawnY = 0;
    this.energy = START_ENERGY;
    this.lives = START_LIVES;
    this.statusUI = null;
    this._livesText = null;
    this._energyBarFill = null;
    this._isDead = false;
    this._invulnerableUntil = 0;
    this._airbornePeakY = null;
  }

  preload() {
    this.load.image("tiles", TILESET_IMAGE_URL);
    this.load.image("item_key", "assets/key.png");
    this.load.json("mapJson", TILEMAP_JSON_URL);
  }

  create() {
    this._ensurePlayerTexture();
    this._createItemTextures();

    this.cameras.main.setBackgroundColor(0x121926);

    // Try to build the tilemap; if missing/not ready, fall back to a simple ground.
    const hasMap = this.cache.json.has("mapJson");
    const hasTilesImage = this.textures.exists("tiles");
    this._mapEnabled = hasMap && hasTilesImage;
    if (!this._mapEnabled) {
      const reasons = [];
      if (!hasMap) reasons.push(`missing map JSON (${TILEMAP_JSON_URL})`);
      if (!hasTilesImage) reasons.push(`missing tileset image (${TILESET_IMAGE_URL})`);
      this._createFallbackWorld(`Could not load Tiled assets: ${reasons.join(", ")}`);
      return;
    }

    const mapJson = this._normalizeTiledTilesets(this.cache.json.get("mapJson"));
    this.cache.tilemap.add("map", { format: Phaser.Tilemaps.Formats.TILED_JSON, data: mapJson });

    // Build the tilemap (embedded tilesets)
    this.map = this.make.tilemap({ key: "map" });

    const tilesetInstances = this.map.tilesets
      .map((ts) =>
        this.map.addTilesetImage(
          ts.name,
          "tiles",
          ts.tileWidth ?? this.map.tileWidth,
          ts.tileHeight ?? this.map.tileHeight,
          ts.margin ?? 0,
          ts.spacing ?? 0,
          ts.firstgid ?? 1,
        ),
      )
      .filter(Boolean);
    if (tilesetInstances.length === 0) {
      this._createFallbackWorld(
        "No embedded tilesets were registered. Check your map JSON tilesets[] and ensure TILESET_IMAGE_URL points to the correct image.",
      );
      return;
    }

    // Create all tile layers
    // (Layer names from Tiled are used as-is)
    const createdLayers = [];
    for (const layerDef of this.map.layers) {
      const layerName = layerDef.name;
      const layer = this.map.createLayer(layerName, tilesetInstances, 0, 0);
      if (layer) {
        createdLayers.push(layer);
        this.tilemapLayersByName.set(layerName, layer);
      }
    }

    // World bounds based on map pixel size
    const worldW = this.map.widthInPixels;
    const worldH = this.map.heightInPixels;
    this.physics.world.setBounds(0, 0, worldW, worldH);

    // Collisions:
    // Option A (recommended): mark a layer as collidable in Tiled with a property:
    // - layer property: collides = true
    // Option B: name your collidable layer "Collisions"
    const collidableLayers = createdLayers.filter((layer) => {
      const props = layer.layer?.properties || [];
      const hasCollidesProp = props.some((p) => p.name === "collides" && Boolean(p.value));
      return hasCollidesProp || layer.layer?.name === COLLISION_LAYER_NAME;
    });

    for (const layer of collidableLayers) {
      layer.setCollisionByProperty({ collides: true });
    }

    // Common Tiled workflow: a dedicated "Collisions" layer where any non-empty tile is solid.
    for (const layer of collidableLayers) {
      if (layer.layer?.name === COLLISION_LAYER_NAME) {
        layer.setCollisionByExclusion([-1], true);
      }
    }

    // Player (dynamic body)
    // Spawn:
    // - If you have an object layer named "Objects" with an object named "Spawn",
    //   we’ll spawn there (and DEFAULT_SPAWN_TILE is ignored).
    // - Else feet at center-x / on top of the tile at DEFAULT_SPAWN_TILE (see tilemap helpers below).
    const spawn = this._findObject("Objects", "Spawn");
    const gridLayer = createdLayers.find((l) => l.layer?.name === "Collisions") || createdLayers[0];
    let spawnX;
    let spawnY;
    if (spawn?.x != null) {
      spawnX = this._tiledObjectCenterX(spawn, this.map.tileWidth);
      spawnY = this._tiledObjectFootY(spawn);
    } else {
      const feet = this._defaultSpawnFeetOnFloorTile(this.map, gridLayer, DEFAULT_SPAWN_TILE.x, DEFAULT_SPAWN_TILE.y);
      spawnX = feet.x;
      spawnY = feet.y;
    }

    this.player = this.physics.add.sprite(spawnX, spawnY, "player");
    this._setupPlayer(this.player);
    this.player.setCollideWorldBounds(true);
    this.player.setBounce(0);
    this.player.setDragX(0);
    this.player.setMaxVelocity(PHYS_WALK_SPEED_X, PHYS_MAX_SPEED_Y);

    // Collisions
    for (const layer of collidableLayers) {
      this.physics.add.collider(this.player, layer);
    }
    this.collidableLayers = collidableLayers;

    this._setupInput();

    // Discrete screens (Dizzy-style): camera never smoothly follows — it stays fixed per screen or snaps instantly.
    // Optional: object layer "Rooms" with rectangles in map pixels matching one visible area at current VIEW_ZOOM.
    const cam = this.cameras.main;
    cam.stopFollow();
    cam.setZoom(VIEW_ZOOM);
    this._vw = this.map.tileWidth * SCREEN_TILE_WIDTH;
    this._vh = this.map.tileHeight * SCREEN_TILE_HEIGHT;
    this._maxScrollX = Math.max(0, worldW - this._vw);
    this._maxScrollY = Math.max(0, worldH - this._vh);

    const tiledRooms = this._readRooms();
    if (tiledRooms.length > 0) {
      this._roomsFromTiled = true;
      this.rooms = tiledRooms;
    } else {
      this._roomsFromTiled = false;
      this._buildAutoScreenRooms(worldW, worldH);
    }

    this.roomCamTarget = null;
    this.activeRoomId = null;
    this._setActiveRoomForPlayer(true);
    if (this.roomCamTarget) {
      cam.setScroll(this.roomCamTarget.x, this.roomCamTarget.y);
    }

    cam.roundPixels = true;

    this._createWorldItems();
    this._createInteractions();
    this._initPlayerStats(spawnX, spawnY);
    this._createInventoryUI();
    this._createStatusUI();

    this._bindScaleRefresh();
    this._focusGameCanvas();
  }

  update() {
    if (!this.player) return;
    const body = this.player.body;

    if (this._isDead) {
      body.setVelocity(0, 0);
      return;
    }

    body.setAccelerationX(0);

    if (WORMY_KEYS.enterQueued) {
      try {
        if (this.inventoryVisible) {
          this._handleInventoryReturn();
        } else if (this._pickupNearbyItem()) {
          this._openInventory({ justPickedUp: true });
        } else {
          this._openInventory();
        }
      } finally {
        WORMY_KEYS.enterQueued = false;
      }
    }

    if (WORMY_KEYS.escQueued) {
      if (this.inventoryVisible) this._closeInventory();
      WORMY_KEYS.escQueued = false;
    }

    if (this.inventoryVisible) {
      body.setVelocityX(0);
      if (WORMY_KEYS.invNavDir) {
        this._moveInventoryNav(WORMY_KEYS.invNavDir);
        WORMY_KEYS.invNavDir = null;
      }
      WORMY_KEYS.jumpQueued = false;
    } else {
      if (WORMY_KEYS.invNavDir) WORMY_KEYS.invNavDir = null;
      if (WORMY_KEYS.left) {
        body.setVelocityX(-PHYS_WALK_SPEED_X);
        this.player.setFlipX(true);
      } else if (WORMY_KEYS.right) {
        body.setVelocityX(PHYS_WALK_SPEED_X);
        this.player.setFlipX(false);
      } else {
        body.setVelocityX(0);
      }
    }

    const onGround = body.blocked.down || body.touching.down;
    if (!this.inventoryVisible && onGround && WORMY_KEYS.jumpQueued) {
      body.setVelocityY(-PHYS_JUMP_VELOCITY);
      WORMY_KEYS.jumpQueued = false;
    }

    this._updateFallDamage(onGround);

    this._setActiveRoomForPlayer(false);
    this._updateRoomCamera();
  }

  _createFallbackWorld(message) {
    const w = 960;
    const h = 640;
    this.physics.world.setBounds(0, 0, w, h);

    // Ground (static body)
    const ground = this.add.rectangle(w / 2, h - 40, w - 120, 40, 0x2a3342);
    this.physics.add.existing(ground, true);

    this.player = this.physics.add.sprite(140, h - 120, "player");
    this._setupPlayer(this.player);
    this.player.setCollideWorldBounds(true);
    this.player.setBounce(0);
    this.player.setDragX(0);
    this.player.setMaxVelocity(PHYS_WALK_SPEED_X, PHYS_MAX_SPEED_Y);

    this.physics.add.collider(this.player, ground);
    this._setupInput();
    this._initPlayerStats(140, h - 120);
    this._createStatusUI();

    const cam = this.cameras.main;
    cam.stopFollow();
    cam.setZoom(VIEW_ZOOM);
    this._vw = SCREEN_PIXEL_WIDTH;
    this._vh = SCREEN_PIXEL_HEIGHT;
    this._maxScrollX = Math.max(0, w - this._vw);
    this._maxScrollY = Math.max(0, h - this._vh);
    this._roomsFromTiled = false;
    this._gridCols = 1;
    this._gridRows = 1;
    this.rooms = [{ id: "Fallback", rect: new Phaser.Geom.Rectangle(0, 0, w, h) }];
    this.roomCamTarget = { x: 0, y: 0 };
    this.activeRoomId = "Fallback";
    cam.setScroll(0, 0);

    if (message) {
      this.add
        .text(16, 16, `Map disabled:\n${message}`, {
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          fontSize: "12px",
          color: "#e6edf3",
          backgroundColor: "rgba(0,0,0,0.5)",
          padding: { x: 10, y: 8 },
        })
        .setScrollFactor(0)
        .setDepth(9999);
    }

    this._bindScaleRefresh();
    this._focusGameCanvas();
  }

  _focusGameCanvas() {
    const canvas = this.game.canvas;
    if (!canvas) return;
    canvas.setAttribute("tabindex", "0");
    canvas.style.outline = "none";
    if (!this._canvasFocusInstalled) {
      this._canvasFocusInstalled = true;
      canvas.addEventListener("pointerdown", () => canvas.focus(), { passive: true });
    }
    canvas.focus();
  }

  _setupInput() {
    wormyActiveScene = this;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (wormyActiveScene === this) wormyActiveScene = null;
    });
  }

  /** FIT uses parent size; refresh after layout + on window resize so scaling isn’t stuck at default. */
  _bindScaleRefresh() {
    const refresh = () => this.scale.refresh();
    refresh();
    this.time.delayedCall(0, refresh);
    // Embedded / IDE browsers often report parent size 0 or stale until after first paint.
    this.time.delayedCall(50, refresh);
    this.time.delayedCall(250, refresh);
    // Do not use `this.scale.on("resize", refresh)`: `refresh()` emits that event and overflows the stack.
    if (typeof window !== "undefined") {
      window.addEventListener("resize", refresh, { passive: true });
    }
    // Cursor / split IDE views resize the container without always firing window "resize".
    if (typeof ResizeObserver !== "undefined" && this.scale.parent) {
      this._parentResizeObserver = new ResizeObserver(refresh);
      this._parentResizeObserver.observe(this.scale.parent);
    }
  }

  _ensurePlayerTexture() {
    if (this.textures.exists("player")) return;
    const tex = this.textures.createCanvas("player", PLAYER_WIDTH, PLAYER_HEIGHT);
    tex.context.fillStyle = "#5fd38d";
    tex.context.fillRect(0, 0, PLAYER_WIDTH, PLAYER_HEIGHT);
    tex.refresh();
  }

  _normalizeTiledTilesets(mapJson) {
    const normalized = JSON.parse(JSON.stringify(mapJson));
    if (!Array.isArray(normalized.tilesets)) return normalized;

    const usedNames = new Set(normalized.tilesets.filter((ts) => ts.name).map((ts) => ts.name));
    const embeddedTilesets = normalized.tilesets.filter((ts) => !ts.source);
    const textureSource = this.textures.get("tiles").getSourceImage();

    normalized.tilesets = normalized.tilesets.map((tileset) => {
      if (!tileset.source) return tileset;

      const sourceName = this._filenameWithoutExtension(tileset.source);
      const template = embeddedTilesets.find((ts) => ts.name === sourceName) || embeddedTilesets[0] || {};
      const name = this._uniqueTilesetName(sourceName || "tileset", usedNames, tileset.firstgid);
      usedNames.add(name);

      const tileWidth = template.tilewidth ?? normalized.tilewidth;
      const tileHeight = template.tileheight ?? normalized.tileheight;
      const columns = template.columns ?? Math.max(1, Math.floor(textureSource.width / tileWidth));
      const rows = Math.max(1, Math.floor(textureSource.height / tileHeight));

      return {
        columns,
        firstgid: tileset.firstgid,
        image: template.image ?? TILESET_IMAGE_URL,
        imageheight: template.imageheight ?? textureSource.height,
        imagewidth: template.imagewidth ?? textureSource.width,
        margin: template.margin ?? 0,
        name,
        spacing: template.spacing ?? 0,
        tilecount: template.tilecount ?? columns * rows,
        tileheight: tileHeight,
        tilewidth: tileWidth,
      };
    });

    // Tiled allows the same tileset name on multiple firstgid blocks (one per screen).
    // Phaser resolves addTilesetImage by name — duplicates break GIDs on later screens.
    const finalNames = new Set();
    normalized.tilesets = normalized.tilesets.map((tileset) => {
      let name = tileset.name || `tileset_${tileset.firstgid}`;
      if (finalNames.has(name)) {
        name = this._uniqueTilesetName(name, finalNames, tileset.firstgid);
      }
      finalNames.add(name);
      return { ...tileset, name };
    });

    return normalized;
  }

  _filenameWithoutExtension(path) {
    const filename = path.split(/[\\/]/).pop() || "";
    return filename.replace(/\.[^.]+$/, "");
  }

  _uniqueTilesetName(baseName, usedNames, firstgid) {
    if (!usedNames.has(baseName)) return baseName;
    const withGid = `${baseName}_${firstgid}`;
    if (!usedNames.has(withGid)) return withGid;

    let i = 2;
    while (usedNames.has(`${withGid}_${i}`)) i += 1;
    return `${withGid}_${i}`;
  }

  /**
   * World position for feet (bottom-center origin) standing on top of the tile at (tileCol, tileRow).
   * Uses the tilemap converter so this stays aligned with Tiled if layers have position / scale offsets.
   */
  _defaultSpawnFeetOnFloorTile(map, layer, tileCol, tileRow) {
    const tw = map.tileWidth;
    const th = map.tileHeight;
    const topLeft = map.tileToWorldXY(tileCol, tileRow, undefined, undefined, layer);
    if (!topLeft) {
      return { x: tileCol * tw + tw / 2, y: tileRow * th };
    }
    return {
      x: topLeft.x + tw / 2,
      y: topLeft.y,
    };
  }

  _setupPlayer(player) {
    // Feet live at (x, y). Texture is already PLAYER_WIDTH × PLAYER_HEIGHT (no display scaling).
    // Do NOT use setSize(..., true): that centers the hitbox on (x, y), which with bottom-center origin
    // places half the body below the feet.
    player.setOrigin(0.5, 1);
    const body = player.body;
    body.setSize(PLAYER_BODY_WIDTH, PLAYER_BODY_HEIGHT, false);
    body.setOffset(PLAYER_BODY_OFFSET_X, PLAYER_BODY_OFFSET_Y);

    player.x = Math.round(player.x);
    player.y = Math.round(player.y);
    body.reset(player.x, player.y);
  }

  _tiledObjectCenterX(obj, tileWidth) {
    // Tiled rectangle/point objects use top-left x,y in JSON exports.
    if (obj.width) return obj.x + obj.width / 2;
    return obj.x + tileWidth / 2;
  }

  _tiledObjectFootY(obj) {
    // For point objects, y is the point's y. For rectangles, y is the top edge in Phaser/Tiled JSON.
    if (obj.height) return obj.y + obj.height;
    return obj.y;
  }

  _findObject(layerName, objectName) {
    const objLayer = this.map.getObjectLayer(layerName);
    if (!objLayer || !objLayer.objects) return null;
    return objLayer.objects.find((o) => o.name === objectName) || null;
  }

  _readRooms() {
    const objLayer = this.map.getObjectLayer("Rooms");
    if (!objLayer || !objLayer.objects) return [];

    // Tiled object y is bottom-left by default for rectangles in JSON exports.
    // Phaser uses top-left for rectangles; normalize to top-left.
    return objLayer.objects
      .filter((o) => typeof o.x === "number" && typeof o.y === "number" && o.width && o.height)
      .map((o, idx) => {
        const id = o.name?.trim() ? o.name.trim() : `Room${idx + 1}`;
        const x = o.x;
        const yTop = o.y - o.height;
        return {
          id,
          rect: new Phaser.Geom.Rectangle(x, yTop, o.width, o.height),
        };
      });
  }

  /** One discrete screen is exactly 24×13 Tiled tiles. */
  _buildAutoScreenRooms(worldW, worldH) {
    const vw = this._vw;
    const vh = this._vh;
    this._gridCols = Math.max(1, Math.ceil(worldW / vw));
    this._gridRows = Math.max(1, Math.ceil(worldH / vh));
    const list = [];
    for (let r = 0; r < this._gridRows; r++) {
      for (let c = 0; c < this._gridCols; c++) {
        const x = c * vw;
        const y = r * vh;
        if (x >= worldW || y >= worldH) continue;
        const rw = Math.min(vw, worldW - x);
        const rh = Math.min(vh, worldH - y);
        list.push({
          id: `_${c}_${r}`,
          rect: new Phaser.Geom.Rectangle(x, y, rw, rh),
        });
      }
    }
    this.rooms = list;
  }

  _setActiveRoomForPlayer(force) {
    const px = this.player.x;
    const py = this.player.y;

    let id;
    let tx;
    let ty;

    if (this._roomsFromTiled) {
      const hit = this.rooms.find((r) => r.rect.contains(px, py));
      if (!hit) return;
      id = hit.id;
      tx = hit.rect.x;
      ty = hit.rect.y;
    } else {
      const current = this._currentAutoScreen();
      let sx = current.x;
      let sy = current.y;
      const body = this.player.body;

      if (force) {
        sx = Math.floor(px / this._vw);
        sy = Math.floor(py / this._vh);
      } else if (body) {
        const rightEdge = (current.x + 1) * this._vw;
        const leftEdge = current.x * this._vw;
        const bottomEdge = (current.y + 1) * this._vh;
        const topEdge = current.y * this._vh;

        if (body.left >= rightEdge) sx += 1;
        else if (body.right <= leftEdge) sx -= 1;

        if (body.top >= bottomEdge) sy += 1;
        else if (body.bottom <= topEdge) sy -= 1;
      }

      sx = Phaser.Math.Clamp(sx, 0, this._gridCols - 1);
      sy = Phaser.Math.Clamp(sy, 0, this._gridRows - 1);
      id = `_${sx}_${sy}`;
      tx = sx * this._vw;
      ty = sy * this._vh;
    }

    tx = Phaser.Math.Clamp(tx, 0, this._maxScrollX);
    ty = Phaser.Math.Clamp(ty, 0, this._maxScrollY);

    if (!force && id === this.activeRoomId && this.roomCamTarget && this.roomCamTarget.x === tx && this.roomCamTarget.y === ty) {
      return;
    }
    this.activeRoomId = id;
    this.roomCamTarget = { x: tx, y: ty };
  }

  _currentAutoScreen() {
    const match = /^_(\d+)_(\d+)$/.exec(this.activeRoomId || "");
    if (!match) {
      return {
        x: Phaser.Math.Clamp(Math.floor(this.player.x / this._vw), 0, this._gridCols - 1),
        y: Phaser.Math.Clamp(Math.floor(this.player.y / this._vh), 0, this._gridRows - 1),
      };
    }

    return {
      x: Phaser.Math.Clamp(Number(match[1]), 0, this._gridCols - 1),
      y: Phaser.Math.Clamp(Number(match[2]), 0, this._gridRows - 1),
    };
  }

  _updateRoomCamera() {
    if (this.roomCamTarget == null) return;
    const cam = this.cameras.main;
    cam.setScroll(this.roomCamTarget.x, this.roomCamTarget.y);
  }

  _createItemTextures() {
    const itemDefs = this._getItemDefinitions();
    for (const [itemId, def] of Object.entries(itemDefs)) {
      if (!this.textures) continue;
      const texKey = `item_${itemId}`;
      if (this.textures.exists(texKey)) continue;
      const canvas = document.createElement("canvas");
      canvas.width = 12;
      canvas.height = 12;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = def.color;
      ctx.fillRect(0, 0, 12, 12);
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 1;
      ctx.strokeRect(0, 0, 12, 12);
      this.textures.addBase64(texKey, canvas.toDataURL());
    }
  }

  _getTiledProperty(obj, name, defaultValue) {
    const prop = obj.properties?.find((p) => p.name === name);
    if (!prop || prop.value === undefined) return defaultValue;
    return prop.value;
  }

  _tiledObjectWorldRect(obj) {
    const margin = INTERACTION_USE_MARGIN;
    if (obj.width && obj.height) {
      return new Phaser.Geom.Rectangle(obj.x, obj.y, obj.width, obj.height);
    }
    return new Phaser.Geom.Rectangle(obj.x - margin, obj.y - margin, margin * 2, margin * 2);
  }

  _createInteractions() {
    this.interactions = [];
    this.interactionTargets = new Map();

    if (!this._mapEnabled || !this.map) return;

    const layer = this.map.getObjectLayer(INTERACTIONS_LAYER_NAME);
    if (!layer?.objects) return;

    for (const obj of layer.objects) {
      if (obj.name) {
        this.interactionTargets.set(obj.name, this._tiledObjectWorldRect(obj));
      }

      const action = this._getTiledProperty(obj, "action", "");
      if (!action) continue;

      const initialState = this._getTiledProperty(obj, "initialState", "default");
      this.interactions.push({
        id: obj.id,
        name: obj.name || `interaction_${obj.id}`,
        bounds: this._tiledObjectWorldRect(obj),
        requiredItem: this._getTiledProperty(obj, "requiredItem", ""),
        action,
        consumeItem: this._getTiledProperty(obj, "consumeItem", true),
        target: this._getTiledProperty(obj, "target", ""),
        layer: this._getTiledProperty(obj, "layer", ""),
        initialState,
        requiredState: this._getTiledProperty(obj, "requiredState", initialState),
        resultState: this._getTiledProperty(obj, "resultState", ""),
        once: this._getTiledProperty(obj, "once", true),
        state: initialState,
      });
    }
  }

  _getInteractionTargetRect(targetName) {
    if (!targetName) return null;
    return this.interactionTargets.get(targetName) ?? null;
  }

  _findNearbyInteraction() {
    if (!this.player || this.interactions.length === 0) return null;

    const playerBounds = this.player.getBounds();
    Phaser.Geom.Rectangle.Inflate(playerBounds, INTERACTION_USE_MARGIN, INTERACTION_USE_MARGIN);

    let nearest = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const interaction of this.interactions) {
      if (!Phaser.Geom.Intersects.RectangleToRectangle(playerBounds, interaction.bounds)) continue;
      const distance = Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y,
        interaction.bounds.centerX,
        interaction.bounds.centerY,
      );
      if (distance < nearestDistance) {
        nearest = interaction;
        nearestDistance = distance;
      }
    }

    return nearest;
  }

  _canUseInteraction(interaction, itemType) {
    if (!interaction.requiredItem || interaction.requiredItem !== itemType) return false;
    if (interaction.once && interaction.state !== interaction.requiredState) return false;
    if (interaction.requiredState && interaction.state !== interaction.requiredState) return false;
    return Boolean(INTERACTION_HANDLERS[interaction.action]);
  }

  _tryUseNearbyInteraction(itemType, inventorySlot = null) {
    if (!itemType) return false;

    const interaction = this._findNearbyInteraction();
    if (!interaction || !this._canUseInteraction(interaction, itemType)) return false;

    const handler = INTERACTION_HANDLERS[interaction.action];
    if (!handler(this, interaction)) return false;

    if (interaction.resultState) interaction.state = interaction.resultState;
    if (interaction.consumeItem !== false) {
      this._removeInventoryItem(itemType, inventorySlot);
    }

    return true;
  }

  _removeInventoryItem(itemType, preferredSlot = null) {
    let idx = -1;
    if (
      preferredSlot != null &&
      preferredSlot < this.inventory.length &&
      this.inventory[preferredSlot] === itemType
    ) {
      idx = preferredSlot;
    } else {
      idx = this.inventory.indexOf(itemType);
    }
    if (idx === -1) return;

    this.inventory.splice(idx, 1);
    if (this.selectedInventorySlot >= this.inventory.length && this.selectedInventorySlot > 0) {
      this.selectedInventorySlot--;
    }
    if (this.inventoryUI) this._updateInventoryUI();
  }

  /**
   * Remove left/right blocking so the player can walk through a doorway.
   * Keeps up/down collision so floor tiles in the same rectangle stay solid.
   */
  _disableHorizontalCollisionInRect(worldRect) {
    if (!this.collidableLayers?.length) return;

    const tw = this.map.tileWidth;
    const th = this.map.tileHeight;
    const left = Math.floor(worldRect.left / tw);
    const right = Math.ceil(worldRect.right / tw) - 1;
    const top = Math.floor(worldRect.top / th);
    const bottom = Math.ceil(worldRect.bottom / th) - 1;

    for (const layer of this.collidableLayers) {
      for (let ty = top; ty <= bottom; ty++) {
        for (let tx = left; tx <= right; tx++) {
          const tile = layer.getTileAt(tx, ty);
          if (!tile || tile.index === -1) continue;
          tile.setCollision(false, false, tile.collideUp, tile.collideDown);
        }
      }
    }
  }

  _removeTilesInRectOnLayer(layerName, worldRect) {
    const layer = this.tilemapLayersByName.get(layerName);
    if (!layer) return;

    const tw = this.map.tileWidth;
    const th = this.map.tileHeight;
    const left = Math.floor(worldRect.left / tw);
    const right = Math.ceil(worldRect.right / tw) - 1;
    const top = Math.floor(worldRect.top / th);
    const bottom = Math.ceil(worldRect.bottom / th) - 1;

    for (let ty = top; ty <= bottom; ty++) {
      for (let tx = left; tx <= right; tx++) {
        layer.removeTileAt(tx, ty);
      }
    }
  }

  /**
   * Erase door tiles inside `worldRect` while keeping the bottom solid row per column
   * (the floor the player stands on).
   */
  _removeDoorTilesInRect(worldRect, layerNames) {
    const collisionLayer = this.tilemapLayersByName.get("Collisions");
    if (!collisionLayer) return;

    const tw = this.map.tileWidth;
    const th = this.map.tileHeight;
    const left = Math.floor(worldRect.left / tw);
    const right = Math.ceil(worldRect.right / tw) - 1;
    const top = Math.floor(worldRect.top / th);
    const bottom = Math.ceil(worldRect.bottom / th) - 1;

    const floorRowByColumn = new Map();
    for (let tx = left; tx <= right; tx++) {
      let floorRow = null;
      for (let ty = bottom; ty >= top; ty--) {
        const tile = collisionLayer.getTileAt(tx, ty);
        if (tile && tile.index !== -1) {
          floorRow = ty;
          break;
        }
      }
      floorRowByColumn.set(tx, floorRow);
    }

    for (const layerName of layerNames) {
      const layer = this.tilemapLayersByName.get(layerName);
      if (!layer) continue;

      for (let tx = left; tx <= right; tx++) {
        const floorRow = floorRowByColumn.get(tx);
        if (floorRow == null) continue;

        for (let ty = top; ty < floorRow; ty++) {
          layer.removeTileAt(tx, ty);
        }
      }
    }
  }

  _spawnFireEffect(x, y) {
    if (!this.textures.exists("fire")) {
      const tex = this.textures.createCanvas("fire", 12, 16);
      tex.context.fillStyle = "#ff6600";
      tex.context.fillRect(2, 4, 8, 10);
      tex.context.fillStyle = "#ffcc00";
      tex.context.fillRect(4, 2, 4, 8);
      tex.refresh();
    }

    const fire = this.add.sprite(x, y, "fire");
    fire.setOrigin(0.5, 1);
    fire.setDepth(500);
    this.tweens.add({
      targets: fire,
      scaleY: { from: 1, to: 1.3 },
      duration: 400,
      yoyo: true,
      repeat: -1,
    });
  }

  _showGameMessage(text) {
    if (this._messageText) this._messageText.destroy();
    this._messageText = this.add
      .text(SCREEN_PIXEL_WIDTH / 2, SCREEN_PIXEL_HEIGHT - 16, text, {
        fontFamily: "ui-monospace, monospace",
        fontSize: "10px",
        color: "#ffffff",
        backgroundColor: "rgba(0,0,0,0.6)",
        padding: { x: 8, y: 4 },
      })
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(10001);

    this.time.delayedCall(2500, () => {
      if (this._messageText) {
        this._messageText.destroy();
        this._messageText = null;
      }
    });
  }

  _initPlayerStats(spawnX, spawnY) {
    this.spawnX = spawnX;
    this.spawnY = spawnY;
    this.energy = START_ENERGY;
    this.lives = START_LIVES;
    this._isDead = false;
    this._invulnerableUntil = 0;
    this._airbornePeakY = null;
  }

  _createStatusUI() {
    if (this.statusUI) this.statusUI.destroy();

    const hudX = 6;
    const hudY = 6;
    const barWidth = 64;
    const barHeight = 6;

    this.statusUI = this.add.container(0, 0);
    this.statusUI.setScrollFactor(0);
    this.statusUI.setDepth(9998);

    this._livesText = this.add.text(hudX, hudY, "", {
      fontFamily: "ui-monospace, monospace",
      fontSize: "10px",
      color: "#ffffff",
    });
    this._livesText.setOrigin(0, 0);

    const energyLabel = this.add.text(hudX, hudY + 14, "Energy", {
      fontFamily: "ui-monospace, monospace",
      fontSize: "8px",
      color: "#aaaaaa",
    });
    energyLabel.setOrigin(0, 0);

    const energyBarBg = this.add.rectangle(hudX, hudY + 26, barWidth, barHeight, 0x2d2d44);
    energyBarBg.setOrigin(0, 0);

    this._energyBarFill = this.add.rectangle(hudX, hudY + 26, barWidth, barHeight, 0x5fd38d);
    this._energyBarFill.setOrigin(0, 0);

    this.statusUI.add([this._livesText, energyLabel, energyBarBg, this._energyBarFill]);
    this._updateStatusUI();
  }

  _updateStatusUI() {
    if (!this._livesText || !this._energyBarFill) return;

    this._livesText.setText(`Lives ${this.lives}`);

    const ratio = Phaser.Math.Clamp(this.energy / MAX_ENERGY, 0, 1);
    const barWidth = 64;
    this._energyBarFill.width = Math.max(0, barWidth * ratio);
    this._energyBarFill.setFillStyle(ratio <= 0.25 ? 0xff4444 : 0x5fd38d);
  }

  /** Positive restores energy; negative drains it. Call from hazards, items, etc. */
  _changeEnergy(delta) {
    if (this._isDead) return;
    if (delta < 0 && this.time.now < this._invulnerableUntil) return;

    this.energy = Phaser.Math.Clamp(this.energy + delta, 0, MAX_ENERGY);
    this._updateStatusUI();

    if (this.energy <= 0) {
      this._loseLife();
    }
  }

  _loseLife() {
    if (this._isDead) return;

    this.lives -= 1;
    this._updateStatusUI();

    if (this.lives <= 0) {
      this._gameOver();
      return;
    }

    this._showGameMessage("Ouch!");
    this._respawnPlayer();
  }

  _respawnPlayer() {
    this.energy = MAX_ENERGY;
    this._updateStatusUI();
    this._closeInventory();
    this._airbornePeakY = null;
    this._invulnerableUntil = this.time.now + RESPAWN_INVULN_MS;

    this.player.setPosition(this.spawnX, this.spawnY);
    this.player.body.reset(this.spawnX, this.spawnY);
    this.player.body.setVelocity(0, 0);
    this._setActiveRoomForPlayer(true);
    this._updateRoomCamera();
  }

  _gameOver() {
    this._isDead = true;
    this.energy = 0;
    this._updateStatusUI();
    this._closeInventory();
    this.player.body.setVelocity(0, 0);
    this._showGameMessage("Game Over");
  }

  _updateFallDamage(onGround) {
    if (this._isDead || this.time.now < this._invulnerableUntil) {
      if (onGround) this._airbornePeakY = null;
      return;
    }

    if (!onGround) {
      if (this._airbornePeakY == null) {
        this._airbornePeakY = this.player.y;
      } else {
        this._airbornePeakY = Math.min(this._airbornePeakY, this.player.y);
      }
      return;
    }

    if (this._airbornePeakY == null) return;

    const fallPx = this.player.y - this._airbornePeakY;
    this._airbornePeakY = null;

    if (fallPx < FALL_DAMAGE_MIN_PX) return;

    const damage = Math.ceil((fallPx - FALL_DAMAGE_MIN_PX) * FALL_DAMAGE_ENERGY_PER_PX);
    if (damage > 0) {
      this._changeEnergy(-damage);
    }
  }

  _getItemDefinitions() {
    return {
      key: { name: "Key", color: "#FFD700" },
      matches: { name: "Matches", color: "#8B4513" },
      coin: { name: "Coin", color: "#FFA500" },
      potion: { name: "Potion", color: "#FF00FF" },
      gem: { name: "Gem", color: "#00FFFF" },
      apple: { name: "Apple", color: "#FF0000" },
    };
  }

  _createWorldItems() {
    this.worldItems = this.physics.add.staticGroup();

    if (!this._mapEnabled || !this.map) {
      const fallbackItems = [
        { x: 200, y: 580, type: "key" },
        { x: 300, y: 580, type: "coin" },
        { x: 400, y: 580, type: "potion" },
      ];
      for (const itemData of fallbackItems) {
        this._createWorldItem(itemData.x, itemData.y, itemData.type);
      }
      return;
    }

    const itemsLayer = this.map.getObjectLayer("Items");
    if (!itemsLayer || !itemsLayer.objects) return;

    for (const obj of itemsLayer.objects) {
      const itemType = obj.properties?.find((p) => p.name === "itemType")?.value || obj.name || "key";
      const x = this._tiledObjectCenterX(obj, this.map.tileWidth);
      const y = this._tiledObjectFootY(obj);
      this._createWorldItem(x, y, itemType);
    }
  }

  _createWorldItem(x, y, itemType) {
    const texKey = `item_${itemType}`;
    if (!this.textures.exists(texKey)) return;

    const item = this.worldItems.create(x, y, texKey);
    item.setOrigin(0.5, 1);
    item.refreshBody();
    item.setData("itemType", itemType);
  }

  _pickupNearbyItem() {
    if (!this.player || !this.worldItems) return false;
    if (this.inventory.length >= this.inventoryMaxSize) return false;

    const playerBounds = this.player.getBounds();
    Phaser.Geom.Rectangle.Inflate(playerBounds, ITEM_PICKUP_MARGIN, ITEM_PICKUP_MARGIN);

    let nearestItem = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const item of this.worldItems.getChildren()) {
      if (!item.active || !item.visible) continue;
      if (!Phaser.Geom.Intersects.RectangleToRectangle(playerBounds, item.getBounds())) continue;

      const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, item.x, item.y);
      if (distance < nearestDistance) {
        nearestItem = item;
        nearestDistance = distance;
      }
    }

    if (!nearestItem) return false;

    const itemType = nearestItem.getData("itemType");
    this.inventory.push(itemType);
    nearestItem.destroy();
    this._updateInventoryUI();
    return true;
  }

  _createInventoryUI() {
    if (this.inventoryUI) {
      this.inventoryUI.destroy();
    }

    this.inventoryUI = this.add.container(0, 0);
    this.inventoryUI.setScrollFactor(0);
    this.inventoryUI.setDepth(10000);
    this.inventoryUI.setVisible(false);

    const panelWidth = 200;
    const panelHeight = 150;
    const panelX = (SCREEN_PIXEL_WIDTH - panelWidth) / 2;
    const panelY = 20;

    const bg = this.add.rectangle(panelX, panelY, panelWidth, panelHeight, 0x1a1a2e);
    bg.setOrigin(0, 0);
    bg.setStrokeStyle(2, 0xffffff);

    const title = this.add.text(panelX + panelWidth / 2, panelY + 10, "INVENTORY", {
      fontFamily: "ui-monospace, monospace",
      fontSize: "12px",
      color: "#ffffff",
    });
    title.setOrigin(0.5, 0);

    this.inventoryUI.add([bg, title]);
    this.inventoryUI.setData("panelX", panelX);
    this.inventoryUI.setData("panelY", panelY);
    this.inventoryUI.setData("panelWidth", panelWidth);
    this.inventoryUI.setData("slotSprites", []);

    this._updateInventoryUI();
  }

  _updateInventoryUI() {
    if (!this.inventoryUI) return;

    const slotSprites = this.inventoryUI.getData("slotSprites") || [];
    for (const sprite of slotSprites) {
      sprite.destroy();
    }
    slotSprites.length = 0;

    const panelX = this.inventoryUI.getData("panelX");
    const panelY = this.inventoryUI.getData("panelY");
    const panelWidth = this.inventoryUI.getData("panelWidth");
    const itemDefs = this._getItemDefinitions();

    for (let i = 0; i < this.inventoryMaxSize; i++) {
      const slotX = panelX + 30 + i * 50;
      const slotY = panelY + 50;

      const slotBg = this.add.rectangle(slotX, slotY, 40, 40, 0x2d2d44);
      slotBg.setOrigin(0.5, 0.5);
      slotBg.setStrokeStyle(i === this.selectedInventorySlot ? 2 : 1, i === this.selectedInventorySlot ? 0xffff00 : 0x666666);
      this.inventoryUI.add(slotBg);
      slotSprites.push(slotBg);

      if (i < this.inventory.length) {
        const itemType = this.inventory[i];
        const texKey = `item_${itemType}`;
        if (this.textures.exists(texKey)) {
          const itemSprite = this.add.sprite(slotX, slotY, texKey);
          itemSprite.setScale(2);
          this.inventoryUI.add(itemSprite);
          slotSprites.push(itemSprite);

          const def = itemDefs[itemType];
          if (def) {
            const itemName = this.add.text(slotX, slotY + 30, def.name, {
              fontFamily: "ui-monospace, monospace",
              fontSize: "8px",
              color: "#ffffff",
            });
            itemName.setOrigin(0.5, 0);
            this.inventoryUI.add(itemName);
            slotSprites.push(itemName);
          }
        }
      }
    }

    const closeIndex = this.inventoryMaxSize;
    const closeButton = this.add.rectangle(panelX + panelWidth / 2, panelY + 124, 72, 22, 0x2d2d44);
    closeButton.setOrigin(0.5, 0.5);
    closeButton.setStrokeStyle(this.selectedInventorySlot === closeIndex ? 2 : 1, this.selectedInventorySlot === closeIndex ? 0xffff00 : 0x666666);
    this.inventoryUI.add(closeButton);
    slotSprites.push(closeButton);

    const closeText = this.add.text(panelX + panelWidth / 2, panelY + 124, "Close", {
      fontFamily: "ui-monospace, monospace",
      fontSize: "10px",
      color: "#ffffff",
    });
    closeText.setOrigin(0.5, 0.5);
    this.inventoryUI.add(closeText);
    slotSprites.push(closeText);

    this.inventoryUI.setData("slotSprites", slotSprites);
  }

  _openInventory({ justPickedUp = false } = {}) {
    if (!this.inventoryUI) return;
    this.inventoryVisible = true;
    WORMY_KEYS.left = false;
    WORMY_KEYS.right = false;
    WORMY_KEYS.invNavDir = null;

    const closeIndex = this.inventoryMaxSize;
    if (justPickedUp || this.inventory.length === 0) {
      this.selectedInventorySlot = closeIndex;
      this._inventoryReturnSlot = justPickedUp ? Math.max(0, this.inventory.length - 1) : 0;
    } else {
      this.selectedInventorySlot = 0;
      this._inventoryReturnSlot = 0;
    }

    this.inventoryUI.setVisible(true);
    this._updateInventoryUI();
  }

  _closeInventory() {
    if (!this.inventoryUI) return;
    this.inventoryVisible = false;
    this.inventoryUI.setVisible(false);
  }

  _handleInventoryReturn() {
    if (this.selectedInventorySlot >= this.inventoryMaxSize) {
      this._closeInventory();
      return;
    }

    if (this.selectedInventorySlot >= this.inventory.length) return;

    const itemType = this.inventory[this.selectedInventorySlot];
    if (this._findNearbyInteraction()) {
      if (this._tryUseNearbyInteraction(itemType, this.selectedInventorySlot)) {
        this._closeInventory();
        return;
      }
      this._showGameMessage("That doesn't work here.");
      return;
    }

    this._dropSelectedItem();
    this._closeInventory();
  }

  _moveInventoryNav(direction) {
    if (!this.inventoryVisible) return;

    const closeIndex = this.inventoryMaxSize;
    const itemCount = this.inventory.length;

    if (direction === "down") {
      if (this.selectedInventorySlot < closeIndex) {
        this._inventoryReturnSlot = Phaser.Math.Clamp(this.selectedInventorySlot, 0, Math.max(0, itemCount - 1));
        this.selectedInventorySlot = closeIndex;
        this._updateInventoryUI();
      }
      return;
    }

    if (direction === "up") {
      if (this.selectedInventorySlot === closeIndex) {
        this.selectedInventorySlot = this._inventoryReturnSlot ?? 0;
        this._updateInventoryUI();
      }
      return;
    }

    if (this.selectedInventorySlot === closeIndex || itemCount === 0) return;

    const maxItemSlot = itemCount - 1;
    if (direction === "left") {
      this.selectedInventorySlot = this.selectedInventorySlot <= 0 ? maxItemSlot : this.selectedInventorySlot - 1;
    } else if (direction === "right") {
      this.selectedInventorySlot = this.selectedInventorySlot >= maxItemSlot ? 0 : this.selectedInventorySlot + 1;
    }
    this._updateInventoryUI();
  }

  _dropSelectedItem() {
    if (this.inventory.length === 0) return;
    if (this.selectedInventorySlot >= this.inventory.length) return;

    const itemType = this.inventory[this.selectedInventorySlot];
    this.inventory.splice(this.selectedInventorySlot, 1);

    const dropX = this.player.x + (this.player.flipX ? -20 : 20);
    const dropY = this.player.y;
    this._createWorldItem(dropX, dropY, itemType);

    if (this.selectedInventorySlot >= this.inventory.length && this.selectedInventorySlot > 0) {
      this.selectedInventorySlot--;
    }

    this._updateInventoryUI();
  }
}

const config = {
  type: Phaser.AUTO,
  parent: "game",
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  pixelArt: true,
  scale: {
    // Match parent width; height follows the exact 24×13-tile game screen aspect.
    mode: Phaser.Scale.WIDTH_CONTROLS_HEIGHT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    autoRound: false,
  },
  physics: {
    default: "arcade",
    arcade: {
      gravity: { y: PHYS_GRAVITY_Y },
      debug: false,
    },
  },
  scene: [MainScene],
};

new Phaser.Game(config);


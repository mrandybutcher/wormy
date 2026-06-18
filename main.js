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

class MainScene extends Phaser.Scene {
  constructor() {
    super("main");
    this.player = null;
    this.map = null;
    /** DOM-tracked keys (Chrome can desync Phaser’s Key.isDown from real hardware). */
    this._kbdLeft = false;
    this._kbdRight = false;
    this._jumpQueued = false;
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
  }

  preload() {
    // Tiled assets (export your map as JSON)
    // Expected (by default):
    // - Maps/wholemap.json
    // - assets/tiles.png
    //
    // If your map references a different tileset image filename, either:
    // - rename it to tiles.png, or
    // - change the key/path below + the tileset name in create()
    // NOTE: If these files don't exist yet, the scene will fall back to a simple ground.
    this.load.image("tiles", TILESET_IMAGE_URL);
    this.load.json("mapJson", TILEMAP_JSON_URL);
    
    // Load player sprite sheet (2 frames, 16x16 each)
    this.load.spritesheet("player", "assets/sprite_sheet_sample.png", {
      frameWidth: 16,
      frameHeight: 16
    });
  }

  create() {
    this._ensurePlayerTexture();
    this._createPlayerAnimations();

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
      if (layer) createdLayers.push(layer);
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

    this._setupDomKeyboard();

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

    this._bindScaleRefresh();
  }

  update() {
    if (!this.player) return;
    const body = this.player.body;
    body.setAccelerationX(0);
    
    const isMoving = this._kbdLeft || this._kbdRight;
    
    if (this._kbdLeft) {
      body.setVelocityX(-PHYS_WALK_SPEED_X);
      this.player.setFlipX(true);
    } else if (this._kbdRight) {
      body.setVelocityX(PHYS_WALK_SPEED_X);
      this.player.setFlipX(false);
    } else {
      body.setVelocityX(0);
    }

    // Play walk animation when moving, otherwise show idle frame
    if (isMoving) {
      if (this.player.anims && !this.player.anims.isPlaying) {
        this.player.play("player_walk", true);
      }
    } else {
      if (this.player.anims) {
        this.player.stop();
        this.player.setFrame(0);
      }
    }

    const onGround = body.blocked.down || body.touching.down;
    if (onGround && this._jumpQueued) {
      body.setVelocityY(-PHYS_JUMP_VELOCITY);
      this._jumpQueued = false;
    }

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
    this._setupDomKeyboard();

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
  }

  _clearDomKeyboardState() {
    this._kbdLeft = false;
    this._kbdRight = false;
    this._jumpQueued = false;
  }

  /**
   * Track arrows via window keydown/keyup (capture + preventDefault). Phaser’s keyboard stack can miss keyup in Chrome.
   */
  _setupDomKeyboard() {
    if (this._domKbdInstalled) return;
    this._domKbdInstalled = true;

    const arrowCodes = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
    const shouldPrevent = (code) => arrowCodes.includes(code);

    const onDown = (e) => {
      if (shouldPrevent(e.code)) e.preventDefault();

      // OS key-repeat: ignore repeated keydown — state is already “held”; avoids odd double edges.
      if (e.repeat) return;

      if (e.code === "ArrowLeft") this._kbdLeft = true;
      else if (e.code === "ArrowRight") this._kbdRight = true;
      else if (e.code === "ArrowUp") this._jumpQueued = true;
    };

    const onUp = (e) => {
      if (shouldPrevent(e.code)) e.preventDefault();
      if (e.code === "ArrowLeft") this._kbdLeft = false;
      else if (e.code === "ArrowRight") this._kbdRight = false;
    };

    const onBlurOrHide = () => this._clearDomKeyboardState();

    window.addEventListener("keydown", onDown, { capture: true, passive: false });
    window.addEventListener("keyup", onUp, { capture: true, passive: false });
    window.addEventListener("blur", onBlurOrHide, { passive: true });

    const onVisibility = () => {
      if (document.visibilityState !== "visible") onBlurOrHide();
    };
    document.addEventListener("visibilitychange", onVisibility);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener("keydown", onDown, { capture: true });
      window.removeEventListener("keyup", onUp, { capture: true });
      window.removeEventListener("blur", onBlurOrHide, { passive: true });
      document.removeEventListener("visibilitychange", onVisibility);
      this._domKbdInstalled = false;
      this._clearDomKeyboardState();
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

  _createPlayerAnimations() {
    if (!this.textures.exists("player")) return;
    if (this.anims.exists("player_walk")) return;
    
    // Create walking animation using both frames
    this.anims.create({
      key: "player_walk",
      frames: this.anims.generateFrameNumbers("player", { start: 0, end: 1 }),
      frameRate: 8,
      repeat: -1
    });
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


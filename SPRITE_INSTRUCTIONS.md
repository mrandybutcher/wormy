# Using Your Custom Sprite

## Quick Start

Your wormy game is now set up to use animated sprites! Currently it uses a sample sprite, but you can easily replace it with your actual sprite image.

## Replace the Sample Sprite

1. **Save your sprite sheet** as `assets/sprite_sheet.png` (or any name you prefer)

2. **Split it into frames** using the provided script:

```bash
# For a 2-frame sprite in 2 columns:
python3 split_sprite.py assets/sprite_sheet.png 2 2

# For a 4-frame sprite in a 2x2 grid:
python3 split_sprite.py assets/sprite_sheet.png 2 4
```

3. **Update main.js** to point to your sprite sheet:

In the `preload()` method, change:
```javascript
this.load.spritesheet("player", "assets/sprite_sheet_sample.png", {
```

To:
```javascript
this.load.spritesheet("player", "assets/sprite_sheet.png", {
```

4. **Adjust frame count** if needed:

In the `_createPlayerAnimations()` method, update the frame range:
```javascript
frames: this.anims.generateFrameNumbers("player", { start: 0, end: 1 }),
```

Change `end: 1` to match your frame count (e.g., `end: 3` for 4 frames).

## Current Setup

- **Animation**: The player character now animates when moving left/right
- **Idle state**: Shows frame 0 when standing still
- **Frame rate**: 8 fps (adjustable in `_createPlayerAnimations()`)
- **Sprite size**: 16x16 pixels per frame (matches the game's tile size)

## Test the Game

Run a local server:
```bash
python3 -m http.server 8080
```

Then open [http://localhost:8080/](http://localhost:8080/)

Use arrow keys to move and see your animated sprite in action!

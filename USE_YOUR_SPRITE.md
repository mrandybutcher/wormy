# How to Use Your Sprite Image

Hi! Your wormy game is now set up with animated sprites. I've created a sample sprite as a placeholder, but here's how to use your actual sprite image from the Slack conversation.

## Quick Start (Easiest Way)

1. **Save your sprite image** to the wormy project folder (name it anything, e.g., `orange_character.png`)

2. **Run the setup script**:
   ```bash
   ./setup_sprite.sh orange_character.png 2 2
   ```
   
   This will:
   - Copy your sprite to the `assets/` folder
   - Split it into individual frames
   - Tell you what changes to make in the code (if any)

3. **Update the code** (if your file isn't named `sprite_sheet.png`):
   
   Open `main.js` and find this line (around line 88):
   ```javascript
   this.load.spritesheet("player", "assets/sprite_sheet_sample.png", {
   ```
   
   Change it to:
   ```javascript
   this.load.spritesheet("player", "assets/orange_character.png", {
   ```

4. **Test it**:
   ```bash
   python3 -m http.server 8080
   ```
   
   Open http://localhost:8080/ and use arrow keys to move!

## If You Have More Than 2 Frames

From the Slack conversation, it looked like your sprite might have 4 frames in a 2×2 grid. If that's the case:

1. **Use 4 frames instead**:
   ```bash
   ./setup_sprite.sh your_sprite.png 2 4
   ```

2. **Update the animation range** in `main.js`:
   
   Find the `_createPlayerAnimations()` method (around line 413):
   ```javascript
   frames: this.anims.generateFrameNumbers("player", { start: 0, end: 1 }),
   ```
   
   Change `end: 1` to `end: 3` (for 4 frames):
   ```javascript
   frames: this.anims.generateFrameNumbers("player", { start: 0, end: 3 }),
   ```

## Manual Method (If Script Doesn't Work)

1. **Copy your sprite** to `assets/your_sprite.png`

2. **Split it manually** using Python:
   ```bash
   python3 split_sprite.py assets/your_sprite.png 2 2
   ```
   
   (Change the last two numbers based on your layout: columns and total frames)

3. **Update `main.js`** as described above

## Current Setup

Right now the game uses:
- **Sample sprite**: `assets/sprite_sheet_sample.png` (orange placeholder)
- **2 frames**: Frame 0 (idle) and Frame 1 (walking)
- **Animation**: Plays at 8 fps when moving left/right
- **Sprite size**: 16×16 pixels per frame

## What the Animation Does

- When you **stand still**: Shows frame 0 (idle pose)
- When you **move left/right**: Cycles through all frames (walk animation)
- **Direction**: The sprite automatically flips when you change direction

## Files Created

- `assets/sprite_sheet_sample.png` - Sample sprite sheet
- `assets/player_frame_0.png` - First frame (extracted)
- `assets/player_frame_1.png` - Second frame (extracted)
- `split_sprite.py` - Script to split sprite sheets
- `create_sample_sprite.py` - Script that created the sample
- `setup_sprite.sh` - Easy setup script
- `SPRITE_INSTRUCTIONS.md` - Detailed technical docs

## Need Help?

See `SPRITE_INSTRUCTIONS.md` for more detailed technical information.

Your sprite from the Slack conversation looks perfect for this! Just follow the Quick Start steps above and you'll see your orange character animated in the game.

#!/bin/bash
# Quick setup script for using your custom sprite in the wormy game

echo "===================================="
echo "Wormy Sprite Setup"
echo "===================================="
echo ""

# Check if a sprite file was provided
if [ $# -eq 0 ]; then
    echo "Usage: ./setup_sprite.sh <path_to_your_sprite.png> [columns] [frame_count]"
    echo ""
    echo "Examples:"
    echo "  ./setup_sprite.sh my_sprite.png 2 2       # 2 frames in 2 columns"
    echo "  ./setup_sprite.sh my_sprite.png 2 4       # 4 frames in 2x2 grid"
    echo ""
    echo "Current setup uses sample sprite (2 frames)."
    echo "To use your own sprite, save it and run this script."
    exit 1
fi

SPRITE_FILE=$1
COLS=${2:-2}
FRAMES=${3:-2}

# Check if file exists
if [ ! -f "$SPRITE_FILE" ]; then
    echo "Error: File '$SPRITE_FILE' not found!"
    exit 1
fi

echo "Processing sprite: $SPRITE_FILE"
echo "Columns: $COLS"
echo "Frames: $FRAMES"
echo ""

# Copy sprite to assets folder
SPRITE_NAME=$(basename "$SPRITE_FILE")
cp "$SPRITE_FILE" "assets/$SPRITE_NAME"
echo "✓ Copied sprite to assets/$SPRITE_NAME"

# Split into frames
echo ""
echo "Splitting sprite into individual frames..."
python3 split_sprite.py "assets/$SPRITE_NAME" $COLS $FRAMES

# Update main.js if not using the default name
if [ "$SPRITE_NAME" != "sprite_sheet_sample.png" ] && [ "$SPRITE_NAME" != "sprite_sheet.png" ]; then
    echo ""
    echo "⚠ Note: Update main.js to use your sprite:"
    echo "   Change 'assets/sprite_sheet_sample.png' to 'assets/$SPRITE_NAME'"
    echo "   in the preload() method"
fi

# Adjust frame count if different from 2
if [ $FRAMES -ne 2 ]; then
    echo ""
    echo "⚠ Note: Update the animation frame range in main.js:"
    echo "   In _createPlayerAnimations(), change 'end: 1' to 'end: $((FRAMES-1))'"
fi

echo ""
echo "===================================="
echo "✓ Setup complete!"
echo "===================================="
echo ""
echo "Test your game:"
echo "  python3 -m http.server 8080"
echo "  Open http://localhost:8080/"
echo ""

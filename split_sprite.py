#!/usr/bin/env python3
"""
Split a sprite sheet into individual frames.
Assumes a 2-column grid layout with equal-sized frames.
"""

from PIL import Image
import sys
import os

def split_sprite_sheet(input_path, output_dir, cols=2, frame_count=2):
    """
    Split a sprite sheet into individual frame images.
    
    Args:
        input_path: Path to the sprite sheet image
        output_dir: Directory to save individual frames
        cols: Number of columns in the sprite sheet
        frame_count: Total number of frames to extract
    """
    # Load the sprite sheet
    sprite_sheet = Image.open(input_path)
    width, height = sprite_sheet.size
    
    print(f"Sprite sheet size: {width}x{height}")
    
    # Calculate frame dimensions
    frame_width = width // cols
    rows = (frame_count + cols - 1) // cols  # Ceiling division
    frame_height = height // rows
    
    print(f"Frame size: {frame_width}x{frame_height}")
    print(f"Grid: {cols} cols x {rows} rows")
    print(f"Extracting {frame_count} frames...")
    
    # Create output directory if it doesn't exist
    os.makedirs(output_dir, exist_ok=True)
    
    # Extract each frame
    frames_extracted = 0
    for row in range(rows):
        for col in range(cols):
            if frames_extracted >= frame_count:
                break
                
            # Calculate the crop box for this frame
            left = col * frame_width
            top = row * frame_height
            right = left + frame_width
            bottom = top + frame_height
            
            # Crop the frame
            frame = sprite_sheet.crop((left, top, right, bottom))
            
            # Save the frame
            frame_path = os.path.join(output_dir, f"player_frame_{frames_extracted}.png")
            frame.save(frame_path)
            print(f"Saved: {frame_path}")
            
            frames_extracted += 1
        
        if frames_extracted >= frame_count:
            break
    
    print(f"\nSuccessfully extracted {frames_extracted} frames to {output_dir}/")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 split_sprite.py <input_sprite_sheet.png> [cols] [frame_count]")
        print("Example: python3 split_sprite.py sprite_sheet.png 2 2")
        sys.exit(1)
    
    input_path = sys.argv[1]
    cols = int(sys.argv[2]) if len(sys.argv) > 2 else 2
    frame_count = int(sys.argv[3]) if len(sys.argv) > 3 else 2
    
    output_dir = "assets"
    
    split_sprite_sheet(input_path, output_dir, cols, frame_count)

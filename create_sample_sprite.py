#!/usr/bin/env python3
"""
Create a sample orange pixel art sprite sheet for demonstration.
User should replace this with their actual sprite image.
"""

from PIL import Image, ImageDraw

def create_sample_sprite():
    # Create a 32x16 sprite sheet (2 frames, 16x16 each)
    frame_width = 16
    frame_height = 16
    cols = 2
    
    sprite_sheet = Image.new('RGBA', (frame_width * cols, frame_height), (255, 255, 255, 0))
    draw = ImageDraw.Draw(sprite_sheet)
    
    # Orange color
    orange = (255, 127, 39)
    brown = (101, 67, 33)
    
    # Frame 1 (left) - Simple orange blob shape
    # Draw a pixelated character
    frame1_pixels = [
        (4, 2), (5, 2), (6, 2),
        (3, 3), (4, 3), (5, 3), (6, 3), (7, 3),
        (2, 4), (3, 4), (4, 4), (5, 4), (6, 4), (7, 4), (8, 4),
        (2, 5), (3, 5), (4, 5), (5, 5), (6, 5), (7, 5), (8, 5),
        (2, 6), (3, 6), (4, 6), (5, 6), (6, 6), (7, 6), (8, 6),
        (3, 7), (4, 7), (5, 7), (6, 7), (7, 7),
        (3, 8), (4, 8), (6, 8), (7, 8),
        (2, 9), (3, 9), (7, 9), (8, 9),
        (2, 10), (3, 10), (7, 10), (8, 10),
        (3, 11), (4, 11), (6, 11), (7, 11),
        (4, 12), (5, 12), (6, 12),
    ]
    
    for x, y in frame1_pixels:
        draw.point((x, y), fill=orange)
    
    # Frame 2 (right) - Similar shape with eye
    offset = frame_width
    frame2_pixels = [
        (4+offset, 2), (5+offset, 2), (6+offset, 2),
        (3+offset, 3), (4+offset, 3), (5+offset, 3), (6+offset, 3), (7+offset, 3),
        (2+offset, 4), (3+offset, 4), (4+offset, 4), (5+offset, 4), (6+offset, 4), (7+offset, 4), (8+offset, 4),
        (2+offset, 5), (3+offset, 5), (4+offset, 5), (5+offset, 5), (6+offset, 5), (7+offset, 5), (8+offset, 5),
        (2+offset, 6), (3+offset, 6), (4+offset, 6), (5+offset, 6), (6+offset, 6), (7+offset, 6), (8+offset, 6),
        (3+offset, 7), (4+offset, 7), (5+offset, 7), (6+offset, 7), (7+offset, 7),
        (3+offset, 8), (4+offset, 8), (6+offset, 8), (7+offset, 8),
        (2+offset, 9), (3+offset, 9), (7+offset, 9), (8+offset, 9),
        (2+offset, 10), (3+offset, 10), (7+offset, 10), (8+offset, 10),
        (3+offset, 11), (4+offset, 11), (6+offset, 11), (7+offset, 11),
        (4+offset, 12), (5+offset, 12), (6+offset, 12),
    ]
    
    for x, y in frame2_pixels:
        draw.point((x, y), fill=orange)
    
    # Add brown eye to frame 2
    eye_pixels = [
        (5+offset, 4), (6+offset, 4),
        (5+offset, 5), (6+offset, 5),
    ]
    
    for x, y in eye_pixels:
        draw.point((x, y), fill=brown)
    
    # Save the sprite sheet
    sprite_sheet.save('assets/sprite_sheet_sample.png')
    print("Created sample sprite sheet: assets/sprite_sheet_sample.png")
    print("This is a placeholder - replace it with your actual sprite image!")

if __name__ == "__main__":
    create_sample_sprite()

import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

def generate_watermark(output_path: str = "/home/kai/projects/gapirai.uz/backend/assets/watermark_gapirai.png"):
    src_path = "/home/kai/projects/gapirai.uz/backend/assets/logodark.png"
    if not os.path.exists(src_path):
        raise FileNotFoundError(f"Source logo not found at {src_path}")
    
    im = Image.open(src_path).convert("RGBA")

    # Crop emblem from upper part of logodark
    icon = im.crop((150, 0, 890, 500))
    bbox = icon.getbbox()
    cropped_icon = icon.crop(bbox)

    # Hi-Res Canvas: 240x290
    badge_size = 190
    badge = Image.new("RGBA", (badge_size, badge_size), (0, 0, 0, 0))
    draw_b = ImageDraw.Draw(badge)

    # Modern gradient background: royal indigo to vibrant purple (#3b82f6 -> #8b5cf6 -> #7c3aed)
    for y in range(badge_size):
        ratio = y / badge_size
        r = int(59 + (124 - 59) * ratio)
        g = int(130 + (58 - 130) * ratio)
        b = int(246 + (237 - 246) * ratio)
        draw_b.line([(0, y), (badge_size, y)], fill=(r, g, b, 235))

    # Smooth rounded corners mask (radius=44 for 190px badge)
    mask = Image.new("L", (badge_size * 2, badge_size * 2), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle([(0, 0), (badge_size * 2 - 1, badge_size * 2 - 1)], radius=88, fill=255)
    mask = mask.resize((badge_size, badge_size), Image.Resampling.LANCZOS)
    badge.putalpha(mask)

    # Scale emblem to fit inside badge with balanced padding
    icon_w = 130
    icon_h = int(cropped_icon.height * (icon_w / cropped_icon.width))
    resized_icon = cropped_icon.resize((icon_w, icon_h), Image.Resampling.LANCZOS)

    # Clean crisp white emblem inside badge
    white_icon = Image.new("RGBA", resized_icon.size, (255, 255, 255, 255))
    white_icon.putalpha(resized_icon.split()[3])

    ix = (badge_size - icon_w) // 2
    iy = (badge_size - icon_h) // 2
    badge.paste(white_icon, (ix, iy), white_icon)

    # Typography: Ubuntu-B or DejaVuSans-Bold
    font_candidates = [
        "/usr/share/fonts/truetype/ubuntu/Ubuntu-B.ttf",
        "/usr/share/fonts/truetype/ubuntu/Ubuntu-M.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ]
    font_path = next((f for f in font_candidates if os.path.exists(f)), None)
    font_size = 28
    font = ImageFont.truetype(font_path, font_size) if font_path else ImageFont.load_default()

    text = "gapirai.uz"
    dummy = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    t_bbox = dummy.textbbox((0, 0), text, font=font)
    tw = t_bbox[2] - t_bbox[0]
    th = t_bbox[3] - t_bbox[1]

    canvas_w = max(badge_size, tw + 20)
    canvas_h = badge_size + 10 + th + 14

    wm = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    bx = (canvas_w - badge_size) // 2
    wm.paste(badge, (bx, 0), badge)

    tx = (canvas_w - tw) // 2
    ty = badge_size + 8

    # Soft subtle drop-shadow for text (blur layer)
    shadow = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    s_draw = ImageDraw.Draw(shadow)
    s_draw.text((tx, ty + 2), text, font=font, fill=(0, 0, 0, 160))
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=2))
    wm = Image.alpha_composite(wm, shadow)

    # Crisp white text layer
    text_layer = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    t_draw = ImageDraw.Draw(text_layer)
    # Subtle 1px stroke
    for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
        t_draw.text((tx + dx, ty + dy), text, font=font, fill=(0, 0, 0, 90))
    t_draw.text((tx, ty), text, font=font, fill=(255, 255, 255, 235))
    wm = Image.alpha_composite(wm, text_layer)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    wm.save(output_path, "PNG")
    print(f"Generated refined watermark at {output_path} (size={wm.size})")

if __name__ == "__main__":
    generate_watermark()

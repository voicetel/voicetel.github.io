#!/usr/bin/env python3
"""Generate the default Open Graph image at src/assets/img/og-default.png.
1200x630 PNG, ~slate background with the VoiceTel wordmark + tagline.
Designed to match the navbar slate (--primary-color #2c3e50)."""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "assets" / "img" / "og-default.png"

W, H = 1200, 630
BG = (44, 62, 80)        # #2c3e50, --primary-color
ACCENT = (52, 152, 219)  # #3498db, --primary-light
TEXT = (255, 255, 255)
SUBTITLE = (200, 211, 217)  # cool light grey

FONTS = [
	"/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
	"/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
	"/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
]
FONTS_REGULAR = [
	"/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
	"/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
	"/usr/share/fonts/TTF/DejaVuSans.ttf",
]


def first_font(paths, size):
	for p in paths:
		if Path(p).exists():
			return ImageFont.truetype(p, size)
	return ImageFont.load_default()


def main():
	img = Image.new("RGB", (W, H), BG)
	draw = ImageDraw.Draw(img)

	# Accent rule along the left edge
	draw.rectangle([0, 0, 8, H], fill=ACCENT)

	# Wordmark
	title_font = first_font(FONTS, 132)
	title = "VoiceTel"
	tw = draw.textlength(title, font=title_font)
	draw.text(((W - tw) / 2, 200), title, fill=TEXT, font=title_font)

	# Tagline
	tagline_font = first_font(FONTS_REGULAR, 36)
	tagline = "Licensed Wholesale Telecommunication Services"
	tlw = draw.textlength(tagline, font=tagline_font)
	draw.text(((W - tlw) / 2, 360), tagline, fill=SUBTITLE, font=tagline_font)

	# Bottom strip with product list
	products_font = first_font(FONTS, 24)
	products = "Voice  ·  Messaging  ·  Numbers  ·  SIP Trunking  ·  PBX"
	pw = draw.textlength(products, font=products_font)
	draw.text(((W - pw) / 2, 530), products, fill=ACCENT, font=products_font)

	OUT.parent.mkdir(parents=True, exist_ok=True)
	img.save(OUT, "PNG", optimize=True)
	print(f"Wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
	main()

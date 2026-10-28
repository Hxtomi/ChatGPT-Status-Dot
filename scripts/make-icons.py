"""Recreate the original Status Dot artwork. Optional developer tool: Pillow."""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]


def icon(size):
    scale = 4
    image = Image.new('RGBA', (128 * scale, 128 * scale))
    draw = ImageDraw.Draw(image)

    def box(coords):
        return tuple(round(v * scale) for v in coords)

    draw.rounded_rectangle(box((0, 0, 128, 128)), radius=28 * scale, fill='#20242F')
    draw.rounded_rectangle(box((21, 25, 102, 89)), radius=18 * scale, fill='#EDF1FC')
    draw.polygon([box((28, 76)), box((26, 104)), box((59, 83))], fill='#EDF1FC')
    draw.rounded_rectangle(box((36, 43, 83, 49)), radius=3 * scale, fill='#626C85')
    draw.rounded_rectangle(box((36, 59, 68, 65)), radius=3 * scale, fill='#626C85')
    draw.ellipse(box((75, 73, 123, 121)), fill='#20242F')
    draw.ellipse(box((80, 78, 118, 116)), fill='#91ACF2')
    draw.ellipse(box((87, 85, 111, 109)), fill='#65D6A0')
    return image.resize((size, size), Image.Resampling.LANCZOS)


def main():
    folder = ROOT / 'extension' / 'icons'
    folder.mkdir(exist_ok=True)
    for size in (16, 32, 48, 128):
        icon(size).save(folder / f'icon-{size}.png', optimize=True)
    assets = ROOT / 'docs' / 'edge' / 'assets'
    assets.mkdir(parents=True, exist_ok=True)
    icon(300).save(assets / 'store-logo-300.png', optimize=True)


if __name__ == '__main__':
    main()

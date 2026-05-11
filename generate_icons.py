"""
Генерация фавиконок и иконок PWA для TYPE Moscow.
Рендерит TYPE-mark напрямую в Pillow (без cairo) по координатам из SVG.
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).parent
ASSETS = ROOT / "assets"
ICONS_DIR = ASSETS / "icons"
ICONS_DIR.mkdir(parents=True, exist_ok=True)

INK = (11, 11, 11)
PAPER = (235, 234, 229)

# SVG type-mark.svg, viewBox 71x60. Вершины 3 заливных путей.
SVG_W, SVG_H = 71.0, 60.0
PATHS = [
    # Левая «Г»-форма
    [(0, 30), (0, 60), (7.45, 60), (14.91, 60), (14.91, 56.65), (14.91, 53.31),
     (11.24, 53.29), (7.57, 53.25), (7.53, 26.62), (7.51, 0), (3.75, 0), (0, 0)],
    # Маленький прямоугольник-акцент сверху
    [(31.63, 8.45), (31.63, 16.9), (35.39, 16.9), (39.14, 16.9),
     (39.14, 8.45), (39.14, 0), (35.39, 0), (31.63, 0)],
    # Правая «Г»-форма
    [(63.26, 26.65), (63.26, 53.31), (51.24, 53.29), (39.20, 53.25),
     (39.16, 39.04), (39.14, 24.84), (35.39, 24.84), (31.63, 24.84),
     (31.61, 39.04), (31.58, 53.25), (27.23, 53.29), (22.87, 53.31),
     (22.87, 56.65), (22.87, 60), (46.94, 60), (71.0, 60),
     (71.0, 30), (71.0, 0), (67.13, 0), (63.26, 0)],
]

SIZES = {
    "favicon-16x16.png":            16,
    "favicon-32x32.png":            32,
    "favicon-48x48.png":            48,
    "apple-touch-icon.png":         180,
    "android-chrome-192x192.png":   192,
    "android-chrome-512x512.png":   512,
    "mstile-150x150.png":           150,
    "maskable-512x512.png":         512,
}


def draw_logo(canvas: Image.Image, logo_size: int):
    """Рисует TYPE-mark белым по центру canvas, заданной шириной logo_size."""
    cw, ch = canvas.size
    scale = logo_size / SVG_W
    # супер-сэмплинг для гладких краёв на маленьких иконках
    SS = 4
    big_w = int(SVG_W * scale * SS)
    big_h = int(SVG_H * scale * SS)
    big = Image.new("RGBA", (big_w, big_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(big)
    for path in PATHS:
        scaled = [(x * scale * SS, y * scale * SS) for (x, y) in path]
        draw.polygon(scaled, fill=PAPER + (255,))
    # Уменьшаем обратно с anti-aliasing
    big = big.resize((int(SVG_W * scale), int(SVG_H * scale)), Image.LANCZOS)
    lw, lh = big.size
    pos = ((cw - lw) // 2, (ch - lh) // 2)
    canvas.alpha_composite(big, dest=pos)


def render_icon(size: int, padding_ratio: float = 0.22) -> Image.Image:
    """Иконка size×size: тёмный фон + логотип в центре."""
    canvas = Image.new("RGBA", (size, size), INK + (255,))
    logo_size = int(size * (1 - padding_ratio * 2))
    draw_logo(canvas, logo_size)
    return canvas.convert("RGB")


def render_maskable(size: int) -> Image.Image:
    """Maskable иконка — логотип в safe-zone (~55%)."""
    canvas = Image.new("RGBA", (size, size), INK + (255,))
    logo_size = int(size * 0.45)  # 55% safe zone от центра
    draw_logo(canvas, logo_size)
    return canvas.convert("RGB")


def make_all():
    for filename, size in SIZES.items():
        if "maskable" in filename:
            img = render_maskable(size)
        elif size <= 48:
            img = render_icon(size, padding_ratio=0.10)
        else:
            img = render_icon(size, padding_ratio=0.22)
        out = ICONS_DIR / filename
        img.save(out, "PNG", optimize=True)
        print(f"  + {filename}  ({size}x{size}, {out.stat().st_size / 1024:.1f} KB)")

    # favicon.ico — мульти-размерный (16, 32, 48)
    ico_sizes = [(16, 16), (32, 32), (48, 48)]
    ico_images = [render_icon(w, padding_ratio=0.10) for (w, _) in ico_sizes]
    ico_path = ROOT / "favicon.ico"
    ico_images[0].save(
        ico_path, format="ICO", sizes=ico_sizes,
        append_images=ico_images[1:],
    )
    print(f"  + favicon.ico (multi-size, {ico_path.stat().st_size / 1024:.1f} KB)")


if __name__ == "__main__":
    print("Генерация иконок TYPE Moscow...")
    make_all()
    print("Готово.")

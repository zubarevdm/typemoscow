"""
Финальная обработка логотипов партнёров:

1. SVG (yandex, vk, skolkovo) — удаляем фоновую плашку (цветной круг/квадрат),
   оставляем только foreground (буквы/текст). Иначе после brightness(0)
   фон и foreground сливаются в одно чёрное пятно.

2. PNG (sber, takto, mastersuite, shevelizm.svg) — auto-crop до bounding box
   непрозрачного контента, чтобы убрать пустое поле вокруг лого.
"""

import re
from pathlib import Path
from PIL import Image

PARTNERS_DIR = Path(__file__).parent / "public" / "assets" / "partners"


def patch_svg(path: Path, fills_to_remove: list[str]):
    text = path.read_text(encoding="utf-8")
    # Удаляем целиком <path ... fill="<hex>" ... /> с любым из заданных fill.
    for fill in fills_to_remove:
        # SVG может писать fill="#xxx" или style="fill:#xxx" — ловим оба.
        pat_attr = re.compile(
            r'<path\b[^>]*?\bfill\s*=\s*"' + re.escape(fill) + r'"[^>]*/>',
            re.IGNORECASE | re.DOTALL,
        )
        text, n1 = pat_attr.subn("", text)
        pat_style = re.compile(
            r'<path\b[^>]*?style\s*=\s*"[^"]*fill\s*:\s*' + re.escape(fill) + r'[^"]*"[^>]*/>',
            re.IGNORECASE | re.DOTALL,
        )
        text, n2 = pat_style.subn("", text)
        if n1 + n2:
            print(f"  removed {n1+n2} path(s) with fill={fill} from {path.name}")
    path.write_text(text, encoding="utf-8")


def crop_png(path: Path, padding: int = 8):
    img = Image.open(path).convert("RGBA")
    bbox = img.getbbox()
    if not bbox:
        print(f"  SKIP crop {path.name}: empty image")
        return
    # Добавляем небольшой запас по краям
    x0, y0, x1, y1 = bbox
    x0 = max(0, x0 - padding)
    y0 = max(0, y0 - padding)
    x1 = min(img.size[0], x1 + padding)
    y1 = min(img.size[1], y1 + padding)
    cropped = img.crop((x0, y0, x1, y1))
    cropped.save(path, "PNG", optimize=True)
    print(f"  cropped {path.name}: {img.size} -> {cropped.size}")


def main():
    print("Patching SVG backgrounds...")
    patch_svg(PARTNERS_DIR / "yandex.svg",   ["#FC3F1D"])
    patch_svg(PARTNERS_DIR / "vk.svg",       ["#0077FF"])
    patch_svg(PARTNERS_DIR / "skolkovo.svg", ["#bfdf14"])

    print("\nCropping PNG logos to content bbox...")
    for name in ["sber.png", "takto.png", "mastersuite.png"]:
        path = PARTNERS_DIR / name
        if path.exists():
            crop_png(path)


if __name__ == "__main__":
    main()

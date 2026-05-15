"""
Обрабатывает логотипы партнёров из ../../Логотипы партнеры/ в монохромные
PNG с прозрачным фоном. SVG копирует как есть — на сайте к ним применяется
CSS filter: brightness(0) для перекраски в монохром.

JPG/WebP без альфы: белый/почти-белый фон делается прозрачным через порог.
"""

import shutil
from pathlib import Path
from PIL import Image

SRC = Path(__file__).parent.parent.parent / "Логотипы партнеры"
DST = Path(__file__).parent / "public" / "assets" / "partners"
DST.mkdir(parents=True, exist_ok=True)

# (исходный файл) ->(целевой id партнёра в partners.json)
MAPPING = {
    "ЯНДЕКС.svg":         "yandex",
    "ВК.svg":             "vk",
    "СКОЛКОВО.svg":       "skolkovo",
    "Shevelizm.svg":      "shevelizm",
    "МАСТЕРСЬЮТ.png":     "mastersuite",
    "СБЕР.jpg":           "sber",
    "TA_K_TO.jpg.webp":   "takto",
}

# Порог осветления для удаления фона (0–255). Чем выше — тем меньше пикселей
# считается фоном. 230 — стандартное значение для логотипов на белом.
BG_THRESHOLD = 230


def remove_white_background(img: Image.Image) -> Image.Image:
    """Делает пиксели светлее BG_THRESHOLD прозрачными."""
    img = img.convert("RGBA")
    pixels = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if r >= BG_THRESHOLD and g >= BG_THRESHOLD and b >= BG_THRESHOLD:
                pixels[x, y] = (255, 255, 255, 0)
    return img


def main():
    for src_name, dst_id in MAPPING.items():
        src_path = SRC / src_name
        if not src_path.exists():
            print(f"SKIP: {src_path} not found")
            continue

        ext = src_path.suffix.lower()

        if ext == ".svg":
            dst_path = DST / f"{dst_id}.svg"
            shutil.copy2(src_path, dst_path)
            print(f"COPY: {src_name} ->{dst_path.name}")
            continue

        # Растровые: JPG / WEBP / PNG
        img = Image.open(src_path)

        if ext in {".jpg", ".jpeg", ".webp"} or (ext == ".png" and img.mode != "RGBA"):
            img = remove_white_background(img)
        else:
            img = img.convert("RGBA")

        # Сжимаем до разумных размеров (макс 800px по большей стороне)
        max_side = 800
        if max(img.size) > max_side:
            ratio = max_side / max(img.size)
            new_size = (int(img.size[0] * ratio), int(img.size[1] * ratio))
            img = img.resize(new_size, Image.LANCZOS)

        dst_path = DST / f"{dst_id}.png"
        img.save(dst_path, "PNG", optimize=True)
        print(f"PROC: {src_name} ->{dst_path.name}  ({img.size[0]}x{img.size[1]})")


if __name__ == "__main__":
    main()

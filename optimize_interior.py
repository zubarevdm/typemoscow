"""
Оптимизация интерьерных рендеров — макс. 1600px по длинной стороне, JPG q=85.
Цель: с 2.5MB → ~300KB без видимой потери качества.
"""
from PIL import Image, ImageOps
from pathlib import Path

ROOT = Path(__file__).parent
INTERIOR = ROOT / "assets" / "interior"
BACKUP = ROOT / "assets" / "interior" / "_originals"
BACKUP.mkdir(parents=True, exist_ok=True)

# Только реально используемые на сайте интерьерные render-ы
TARGETS = ["10.jpg", "11.jpg", "20.jpg", "15.jpg", "16.jpg"]
MAX_SIZE = 1600  # px по длинной стороне
QUALITY = 85

def optimize(name: str):
    src = INTERIOR / name
    if not src.exists():
        print(f"  ! пропущен (нет файла): {name}")
        return
    original_size = src.stat().st_size

    # бэкап оригинала
    backup_path = BACKUP / name
    if not backup_path.exists():
        backup_path.write_bytes(src.read_bytes())

    img = Image.open(src)
    img = ImageOps.exif_transpose(img)
    img = img.convert("RGB")

    # уменьшаем если больше MAX_SIZE
    w, h = img.size
    longest = max(w, h)
    if longest > MAX_SIZE:
        scale = MAX_SIZE / longest
        new_size = (int(w * scale), int(h * scale))
        img = img.resize(new_size, Image.LANCZOS)

    img.save(src, "JPEG", quality=QUALITY, optimize=True, progressive=True)
    new_size = src.stat().st_size
    saved_pct = (1 - new_size / original_size) * 100
    print(f"  + {name}: {original_size/1024:.0f}KB → {new_size/1024:.0f}KB ({saved_pct:.0f}% меньше)")

if __name__ == "__main__":
    print(f"Оптимизация интерьерных фото (макс {MAX_SIZE}px, q={QUALITY})...")
    print(f"Бэкап оригиналов: assets/interior/_originals/")
    for t in TARGETS:
        optimize(t)
    print("Готово.")

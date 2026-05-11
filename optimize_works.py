"""
Подготовка фото работ из оригиналов в _originals_2x:
  - assets/works/DSCFxxxx.JPG          — 800px (retina/desktop, ~100KB)
  - assets/works/_mobile/DSCFxxxx.JPG  — 400px (мобильный 1x, ~30KB)
Запускать после добавления новой работы в _originals_2x.
"""
from PIL import Image, ImageOps
from pathlib import Path

ROOT = Path(__file__).parent
WORKS = ROOT / "assets" / "works"
ORIGINALS = WORKS / "_originals_2x"
MOBILE = WORKS / "_mobile"
MOBILE.mkdir(parents=True, exist_ok=True)

DESKTOP_WIDTH = 800   # 2x retina, отображается ~400px
MOBILE_WIDTH = 400    # 1x для мобильного 372px display
QUALITY = 82


def make_variant(src_path: Path, dst_path: Path, max_width: int) -> tuple[int, int]:
    """Сохраняет уменьшенный JPEG. Возвращает (исходный размер байт, новый размер)."""
    img = Image.open(src_path)
    img = ImageOps.exif_transpose(img)
    img = img.convert("RGB")

    w, h = img.size
    if w > max_width:
        scale = max_width / w
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

    dst_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(dst_path, "JPEG", quality=QUALITY, optimize=True, progressive=True)
    return src_path.stat().st_size, dst_path.stat().st_size


def optimize_all():
    # Источник — _originals_2x. Если там пусто, берём текущие файлы из WORKS как исходник (одноразовый backup).
    sources = sorted(ORIGINALS.glob("DSCF*.JPG"))
    if not sources:
        print("[!] _originals_2x пуст — копирую текущие файлы как исходники.")
        for src in sorted(WORKS.glob("DSCF*.JPG")):
            backup = ORIGINALS / src.name
            backup.parent.mkdir(parents=True, exist_ok=True)
            backup.write_bytes(src.read_bytes())
        sources = sorted(ORIGINALS.glob("DSCF*.JPG"))

    for src in sources:
        # Desktop-вариант (800px) -> assets/works/DSCFxxxx.JPG
        dt_orig, dt_new = make_variant(src, WORKS / src.name, DESKTOP_WIDTH)
        # Mobile-вариант (400px) -> assets/works/_mobile/DSCFxxxx.JPG
        _, mb_new = make_variant(src, MOBILE / src.name, MOBILE_WIDTH)
        print(
            f"  + {src.name}: orig {dt_orig/1024:.0f}KB -> "
            f"800px {dt_new/1024:.0f}KB, 400px {mb_new/1024:.0f}KB"
        )


if __name__ == "__main__":
    print(f"Resize works: desktop={DESKTOP_WIDTH}px, mobile={MOBILE_WIDTH}px, q={QUALITY}...")
    optimize_all()
    print("Done.")

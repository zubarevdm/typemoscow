"""
Уменьшение фото работ: 1200x1799 → 700x1050 (2x retina для display 372x558).
Lighthouse рекомендовал — экономия ~670 KB на LCP.
"""
from PIL import Image, ImageOps
from pathlib import Path

ROOT = Path(__file__).parent
WORKS = ROOT / "assets" / "works"
BACKUP = WORKS / "_originals_2x"
BACKUP.mkdir(parents=True, exist_ok=True)

MAX_WIDTH = 800  # 2x от display ~400px

def optimize_all():
    files = sorted(WORKS.glob("DSCF*.JPG"))
    for src in files:
        original_size = src.stat().st_size
        backup_path = BACKUP / src.name
        if not backup_path.exists():
            backup_path.write_bytes(src.read_bytes())

        img = Image.open(src)
        img = ImageOps.exif_transpose(img)
        img = img.convert("RGB")

        w, h = img.size
        if w > MAX_WIDTH:
            scale = MAX_WIDTH / w
            new_size = (int(w * scale), int(h * scale))
            img = img.resize(new_size, Image.LANCZOS)

        img.save(src, "JPEG", quality=85, optimize=True, progressive=True)
        new_size = src.stat().st_size
        saved = (1 - new_size / original_size) * 100
        print(f"  + {src.name}: {original_size/1024:.0f}KB -> {new_size/1024:.0f}KB ({saved:.0f}%)")

if __name__ == "__main__":
    print(f"Resize works to max {MAX_WIDTH}px...")
    optimize_all()
    print("Done.")

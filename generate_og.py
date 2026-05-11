"""
Генерация OG-картинки 1200x630 для TYPE Moscow.
Композиция: интерьер слева, тёмная панель с лого и текстом справа.
"""
from PIL import Image, ImageDraw, ImageFont, ImageOps, ImageFilter
from pathlib import Path

ROOT = Path(__file__).parent
ASSETS = ROOT / "assets"
OUT = ASSETS / "og-image.jpg"

# Размеры OG (Facebook/Open Graph стандарт)
W, H = 1200, 630

# Палитра бренда
INK = (11, 11, 11)
PAPER = (235, 234, 229)
FOREST = (4, 38, 21)
ASH = (160, 160, 160)

# Шрифты
DISKET_BOLD = ASSETS / "fonts" / "Disket-Mono-Bold.ttf"
DISKET_REG  = ASSETS / "fonts" / "Disket-Mono-Regular.ttf"

# Источник: одно из render-фото интерьера
SRC = ASSETS / "interior" / "10.jpg"

def make():
    # === Фон: интерьер ===
    bg = Image.open(SRC)
    bg = ImageOps.exif_transpose(bg)
    bg = bg.convert("RGB")

    # Кропим под 1200x630 (cover)
    src_w, src_h = bg.size
    target_ratio = W / H
    src_ratio = src_w / src_h

    if src_ratio > target_ratio:
        # шире чем надо — обрезаем по бокам
        new_w = int(src_h * target_ratio)
        left = (src_w - new_w) // 2
        bg = bg.crop((left, 0, left + new_w, src_h))
    else:
        # выше чем надо — обрезаем сверху/снизу
        new_h = int(src_w / target_ratio)
        top = (src_h - new_h) // 2
        bg = bg.crop((0, top, src_w, top + new_h))

    bg = bg.resize((W, H), Image.LANCZOS)

    # Лёгкое размытие + затемнение для читаемости текста
    blurred = bg.filter(ImageFilter.GaussianBlur(radius=2))
    bg = Image.blend(bg, blurred, 0.3)

    # === Тёмный градиент слева (под текст) ===
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    for x in range(W):
        if x < W * 0.55:
            alpha = int(220 * (1 - x / (W * 0.55)) ** 1.2)
        else:
            alpha = 0
        draw.line([(x, 0), (x, H)], fill=(11, 11, 11, alpha))

    bg = bg.convert("RGBA")
    bg = Image.alpha_composite(bg, overlay).convert("RGB")

    # Общее лёгкое затемнение
    dark = Image.new("RGB", (W, H), INK)
    bg = Image.blend(bg, dark, 0.18)

    draw = ImageDraw.Draw(bg)

    # === Тонкая рамка по периметру (отступ 24px) ===
    pad = 24
    draw.rectangle([pad, pad, W - pad, H - pad], outline=(235, 234, 229, 90), width=1)

    # === Мини-метка слева сверху ===
    f_tag = ImageFont.truetype(str(DISKET_BOLD), 16)
    tag_text = "EST. 2024  ·  MOSCOW"
    draw.text((68, 64), tag_text, font=f_tag, fill=(235, 234, 229, 200))

    # Горизонтальная чёрточка над тэглайном
    draw.line([(68, 56), (140, 56)], fill=(235, 234, 229, 200), width=2)

    # === Логотип TYPE — большим шрифтом ===
    f_logo = ImageFont.truetype(str(DISKET_BOLD), 168)
    logo_text = "TYPE"
    bbox = draw.textbbox((0, 0), logo_text, font=f_logo)
    logo_w = bbox[2] - bbox[0]
    # вертикальный центр
    logo_x = 64
    logo_y = (H - (bbox[3] - bbox[1])) // 2 - 30
    draw.text((logo_x, logo_y), logo_text, font=f_logo, fill=PAPER)

    # === Маркер-ромб (бренд-элемент) рядом с TYPE ===
    diamond_size = 18
    diamond_x = logo_x + logo_w + 24
    diamond_y = logo_y + 70
    diamond = [
        (diamond_x, diamond_y - diamond_size),
        (diamond_x + diamond_size, diamond_y),
        (diamond_x, diamond_y + diamond_size),
        (diamond_x - diamond_size, diamond_y),
    ]
    draw.polygon(diamond, fill=FOREST)

    # === Тэглайн снизу под TYPE ===
    f_sub = ImageFont.truetype(str(DISKET_BOLD), 22)
    sub_text = "МУЖСКАЯ ПАРИКМАХЕРСКАЯ"
    sub_y = logo_y + 200
    draw.text((68, sub_y), sub_text, font=f_sub, fill=PAPER)

    # Адрес помельче
    f_addr = ImageFont.truetype(str(DISKET_REG), 16)
    addr_text = "ОСТОЖЕНКА 47  ·  МЕТРО ПАРК КУЛЬТУРЫ"
    draw.text((68, sub_y + 36), addr_text, font=f_addr, fill=(235, 234, 229, 180))

    # === В правом нижнем — телефон ===
    f_phone = ImageFont.truetype(str(DISKET_BOLD), 18)
    phone_text = "+7 965 31 31 31 5"
    phone_bbox = draw.textbbox((0, 0), phone_text, font=f_phone)
    phone_w = phone_bbox[2] - phone_bbox[0]
    draw.text((W - 68 - phone_w, H - 80), phone_text, font=f_phone, fill=PAPER)
    draw.text((W - 68 - phone_w, H - 56), "ЗАПИСЬ", font=f_addr, fill=(235, 234, 229, 160))

    # === Сохраняем ===
    bg.save(OUT, "JPEG", quality=92, optimize=True, progressive=True)
    print(f"Готово: {OUT}")
    print(f"Размер: {bg.size}, файл: {OUT.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    make()

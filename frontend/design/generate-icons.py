#!/usr/bin/env python3
"""Generuje ikony PWA do `public/icons/`.

Ikony trzymamy jako wygenerowane pliki, ale razem ze skryptem, który je
tworzy -- inaczej po pierwszej korekcie palety nikt nie wie, jak je odtworzyć,
i zostają binaria bez źródła.

Kolory pochodzą z `app/globals.css` (motyw ciemny): tło `--bg`, hantla `--accent`.
Ikona jest zawsze ciemna, niezależnie od motywu systemu -- launcher Androida
pokazuje ją na własnym tle i wersja jasna ginęłaby na jasnych tapetach.

    python3 design/generate-icons.py
"""

from pathlib import Path

from PIL import Image, ImageDraw

BG = "#0E0F11"
ACCENT = "#46D5E0"

OUT = Path(__file__).resolve().parent.parent / "public" / "icons"

# Rysujemy w dużej rozdzielczości i zmniejszamy -- PIL nie ma antyaliasingu
# dla figur, więc bez tego krawędzie hantli byłyby schodkowe.
SUPERSAMPLE = 4


def dumbbell(size: int, scale: float) -> Image.Image:
    """Kwadratowa ikona z hantlą. `scale` to udział hantli w szerokości."""
    canvas = size * SUPERSAMPLE
    image = Image.new("RGBA", (canvas, canvas), BG)
    draw = ImageDraw.Draw(image)

    center = canvas / 2
    bar_length = canvas * scale
    bar_height = canvas * scale * 0.13
    plate_width = canvas * scale * 0.17
    inner_plate_height = canvas * scale * 0.46
    outer_plate_height = canvas * scale * 0.30
    radius = bar_height * 0.5

    # Gryf.
    draw.rounded_rectangle(
        [center - bar_length / 2, center - bar_height / 2,
         center + bar_length / 2, center + bar_height / 2],
        radius=radius, fill=ACCENT,
    )

    for direction in (-1, 1):
        # Talerz wewnętrzny (wyższy) i zewnętrzny (niższy) -- sylwetka hantli
        # czyta się w 48 px lepiej niż pojedynczy prostokąt.
        inner_x = center + direction * (bar_length / 2 - plate_width * 0.15)
        draw.rounded_rectangle(
            [min(inner_x, inner_x - direction * plate_width), center - inner_plate_height / 2,
             max(inner_x, inner_x - direction * plate_width), center + inner_plate_height / 2],
            radius=plate_width * 0.35, fill=ACCENT,
        )
        outer_x = center + direction * (bar_length / 2 + plate_width * 0.75)
        draw.rounded_rectangle(
            [min(outer_x, outer_x - direction * plate_width * 0.8),
             center - outer_plate_height / 2,
             max(outer_x, outer_x - direction * plate_width * 0.8),
             center + outer_plate_height / 2],
            radius=plate_width * 0.3, fill=ACCENT,
        )

    return image.resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    # Zwykłe ikony: hantla zajmuje większość kadru.
    for size in (192, 512):
        dumbbell(size, 0.68).convert("RGB").save(OUT / f"icon-{size}.png")

    # Maskowalna: Android przycina ikonę do dowolnego kształtu i gwarantuje
    # tylko wewnętrzne 80% średnicy. Rysunek musi zmieścić się w tej strefie,
    # inaczej launcher obetnie talerze hantli.
    for size in (192, 512):
        dumbbell(size, 0.50).convert("RGB").save(OUT / f"icon-maskable-{size}.png")

    # iOS nie czyta manifestu PWA -- bierze apple-touch-icon 180x180.
    dumbbell(180, 0.68).convert("RGB").save(OUT / "apple-touch-icon.png")

    print(f"zapisano ikony w {OUT}")


if __name__ == "__main__":
    main()

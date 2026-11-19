#!/usr/bin/env python3
"""Import the generated art pack into web/assets (optimized for mobile).

Usage: python3 -I tools/import_art.py <folder-with-the-png-files> [more folders...]
Originals stay outside the repo; only resized WebP/PNG files are written.
"""
import os
import sys
from PIL import Image

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(REPO, 'web', 'assets')
ICONS_OUT = os.path.join(REPO, 'web', 'icons')

# name -> (subfolder, max size (w, h), format, quality)
RULES = {
    'splash_keyart': ('ui', (1600, 900), 'webp', 78),
    'loading_bg': ('ui', (1280, 720), 'webp', 75),
    'airline_logo': ('ui', (512, 512), 'webp', 85),
    'sky_sunset_pano': ('tex', (2048, 1024), 'webp', 80),
    'atlas_mountains_strip': ('tex', (2048, 512), 'webp', 82),
    'terminal_facade': ('tex', (2048, 512), 'webp', 80),
    'terminal_roof': ('tex', (1024, 512), 'webp', 78),
    'hangar_texture': ('tex', (1024, 512), 'webp', 78),
    'tower_texture': ('tex', (512, 512), 'webp', 78),
    # ground textures (docs/ASSET_REQUESTS.md section 2): kept at the requested size
    'tex_runway_asphalt': ('tex', (2048, 2048), 'webp', 85),
    'tex_taxiway_asphalt': ('tex', (2048, 2048), 'webp', 85),
    'tex_apron_concrete': ('tex', (2048, 2048), 'webp', 85),
    'tex_airfield_grass': ('tex', (2048, 2048), 'webp', 85),
}
PREFIX_RULES = [
    ('icon_', ('ui', (160, 160), 'webp', 88)),
    ('ac_', ('cards', (720, 480), 'webp', 82)),
    ('card_', ('cards', (720, 480), 'webp', 78)),
    ('tex_', ('tex', (1024, 1024), 'webp', 80)),
]


def rule_for(name):
    if name in RULES:
        return RULES[name]
    for prefix, rule in PREFIX_RULES:
        if name.startswith(prefix):
            return rule
    return None


def main(folders):
    done = []
    for folder in folders:
        for root, _dirs, files in os.walk(folder):
            for f in sorted(files):
                if not f.lower().endswith('.png'):
                    continue
                name = f[:-4]
                src = os.path.join(root, f)
                im = Image.open(src)
                if name == 'app_icon':
                    os.makedirs(ICONS_OUT, exist_ok=True)
                    base = im.convert('RGB')
                    for out_name, size in (('icon-192', 192), ('icon-512', 512), ('icon-maskable-512', 512), ('apple-touch-icon', 180)):
                        base.resize((size, size), Image.LANCZOS).save(os.path.join(ICONS_OUT, out_name + '.png'), optimize=True)
                    done.append('app_icon -> web/icons/*')
                    continue
                rule = rule_for(name)
                if not rule:
                    print('skip (no rule):', f)
                    continue
                sub, (mw, mh), fmt, q = rule
                keep_alpha = im.mode in ('RGBA', 'LA') or 'transparency' in im.info
                im = im.convert('RGBA' if keep_alpha else 'RGB')
                im.thumbnail((mw, mh), Image.LANCZOS)
                os.makedirs(os.path.join(OUT, sub), exist_ok=True)
                dst = os.path.join(OUT, sub, name + '.' + fmt)
                im.save(dst, fmt.upper(), quality=q, method=6)
                done.append(f'{name} -> assets/{sub}/{name}.{fmt} {im.size[0]}x{im.size[1]} {os.path.getsize(dst) // 1024}KB')
    print('\n'.join(done))
    print(len(done), 'files imported')


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1:])

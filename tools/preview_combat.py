"""Make review sheets from preview_combat.mts output. Requires Pillow.

Usage: python tools/preview_combat.py <frames directory> <output directory>
"""
import json
import re
import sys
from pathlib import Path
from PIL import Image, ImageDraw


def sprite(layer):
    rows = layer['frames'][0]
    im = Image.new('RGBA', (400, len(rows)))
    draw = ImageDraw.Draw(im)
    for y, row in enumerate(rows):
        x = 0
        for color, count in re.findall(r'([^0-9])([0-9]*)', row):
            count = int(count or 1)
            if color != '.':
                draw.rectangle((x, y, x + count - 1, y), fill=layer['palette'][color])
            x += count
    return im


def main():
    src, dest = map(Path, sys.argv[1:3])
    dest.mkdir(parents=True, exist_ok=True)
    samples = json.loads((src / 'layers.json').read_text())
    poses = Image.new('RGB', (1440, 6 * 190), '#141e32')
    draw = ImageDraw.Draw(poses)
    for i, sample in enumerate(samples[:24]):
        x, y = (i % 4) * 360, (i // 4) * 190
        draw.text((x + 8, y + 4), sample['name'], fill='white')
        for name in ['body', 'effect']:
            im = sprite(sample[name]).resize((800, len(sample[name]['frames'][0]) * 2), Image.Resampling.NEAREST)
            poses.paste(im, (x, y + 25), im)
    poses.save(dest / 'combat-poses.png')
    layers = Image.new('RGB', (1200, 3 * 160), '#141e32')
    draw = ImageDraw.Draw(layers)
    originals = json.loads((src / 'originals.json').read_text())
    for j, index in enumerate([24, 25, 26]):
        sample = samples[index]
        action = sample['actor']['action']
        original = dict(originals[action])
        original['frames'] = [original['frames'][sample['actor']['frame']]]
        for i, (label, layer) in enumerate([('Source', original), ('Body', sample['body']), ('Effect', sample['effect'])]):
            draw.text((i * 400 + 8, j * 160 + 4), f'{action}: {label}', fill='white')
            im = sprite(layer)
            layers.paste(im, (i * 400, j * 160 + 25), im)
    layers.save(dest / 'combat-effects.png')


if __name__ == '__main__':
    main()

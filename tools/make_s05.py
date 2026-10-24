"""Draw scene S05 (結晶廢墟, crystal ruins) and add it to hooks/gen/scenes.ts.

The reference packs have no S05 picture (spec 3.1 says it must be made), so
this draws one: 128x72 pixels, 16 colours, the same grid format as the
extracted scenes, ground line at y=56 (168 on the 384x216 screen). It is this
project's own pixel art, made from a fixed seed so every run is the same.

Usage: PYTHONUTF8=1 python -I tools/make_s05.py
(tools/extract_sprites.py runs it after rewriting scenes.ts.)
"""
import json
import os
import random

HERE = os.path.dirname(os.path.abspath(__file__))
SCENES = os.path.join(HERE, '..', 'hooks', 'gen', 'scenes.ts')
CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
W, H, GROUND = 128, 72, 56

PALETTE = [
    '#120e24',  # a sky top
    '#1e1838',  # b sky
    '#2c2350',  # c sky low
    '#3d2f66',  # d horizon haze
    '#251c3c',  # e far ruins
    '#3a3050',  # f near ruin stone dark
    '#54496a',  # g ruin stone
    '#776b8c',  # h ruin stone light
    '#1f6f86',  # i crystal deep
    '#38a8c4',  # j crystal
    '#7fe4f0',  # k crystal light
    '#e4fbff',  # l crystal glint
    '#2a2232',  # m ground dark
    '#3e3346',  # n ground
    '#57495c',  # o ground light
    '#0b0814',  # p outline
]


def rle(row):
    out, x = [], 0
    while x < len(row):
        e = x + 1
        while e < len(row) and row[e] == row[x]:
            e += 1
        out.append(row[x] + (str(e - x) if e - x > 1 else ''))
        x = e
    return ''.join(out)


def draw():
    rnd = random.Random(20261019)
    g = [['a'] * W for _ in range(H)]

    def put(x, y, c):
        if 0 <= x < W and 0 <= y < H:
            g[y][x] = c

    def rect(x0, y0, x1, y1, c):
        for y in range(y0, y1):
            for x in range(x0, x1):
                put(x, y, c)

    # sky bands with a dithered edge between them
    bands = [(0, 'a'), (12, 'b'), (26, 'c'), (38, 'd')]
    for i, (y0, c) in enumerate(bands):
        y1 = bands[i + 1][0] if i + 1 < len(bands) else GROUND
        rect(0, y0, W, y1, c)
        if i > 0:
            prev = bands[i - 1][1]
            for x in range(0, W, 2):
                put(x + (y0 % 2), y0, prev)
    # a few stars
    for _ in range(18):
        put(rnd.randrange(W), rnd.randrange(0, 22), 'h' if rnd.random() < 0.7 else 'l')
    # far ruined skyline
    x = 0
    while x < W:
        w = rnd.randint(5, 12)
        top = rnd.randint(30, 42)
        rect(x, top, x + w, GROUND, 'e')
        if rnd.random() < 0.5:  # a broken spire
            rect(x + w // 2 - 1, top - rnd.randint(3, 8), x + w // 2 + 1, top, 'e')
        x += w + rnd.randint(0, 3)
    # near pillars, broken arches
    for px, top, w in ((6, 18, 8), (30, 28, 6), (88, 22, 7), (112, 14, 9)):
        rect(px, top, px + w, GROUND, 'g')
        rect(px, top, px + 1, GROUND, 'h')
        rect(px + w - 1, top, px + w, GROUND, 'f')
        for y in range(top + 4, GROUND, 6):
            rect(px, y, px + w, y + 1, 'f')
        # jagged broken top
        for xx in range(px, px + w):
            for yy in range(top - rnd.randint(0, 3), top):
                put(xx, yy, 'g')
        rect(px - 1, top - 1, px + w + 1, top, 'p') if rnd.random() < 0.3 else None
    rect(30, 26, 48, 29, 'g')  # a lintel bridging to a stub
    rect(30, 28, 48, 29, 'f')
    rect(44, 29, 48, 40, 'g')

    def crystal(cx, base, h, w):
        for i in range(h):
            half = max(0, round(w * (h - i) / h / 2))
            y = base - i
            for x in range(cx - half, cx + half + 1):
                put(x, y, 'j')
            put(cx - half, y, 'i')
            put(cx + half, y, 'k')
        put(cx, base - h, 'l')
        put(cx, base - h + 1, 'k')

    # crystal clusters on the ruins and along the ground line
    for cx, base, h, w in ((22, GROUND - 1, 14, 6), (26, GROUND - 1, 9, 4), (18, GROUND - 1, 7, 3),
                           (70, GROUND - 1, 18, 7), (75, GROUND - 1, 11, 4), (65, GROUND - 1, 8, 3),
                           (103, GROUND - 1, 12, 5), (99, GROUND - 1, 7, 3), (10, 18, 6, 3), (116, 14, 7, 3),
                           (55, GROUND - 1, 6, 3), (124, GROUND - 1, 9, 4)):
        crystal(cx, base, h, w)
    # ground: stone floor with cracks and rubble
    rect(0, GROUND, W, H, 'n')
    rect(0, GROUND, W, GROUND + 1, 'o')
    for y in range(GROUND + 2, H):
        for x in range(W):
            r = rnd.random()
            if r < 0.10:
                put(x, y, 'm')
            elif r < 0.14:
                put(x, y, 'o')
    for _ in range(10):  # cracks
        x, y = rnd.randrange(W), rnd.randrange(GROUND + 3, H)
        for _ in range(rnd.randint(4, 9)):
            put(x, y, 'm')
            x += rnd.choice((-1, 1))
            y += rnd.choice((0, 0, 1))
    for _ in range(14):  # small crystal shards in the floor
        put(rnd.randrange(W), rnd.randrange(GROUND + 2, H), 'j')
    return g


def main():
    grid = draw()
    scene = {
        'palette': {CHARS[i]: c for i, c in enumerate(PALETTE)},
        'ground': GROUND,
        'grid': [rle(''.join(row)) for row in grid],
    }
    text = open(SCENES, encoding='utf-8').read()
    head, body = text.split('= ', 1)
    data = json.loads(body[: body.rindex(' as const')])
    data['S05'] = scene
    with open(SCENES, 'w', encoding='utf-8', newline='\n') as f:
        f.write('// Generated by tools/extract_sprites.py from the reference pack (S05 by tools/make_s05.py). Do not edit by hand.\n')
        f.write('export const SCENES = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ' as const\n')
    print('S05 written to', SCENES)


if __name__ == '__main__':
    main()

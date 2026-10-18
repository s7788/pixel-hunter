"""Extract hunt-8bit sprites and scenes from the reference pack into hooks/sprites.gen.ts.

The action boards are AI-generated key-pose images with no fixed pixel pitch,
so frames are taken at the board's own resolution: background flood-filled
away from the crop edge, the ground line cut, frames of one action translated
onto F1 (pixels untouched), colors quantized to one palette per group. A group
may be scaled (nearest neighbour) so boards drawn at different sizes match.

Usage: PYTHONUTF8=1 python -I tools/extract_sprites.py <reference-pack-dir> [--measure | --sheet <png>]
Spec:  tools/extract_spec.json
Out:   hooks/gen/<group>.ts and hooks/gen/scenes.ts, each row run-length encoded
       as <palette letter or '.'><count, omitted when 1> (each file stays far
       under the engine's 1 MB per-file read limit).
"""
import json
import os
import sys
from collections import deque

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, '..', 'hooks', 'gen')
CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
BG_TOL = 34
MIN_ISLAND = 3
INSET = 3            # keep clear of the board's cell borders
POCKET_TOL = 22      # enclosed background pockets (behind beams, slashes)
POCKET_MIN = 40


def dist(a, b):
    return sum((x - y) ** 2 for x, y in zip(a, b)) ** 0.5


def background(crop):
    w, h = crop.size
    px = crop.load()
    edge = [px[x, 0] for x in range(w)] + [px[x, h - 1] for x in range(w)]
    edge += [px[0, y] for y in range(h)] + [px[w - 1, y] for y in range(h)]
    counts = {}
    for c in edge:
        key = tuple(v // 8 for v in c)
        counts[key] = counts.get(key, 0) + 1
    mode = max(counts, key=counts.get)
    return tuple(v * 8 + 4 for v in mode)


def mask_of(crop):
    w, h = crop.size
    px = crop.load()
    bg = background(crop)
    is_bg = [[False] * w for _ in range(h)]
    q = deque((x, y) for x in range(w) for y in (0, h - 1))
    q.extend((x, y) for y in range(h) for x in (0, w - 1))
    while q:
        x, y = q.popleft()
        if not (0 <= x < w and 0 <= y < h) or is_bg[y][x] or dist(px[x, y], bg) > BG_TOL:
            continue
        is_bg[y][x] = True
        q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    # pockets the flood could not reach: large connected areas of background colour
    seen = [[False] * w for _ in range(h)]
    for y0 in range(h):
        for x0 in range(w):
            if is_bg[y0][x0] or seen[y0][x0] or dist(px[x0, y0], bg) > POCKET_TOL:
                continue
            comp, q = [], deque([(x0, y0)])
            seen[y0][x0] = True
            while q:
                x, y = q.popleft()
                comp.append((x, y))
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and not is_bg[ny][nx]                             and dist(px[nx, ny], bg) <= POCKET_TOL:
                        seen[ny][nx] = True
                        q.append((nx, ny))
            if len(comp) >= POCKET_MIN:
                for x, y in comp:
                    is_bg[y][x] = True
    return [[not is_bg[y][x] for x in range(w)] for y in range(h)]


def cut_ground(mask):
    """Clear the board's ground line: the lowest thin row covering a third of the crop."""
    h, w = len(mask), len(mask[0])
    for _ in range(3):  # a line may be two tones, or two rows thick
        for y in range(h - 1, max(h - 18, 2), -1):
            covered = sum(mask[y])
            above = sum(1 for x in range(w) if mask[y][x] and mask[y - 2][x])
            if covered >= 0.3 * w and above < 0.5 * covered:
                for yy in range(y, h):
                    mask[yy] = [False] * w
                break
        else:
            return


def drop_hairlines(mask, rows=12, min_run=8):
    """Remove 1-2px-tall horizontal runs near the bottom: leftovers of a faint ground line."""
    h, w = len(mask), len(mask[0])

    def thin(x, y):
        if not mask[y][x] or (y > 0 and mask[y - 1][x]):
            return False
        below = y + 1 < h and mask[y + 1][x]
        return not (below and y + 2 < h and mask[y + 2][x])

    for y in range(max(1, h - rows), h):
        x = 0
        while x < w:
            end = x
            while end < w and thin(end, y):
                end += 1
            if end - x >= min_run:
                for xx in range(x, end):
                    mask[y][xx] = False
                    if y + 1 < h:
                        mask[y + 1][xx] = False
            x = max(end, x + 1)


def drop_islands(mask, keep_left_of=None):
    h, w = len(mask), len(mask[0])
    seen = [[False] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            if not mask[y][x] or seen[y][x]:
                continue
            comp, q = [], deque([(x, y)])
            seen[y][x] = True
            while q:
                cx, cy = q.popleft()
                comp.append((cx, cy))
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < w and 0 <= ny < h and mask[ny][nx] and not seen[ny][nx]:
                        seen[ny][nx] = True
                        q.append((nx, ny))
            far = keep_left_of is not None and min(c[0] for c in comp) > keep_left_of
            if len(comp) < MIN_ISLAND or far:
                for cx, cy in comp:
                    mask[cy][cx] = False


def frame_rgba(board, box, blanks, action):
    box = (box[0] + INSET, box[1] + INSET, box[2] - INSET, box[3] - INSET)
    crop = board.crop(box)
    for bx in blanks:
        x0, y0 = max(0, bx[0] - box[0]), max(0, bx[1] - box[1])
        x1, y1 = min(crop.width, bx[2] - box[0]), min(crop.height, bx[3] - box[1])
        if x0 < x1 and y0 < y1:
            crop.paste(background(crop), (x0, y0, x1, y1))
    mask = mask_of(crop)
    cut_ground(mask)
    drop_hairlines(mask)
    drop_islands(mask, action.get('keepLeftOf'))
    rgba = crop.convert('RGBA')
    px = rgba.load()
    for y in range(crop.height):
        for x in range(crop.width):
            if not mask[y][x]:
                px[x, y] = (0, 0, 0, 0)
    return rgba


def bbox_height(img):
    box = img.getbbox()
    return 0 if box is None else box[3] - box[1]


def align(frames, reach=40):
    """Translate frames 1..n onto frame 0 by best mask overlap; pixels untouched."""
    def cells(f):
        a = f.getchannel('A').load()
        return {(x, y) for y in range(f.height) for x in range(f.width) if a[x, y]}
    w = max(f.width for f in frames) + 2 * reach
    h = max(f.height for f in frames) + 8
    ref = cells(frames[0])
    placed = []
    for i, f in enumerate(frames):
        dx = dy = 0
        if i > 0:
            own = cells(f)
            _, dx, dy = max(((len(ref & {(x + ax, y + ay) for x, y in own}), ax, ay)
                             for ax in range(-reach, reach + 1) for ay in range(-4, 5)), key=lambda t: t[0])
        canvas = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        canvas.paste(f, (reach + dx, 4 + dy), f)
        placed.append(canvas)
    return placed


def trim(frames):
    boxes = [f.getbbox() for f in frames if f.getbbox()]
    l, t = min(b[0] for b in boxes), min(b[1] for b in boxes)
    r, b = max(b[2] for b in boxes), max(b[3] for b in boxes)
    return [f.crop((l, t, r, b)) for f in frames]


def anchor_x(frame, mode):
    """Where the figure stands: brown boots for the hunter, the lowest third otherwise."""
    px = frame.load()
    lo = frame.height * 3 // 4 if mode == 'boots' else frame.height * 2 // 3
    xs = []
    for y in range(lo, frame.height):
        for x in range(frame.width):
            r, g, b, a = px[x, y]
            if a and (mode != 'boots' or (r > g + 25 and g > b and 70 < r < 220)):
                xs.append(x)
    return round(sum(xs) / len(xs)) if xs else frame.width // 2


def rle(row):
    out, x = [], 0
    while x < len(row):
        e = x + 1
        while e < len(row) and row[e] == row[x]:
            e += 1
        out.append(row[x] + (str(e - x) if e - x > 1 else ''))
        x = e
    return ''.join(out)


def to_grid(frame, palette_img, chars):
    rgb = frame.convert('RGB').quantize(palette=palette_img, dither=Image.Dither.NONE).load()
    a = frame.getchannel('A').load()
    return [rle(''.join(chars[rgb[x, y]] if a[x, y] else '.' for x in range(frame.width))) for y in range(frame.height)]


def write_ts(name, const, value):
    os.makedirs(OUT_DIR, exist_ok=True)
    body = json.dumps(value, ensure_ascii=False, separators=(',', ':'))
    path = os.path.join(OUT_DIR, name + '.ts')
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write('// Generated by tools/extract_sprites.py from the reference pack. Do not edit by hand.\n')
        f.write('export const ' + const + ' = ' + body + ' as const\n')
    print('wrote', path, len(body), 'chars')


def shared_palette(images, colors):
    pixels = [img.getpixel((x, y))[:3] for img in images
              for y in range(img.height) for x in range(img.width) if img.getpixel((x, y))[3]]
    strip = Image.new('RGB', (len(pixels), 1))
    strip.putdata(pixels)
    pal_img = strip.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    flat = pal_img.getpalette()[: colors * 3]
    return pal_img, {CHARS[i]: '#%02x%02x%02x' % tuple(flat[i * 3: i * 3 + 3]) for i in range(colors)}


def main():
    pack = sys.argv[1]
    measure = '--measure' in sys.argv
    spec = json.load(open(os.path.join(HERE, 'extract_spec.json'), encoding='utf-8'))
    boards = {}
    raw = {}
    for action in spec['actions']:
        path = os.path.join(pack, action['board'])
        board = boards.setdefault(path, Image.open(path).convert('RGB'))
        blanks = [tuple(b) for b in action.get('blank', [])]
        raw[action['id']] = [frame_rgba(board, tuple(b), blanks, action) for b in action['boxes']]
    if '--sheet' in sys.argv:
        dest = sys.argv[sys.argv.index('--sheet') + 1]
        cw, ch = 270, 125
        sheet = Image.new('RGB', (cw * 4, ch * len(raw)), (255, 0, 255))
        for r, frames in enumerate(raw.values()):
            for c, f in enumerate(frames):
                sheet.paste(f, (c * cw, r * ch), f)
        sheet.save(dest)
        print('sheet', dest)
        return
    if measure:
        for aid, frames in raw.items():
            print(aid, 'F1 height', bbox_height(frames[0]), 'widths', [f.getbbox() and f.getbbox()[2] - f.getbbox()[0] for f in frames])
        return
    scenes = {}
    for gid, group in spec['groups'].items():
        out = {'palette': None, 'actions': {}}
        members = [a for a in spec['actions'] if a['group'] == gid]
        scaled = {}
        for a in members:
            s = group.get('scale', {}).get(a['board'], 1.0)
            scaled[a['id']] = [f.resize((max(1, round(f.width * s)), max(1, round(f.height * s))), Image.NEAREST) for f in raw[a['id']]]
        pal_img, palette = shared_palette([f for fs in scaled.values() for f in fs], group['colors'])
        out['palette'] = palette
        for a in members:
            frames = scaled[a['id']]
            frames = trim(align(frames) if a.get('align', True) else frames)
            out['actions'][a['id']] = {
                'width': frames[0].width,
                'anchorX': anchor_x(frames[a.get('anchorFrame', 0)], group.get('anchor', 'feet')),
                'frames': [to_grid(f, pal_img, CHARS) for f in frames],
            }
            print(a['id'], gid, frames[0].width, 'x', frames[0].height)
        write_ts(gid, gid.upper(), out)
    for sc in spec['scenes']:
        img = Image.open(os.path.join(pack, sc['file'])).convert('RGB').resize(tuple(sc['size']), Image.BOX)
        q = img.quantize(colors=sc['colors'], method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
        flat = q.getpalette()[: sc['colors'] * 3]
        qp = q.load()
        scenes[sc['id']] = {
            'palette': {CHARS[i]: '#%02x%02x%02x' % tuple(flat[i * 3: i * 3 + 3]) for i in range(sc['colors'])},
            'ground': sc['ground'],
            'grid': [rle(''.join(CHARS[qp[x, y]] for x in range(img.width))) for y in range(img.height)],
        }
        print(sc['id'], img.size)
    write_ts('scenes', 'SCENES', scenes)


if __name__ == '__main__':
    main()

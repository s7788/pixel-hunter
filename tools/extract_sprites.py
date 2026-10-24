"""Extract hunt-8bit sprites and scenes from the reference pack into hooks/sprites.gen.ts.

The action boards are AI-generated key-pose images with no fixed pixel pitch,
so frames are taken at the board's own resolution: background flood-filled
away from the crop edge, the ground line cut, frames of one action translated
onto F1 (pixels untouched), colors quantized to one palette per group. A group
may be scaled (nearest neighbour) so boards drawn at different sizes match.

Usage: PYTHONUTF8=1 python -I tools/extract_sprites.py <reference-pack-dir> [--only <group>] [--measure | --sheet <png>]

--only <group> extracts that one group (its boards relative to the pack given)
and leaves the other groups and the scenes as they are: the monster packs are
separate downloads from the first reference pack. A group with
"resample": "box" is scaled by area averaging with the alpha cut at half, and
"keepMain": f drops pieces under f of the largest one (effects such as spit,
dust and motion lines are drawn by the mod on their own layer). An action's
"ground": [poses] drops those poses onto the other poses' baseline (a leap drawn
mid-air: the engine lifts the root instead, so the boxes follow it).
"groundDepth": n looks for the ground line n rows up from the cell's bottom (default 18);
"boxBoards": [board or null per box] takes a frame from another board (a combo
finished with a pose from the action's own board). "shadow": true also clears a
drop shadow drawn under the feet; "pockets": false keeps
enclosed background-coloured areas, "pocketTol": n narrows what counts as one (white fur
close to the board colour); with "shadow", "reflood": true floods the background
again once the shadow is gone (gaps between the legs).
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


def mask_of(crop, pockets=True, pocket_tol=POCKET_TOL):
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
    if not pockets:
        return [[not is_bg[y][x] for x in range(w)] for y in range(h)]
    seen = [[False] * w for _ in range(h)]
    for y0 in range(h):
        for x0 in range(w):
            if is_bg[y0][x0] or seen[y0][x0] or dist(px[x0, y0], bg) > pocket_tol:
                continue
            comp, q = [], deque([(x0, y0)])
            seen[y0][x0] = True
            while q:
                x, y = q.popleft()
                comp.append((x, y))
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and not is_bg[ny][nx]                             and dist(px[nx, ny], bg) <= pocket_tol:
                        seen[ny][nx] = True
                        q.append((nx, ny))
            if len(comp) >= POCKET_MIN:
                for x, y in comp:
                    is_bg[y][x] = True
    return [[not is_bg[y][x] for x in range(w)] for y in range(h)]


def cut_ground(mask, depth=18):
    """Clear the board's ground line: the lowest thin row covering a third of the crop, within `depth` rows of the bottom."""
    h, w = len(mask), len(mask[0])
    for _ in range(3):  # a line may be two tones, or two rows thick
        for y in range(h - 1, max(h - depth, 2), -1):
            covered = sum(mask[y])
            above = sum(1 for x in range(w) if mask[y][x] and mask[y - 2][x])
            if covered >= 0.3 * w and above < 0.5 * covered:
                for yy in range(y, h):
                    mask[yy] = [False] * w
                break
        else:
            return


def cut_shadow(mask, rows=8, band=8):
    """Clear a drop shadow the figure stands on: the widest plateau among its lowest rows (the feet merge into it)."""
    h, w = len(mask), len(mask[0])
    cov = [sum(r) for r in mask]
    filled = [y for y in range(h) if cov[y]]
    if not filled:
        return
    low = list(range(max(filled[-1] - rows + 1, 0), filled[-1] + 1))
    peak = max(low, key=lambda y: (cov[y], y))
    if cov[peak] < 0.3 * w:
        return
    top = peak
    while top - 1 >= 0 and peak - top < band and cov[top - 1] >= 0.94 * cov[peak]:
        top -= 1
    for y in range(top, h):
        mask[y] = [False] * w


def reflood(mask, crop, bg):
    """Flood the background again from the edges once the shadow is cut: gaps between the legs open up."""
    h, w = len(mask), len(mask[0])
    px = crop.load()
    seen = [[False] * w for _ in range(h)]
    q = deque((x, y) for x in range(w) for y in (0, h - 1))
    q.extend((x, y) for y in range(h) for x in (0, w - 1))
    while q:
        x, y = q.popleft()
        if not (0 <= x < w and 0 <= y < h) or seen[y][x]:
            continue
        if mask[y][x] and dist(px[x, y], bg) > BG_TOL:
            continue
        seen[y][x] = True
        mask[y][x] = False
        q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))


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


def drop_islands(mask, keep_left_of=None, min_island=MIN_ISLAND):
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
            if len(comp) < min_island or far:
                for cx, cy in comp:
                    mask[cy][cx] = False


def keep_main(rgba, share):
    """Clear connected pieces smaller than `share` of the largest (8-connected)."""
    w, h = rgba.size
    a = rgba.getchannel('A').load()
    px = rgba.load()
    seen = [[False] * w for _ in range(h)]
    comps = []
    for y0 in range(h):
        for x0 in range(w):
            if not a[x0, y0] or seen[y0][x0]:
                continue
            comp, q = [], deque([(x0, y0)])
            seen[y0][x0] = True
            while q:
                x, y = q.popleft()
                comp.append((x, y))
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < w and 0 <= ny < h and a[nx, ny] and not seen[ny][nx]:
                            seen[ny][nx] = True
                            q.append((nx, ny))
            comps.append(comp)
    if not comps:
        return rgba
    biggest = max(len(c) for c in comps)
    for c in comps:
        if len(c) < share * biggest:
            for x, y in c:
                px[x, y] = (0, 0, 0, 0)
    return rgba


def box_scale(img, s):
    """Area-average scale; a pixel stays only where at least half its area was covered."""
    out = img.resize((max(1, round(img.width * s)), max(1, round(img.height * s))), Image.BOX)
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, al = px[x, y]
            px[x, y] = (r, g, b, 255) if al >= 128 else (0, 0, 0, 0)
    return out


def dehalo(mask, crop, bg, passes, tol=60):
    """Peel outline pixels that are mostly board background (its anti-aliasing), `passes` times."""
    h, w = len(mask), len(mask[0])
    px = crop.load()
    for _ in range(passes):
        edge = [(x, y) for y in range(h) for x in range(w) if mask[y][x] and dist(px[x, y], bg) < tol and any(
            not (0 <= nx < w and 0 <= ny < h) or not mask[ny][nx]
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))]
        for x, y in edge:
            mask[y][x] = False


def frame_rgba(board, box, blanks, action):
    box = (box[0] + INSET, box[1] + INSET, box[2] - INSET, box[3] - INSET)
    crop = board.crop(box)
    for bx in blanks:
        x0, y0 = max(0, bx[0] - box[0]), max(0, bx[1] - box[1])
        x1, y1 = min(crop.width, bx[2] - box[0]), min(crop.height, bx[3] - box[1])
        if x0 < x1 and y0 < y1:
            crop.paste(background(crop), (x0, y0, x1, y1))
    mask = mask_of(crop, action.get('pockets', True), action.get('pocketTol', POCKET_TOL))
    cut_ground(mask, action.get('groundDepth', 18))
    if 'groundY' in action:  # a dashed ground line cut_ground cannot see: clear from that board row down
        for y in range(max(0, action['groundY'] - box[1]), crop.height):
            mask[y] = [False] * crop.width
    if action.get('shadow'):
        cut_shadow(mask)
        if action.get('reflood'):
            reflood(mask, crop, background(crop))
    drop_hairlines(mask)
    drop_islands(mask, action.get('keepLeftOf'), action.get('minIsland', MIN_ISLAND))
    if action.get('dehalo'):
        dehalo(mask, crop, background(crop), action['dehalo'])
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


def to_ground(frames, poses):
    """Move the given poses straight down (or up) so their lowest pixel sits on the other poses' ground line."""
    base = max(f.getbbox()[3] for i, f in enumerate(frames) if i not in poses)
    out = []
    for i, f in enumerate(frames):
        if i in poses:
            moved = Image.new('RGBA', f.size, (0, 0, 0, 0))
            moved.paste(f, (0, base - f.getbbox()[3]), f)
            f = moved
        out.append(f)
    return out


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


def board_of(action, i):
    """The board frame i is cut from: the action's own, unless "boxBoards" names another for it."""
    other = action.get('boxBoards', [])
    return (other[i] if i < len(other) else None) or action['board']


def main():
    pack = sys.argv[1]
    measure = '--measure' in sys.argv
    only = sys.argv[sys.argv.index('--only') + 1] if '--only' in sys.argv else None
    spec = json.load(open(os.path.join(HERE, 'extract_spec.json'), encoding='utf-8'))
    if only is not None:
        spec['groups'] = {only: spec['groups'][only]}
        spec['actions'] = [a for a in spec['actions'] if a['group'] == only]
        spec['scenes'] = []
    boards = {}
    raw = {}
    for action in spec['actions']:
        blanks = [tuple(b) for b in action.get('blank', [])]
        opts = {**spec['groups'].get(action['group'], {}), **action}
        frames = []
        for i, b in enumerate(action['boxes']):
            path = os.path.join(pack, board_of(action, i))
            board = boards.setdefault(path, Image.open(path).convert('RGB'))
            frames.append(frame_rgba(board, tuple(b), blanks, opts))
        raw[action['id']] = frames
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
            scales = [group.get('scale', {}).get(board_of(a, i), 1.0) for i in range(len(raw[a['id']]))]
            if group.get('resample') == 'box':
                frames = [box_scale(f, s) for f, s in zip(raw[a['id']], scales)]
            else:
                frames = [f.resize((max(1, round(f.width * s)), max(1, round(f.height * s))), Image.NEAREST)
                          for f, s in zip(raw[a['id']], scales)]
            if 'keepMain' in group:
                frames = [keep_main(f, group['keepMain']) for f in frames]
            scaled[a['id']] = frames
        pal_img, palette = shared_palette([f for fs in scaled.values() for f in fs], group['colors'])
        out['palette'] = palette
        for a in members:
            frames = scaled[a['id']]
            frames = align(frames) if a.get('align', True) else frames
            if 'ground' in a:
                frames = to_ground(frames, a['ground'])
            frames = trim(frames)
            out['actions'][a['id']] = {
                'width': frames[0].width,
                'anchorX': anchor_x(frames[a.get('anchorFrame', 0)], group.get('anchor', 'feet')),
                'frames': [to_grid(f, pal_img, CHARS) for f in frames],
            }
            print(a['id'], gid, frames[0].width, 'x', frames[0].height)
        write_ts(gid, gid.upper(), out)
    if only is not None:
        return
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
    # S05 has no reference picture: it is drawn by tools/make_s05.py and added back
    import make_s05
    make_s05.main()


if __name__ == '__main__':
    main()

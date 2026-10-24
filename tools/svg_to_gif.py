"""Rasterize the pane's SVG frames (tools/demo_frames.mts) into an animated GIF.

The game's SVG is a small, fixed subset: one-pixel-tall stroked runs
(`M x y.5 h n m dx 0 h n`), rects and text, inside groups that translate,
scale or mirror (`scale(-1 1)`). This draws exactly that subset with Pillow,
so no SVG library is needed. Debug overlays (boxes) are not drawn.

Usage: PYTHONUTF8=1 python -I tools/svg_to_gif.py <frames dir> <out.gif> [--scale 2] [--png first.png]
"""
import glob
import os
import re
import sys

from PIL import Image, ImageDraw, ImageFont

FONTS = os.environ.get('WINDIR', 'C:/Windows') + '/Fonts/'
TAG = re.compile(r'<(/?)([a-zA-Z]+)([^>]*?)(/?)>|([^<]+)')
ATTR = re.compile(r'([\w:-]+)="([^"]*)"')


def css_classes(svg):
    style = re.search(r'<style>(.*?)</style>', svg, re.S)
    out = {}
    for name, body in re.findall(r'\.([\w-]+)\{([^}]*)\}', style.group(1) if style else ''):
        props = dict(p.split(':', 1) for p in body.split(';') if ':' in p)
        out[name] = props
    return out


def parse_transform(text):
    """(sx, sy, tx, ty) for 'translate(x y) scale(a b)' in that order, applied right to left."""
    sx, sy, tx, ty = 1.0, 1.0, 0.0, 0.0
    for kind, args in re.findall(r'(translate|scale)\(([^)]*)\)', text or ''):
        v = [float(a) for a in re.split(r'[ ,]+', args.strip())]
        if kind == 'translate':
            tx += sx * v[0]
            ty += sy * (v[1] if len(v) > 1 else 0)
        else:
            sx *= v[0]
            sy *= v[1] if len(v) > 1 else v[0]
    return sx, sy, tx, ty


def compose(outer, inner):
    a, b, c, d = outer
    e, f, g, h = inner
    return a * e, b * f, a * g + c, b * h + d


_font_cache = {}


def font(props, text):
    size = 13
    bold = False
    m = re.search(r'(bold\s+)?(\d+)px\s+(\S+)', props.get('font', ''))
    if m:
        bold = bool(m.group(1))
        size = int(m.group(2))
        family = m.group(3)
    else:
        family = 'sans-serif'
    ascii_only = all(ord(ch) < 128 for ch in text)
    if family == 'monospace' and ascii_only:
        name = 'consolab.ttf' if bold else 'consola.ttf'
    else:
        name = 'msjhbd.ttc' if bold else 'msjh.ttc'
    key = (name, size)
    if key not in _font_cache:
        _font_cache[key] = ImageFont.truetype(FONTS + name, size)
    return _font_cache[key]


def render(svg, scale):
    vb = [float(v) for v in re.search(r'viewBox="([^"]*)"', svg).group(1).split()]
    w, h = int(vb[2]), int(vb[3])
    img = Image.new('RGB', (w * scale, h * scale), (0, 0, 0))
    draw = ImageDraw.Draw(img)
    classes = css_classes(svg)
    stack = [(float(scale), float(scale), 0.0, 0.0)]
    text_el = None
    skip = 0
    for close, tag, attrs, selfclose, chars in TAG.findall(svg):
        if chars:
            if text_el is not None:
                text_el['text'] += chars
            continue
        a = dict(ATTR.findall(attrs))
        if tag == 'style':
            skip += -1 if close else 1
            continue
        if skip:
            continue
        if tag == 'g':
            if close:
                stack.pop()
            else:
                stack.append(compose(stack[-1], parse_transform(a.get('transform'))))
                if selfclose:
                    stack.pop()
            continue
        sx, sy, tx, ty = stack[-1]
        if tag == 'path' and not close and 'class' not in a:
            color = a.get('stroke')
            if not color:
                continue
            x = y = 0.0
            for op, nums in re.findall(r'([MmHh])([-\d.\s]+)', a.get('d', '')):
                v = [float(t) for t in nums.split()]
                if op == 'M':
                    x, y = v[0], v[1]
                elif op == 'm':
                    x, y = x + v[0], y + v[1]
                else:
                    x0, x1 = sx * x + tx, sx * (x + v[0]) + tx
                    y0, y1 = sy * (y - 0.5) + ty, sy * (y + 0.5) + ty
                    draw.rectangle([round(min(x0, x1)), round(min(y0, y1)), round(max(x0, x1)) - 1, round(max(y0, y1)) - 1], fill=color)
                    x += v[0]
        elif tag == 'rect' and not close and 'class' not in a:
            fill = a.get('fill')
            rw, rh = float(a.get('width', w)), float(a.get('height', h))
            x0, y0 = sx * float(a.get('x', 0)) + tx, sy * float(a.get('y', 0)) + ty
            x1, y1 = x0 + sx * rw, y0 + sy * rh
            box = [round(min(x0, x1)), round(min(y0, y1)), round(max(x0, x1)) - 1, round(max(y0, y1)) - 1]
            if fill and fill != 'none' and a.get('fill-opacity') is None:
                draw.rectangle(box, fill=fill)
            if a.get('stroke'):
                draw.rectangle(box, outline=a['stroke'], width=max(1, round(float(a.get('stroke-width', 1)) * sx / 2)))
        elif tag == 'text':
            if not close:
                text_el = {'a': a, 'text': ''}
            elif text_el is not None:
                props = dict(classes.get(text_el['a'].get('class', ''), {}))
                fill = text_el['a'].get('fill') or props.get('fill', '#ffffff')
                txt = text_el['text']
                f = font({k: v for k, v in props.items()}, txt)
                fs = ImageFont.truetype(f.path, round(f.size * sx))
                px, py = sx * float(text_el['a']['x']) + tx, sy * float(text_el['a']['y']) + ty
                anchor = 'ms' if props.get('text-anchor') == 'middle' else 'ls'
                stroke = props.get('stroke')
                sw = round(float(props.get('stroke-width', '0').replace('px', '')) * sx / 2) if stroke else 0
                draw.text((px, py), txt, font=fs, fill=fill, anchor=anchor, stroke_width=sw, stroke_fill=stroke)
                text_el = None
    return img


def main():
    src, dest = sys.argv[1], sys.argv[2]
    scale = int(sys.argv[sys.argv.index('--scale') + 1]) if '--scale' in sys.argv else 2
    files = sorted(glob.glob(os.path.join(src, '*.svg')))
    frames = [render(open(p, encoding='utf-8').read(), scale) for p in files]
    if '--png' in sys.argv:
        frames[0].save(sys.argv[sys.argv.index('--png') + 1])
    pal = [f.quantize(colors=255, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE) for f in frames]
    pal[0].save(dest, save_all=True, append_images=pal[1:], duration=125, loop=0, optimize=True, disposal=1)
    print(len(frames), 'frames ->', dest, os.path.getsize(dest), 'bytes')


if __name__ == '__main__':
    main()

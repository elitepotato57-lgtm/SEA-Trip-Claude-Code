"""Makes img/ben-wave.png: Ben waving, cut out of media/ben-wave.mp4, as one strip of frames for funny mode
(js/funny.js animates it with CSS steps()).

The video has a black background, but Ben's jumper is a very dark navy (about 30,28,35), so keying out every dark
pixel would eat the jumper. Instead the black is flood-filled in from the edges of each frame: only black that
touches the outside becomes see-through.

Needs ffmpeg (or `pip install imageio-ffmpeg`) and Pillow (`pip install pillow`).
Run from the repo root:  python3 tools/ben-sprite.py
"""
import os, shutil, subprocess, sys, tempfile
from collections import deque
from PIL import Image, ImageFilter

SRC = "media/ben-wave.mp4"
OUT = "img/ben-wave.png"
FRAME_H = 200          # pixels high per frame (shown at about 100 px, so sharp on a retina screen)
EVERY = 2              # keep every 2nd frame: 16 frames, about 15 a second
BLACK = 14             # a pixel counts as background when its brightest channel is at most this


def ffmpeg_exe():
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        sys.exit("Needs ffmpeg: install it, or run  pip install imageio-ffmpeg")


def cut_out(im):
    """Flood-fill the black background in from the edges; returns an RGBA image."""
    im = im.convert("RGB")
    w, h = im.size
    px = im.load()
    bg = bytearray(w * h)
    q = deque()

    def seed(x, y):
        i = y * w + x
        if not bg[i] and max(px[x, y]) <= BLACK:
            bg[i] = 1
            q.append((x, y))

    for x in range(w):
        seed(x, 0)
        seed(x, h - 1)
    for y in range(h):
        seed(0, y)
        seed(w - 1, y)
    while q:
        x, y = q.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h:
                seed(nx, ny)
    alpha = Image.new("L", (w, h))
    alpha.putdata([0 if b else 255 for b in bg])
    # soften the edge by a pixel so it doesn't look jagged
    alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1))
    out = im.convert("RGBA")
    out.putalpha(alpha)
    return out


def main():
    tmp = tempfile.mkdtemp()
    try:
        subprocess.run([ffmpeg_exe(), "-v", "error", "-y", "-i", SRC, os.path.join(tmp, "f%03d.png")], check=True)
        names = sorted(n for n in os.listdir(tmp) if n.endswith(".png"))[::EVERY]
        frames = [cut_out(Image.open(os.path.join(tmp, n))) for n in names]
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    # one crop box for every frame (the union of what's left), so Ben doesn't jump about
    boxes = [f.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox() for f in frames]
    boxes = [b for b in boxes if b]
    box = (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))
    frames = [f.crop(box) for f in frames]
    fw = round(frames[0].width * FRAME_H / frames[0].height)
    frames = [f.resize((fw, FRAME_H), Image.LANCZOS) for f in frames]
    sheet = Image.new("RGBA", (fw * len(frames), FRAME_H), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        sheet.paste(f, (i * fw, 0))
    sheet = sheet.quantize(colors=256, method=Image.FASTOCTREE, dither=Image.NONE)
    sheet.save(OUT, optimize=True)
    print(f"{OUT}: {len(frames)} frames of {fw}x{FRAME_H}, {os.path.getsize(OUT) // 1024} KB")


if __name__ == "__main__":
    main()

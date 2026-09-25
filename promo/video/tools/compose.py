# Монтаж: кадры сегментов → единый ролик 1920×1080@30 + звук → MP4 (H.264 + AAC).
import json
import subprocess
import sys
import numpy as np
from PIL import Image
from timeline import SEGMENTS, FPS, W, H, N_FRAMES, FRAMES, WORK, FFMPEG

OUT = sys.argv[1] if len(sys.argv) > 1 else f"{WORK}/promo.mp4"
AUDIO = f"{WORK}/audio.wav"
FADE_N = 4  # кадров кроссфейда
FLASH = [0.34, 0.18, 0.08, 0.03]  # белая вспышка на склейке нарезки

meta = {name: json.load(open(f"{FRAMES}/{name}/meta.json")) for name, *_ in SEGMENTS}
cache = {}


def load(name, i):
    n = meta[name]["frames"]
    i = max(0, min(n - 1, i))
    key = (name, i)
    if key in cache:
        return cache[key]
    im = Image.open(f"{FRAMES}/{name}/{i:05d}.jpg").convert("RGB")
    if im.size != (W, H):
        im = im.resize((W, H), Image.LANCZOS)
    arr = np.asarray(im, dtype=np.float32)
    if len(cache) > 12:
        cache.pop(next(iter(cache)))
    cache[key] = arr
    return arr


def seg_at(t):
    idx = 0
    for k, (_, start, _, _) in enumerate(SEGMENTS):
        if t + 1e-6 >= start:
            idx = k
    return idx


ff = subprocess.Popen(
    [
        FFMPEG, "-y", "-hide_banner", "-loglevel", "error",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
        "-i", AUDIO,
        "-map", "0:v", "-map", "1:a",
        "-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p",
        "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-profile:v", "high", "-level", "4.1",
        "-g", "60", "-bf", "2",
        "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
        "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
        "-movflags", "+faststart", "-shortest",
        OUT,
    ],
    stdin=subprocess.PIPE,
)

log = []
for k in range(N_FRAMES):
    t = k / FPS
    si = seg_at(t)
    name, start, dur, trans = SEGMENTS[si]
    j = int(round((t - start) * FPS))  # кадр внутри сегмента
    frame = load(name, j)
    note = f"{name}:{j}"
    # переход в начале сегмента
    if si > 0 and trans == "fade" and j < FADE_N:
        pname, pstart, _, _ = SEGMENTS[si - 1]
        pj = int(round((t - pstart) * FPS))
        a = (j + 1) / (FADE_N + 1)
        frame = frame * a + load(pname, pj) * (1 - a)
        note += f" fade<{pname}:{pj} a={a:.2f}"
    if si > 0 and trans == "flash" and j < len(FLASH):
        f = FLASH[j]
        frame = frame * (1 - f) + 255 * f
        note += f" flash {f}"
    # склейки внутри сегмента (скачок времени) — тоже вспышкой
    for c in meta[name].get("cuts", []):
        d = j - c
        if 0 <= d < len(FLASH):
            f = FLASH[d] * 0.8
            frame = frame * (1 - f) + 255 * f
            note += f" jumpflash {f:.2f}"
    ff.stdin.write(np.clip(frame, 0, 255).astype(np.uint8).tobytes())
    log.append(note)

ff.stdin.close()
code = ff.wait()
open(f"{WORK}/compose-log.txt", "w").write("\n".join(f"{i:4d} {i / FPS:6.3f} {n}" for i, n in enumerate(log)))
print("ffmpeg exit", code, "frames", N_FRAMES, "→", OUT)

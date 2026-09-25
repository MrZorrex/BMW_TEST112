# Звук промо-ролика: пересинтез игровых SFX из протокола + музыкальная подложка 128 BPM.
# Вывод: work/audio.wav (48 кГц, стерео, 16 бит)
import json
import math
import numpy as np
from scipy import signal
from scipy.io import wavfile
from timeline import SEGMENTS, BEAT, BAR, N_FRAMES, FPS, END_CARD_AT, FRAMES, WORK

SR = 48000
DUR = N_FRAMES / FPS
N = int(round(DUR * SR))
rng = np.random.default_rng(20260925)


def t_arr(n):
    return np.arange(n) / SR


def midi_hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


# ── band-limited осцилляторы по фазе (аддитивно, без алиасинга) ──
def osc(phase, freq, kind, max_h=64):
    """phase — накопленная фаза (радианы), freq — мгновенная частота (массив)."""
    if kind == "sine":
        return np.sin(phase)
    out = np.zeros_like(phase)
    nyq = SR / 2 * 0.9
    if kind == "square":
        ks = range(1, max_h * 2, 2)
        for k in ks:
            m = (k * freq) < nyq
            if not m.any():
                break
            out += np.where(m, np.sin(k * phase) / k, 0.0)
        return out * (4 / math.pi) * 0.92
    if kind == "sawtooth":
        for k in range(1, max_h + 1):
            m = (k * freq) < nyq
            if not m.any():
                break
            out += np.where(m, ((-1) ** (k + 1)) * np.sin(k * phase) / k, 0.0)
        return out * (2 / math.pi)
    if kind == "triangle":
        for i, k in enumerate(range(1, max_h * 2, 2)):
            m = (k * freq) < nyq
            if not m.any():
                break
            out += np.where(m, ((-1) ** i) * np.sin(k * phase) / (k * k), 0.0)
        return out * (8 / math.pi**2)
    raise ValueError(kind)


# ── автоматизация параметров как в Web Audio ──
def automate(events, times, default):
    """events: [[kind, value, time, (const)]]; times — абсолютные секунды (массив)."""
    ev = sorted(events, key=lambda e: e[2])
    out = np.full_like(times, float(default))
    cur_v, cur_t = float(default), -1e9
    for i, e in enumerate(ev):
        kind, v, t = e[0], float(e[1]), float(e[2])
        if kind == "set":
            out[times >= t] = v
            cur_v, cur_t = v, t
        elif kind in ("exp", "lin"):
            m = (times >= cur_t) & (times < t)
            if t > cur_t and m.any():
                k = (times[m] - cur_t) / (t - cur_t)
                if kind == "exp" and cur_v > 0 and v > 0:
                    out[m] = cur_v * (v / cur_v) ** k
                else:
                    out[m] = cur_v + (v - cur_v) * k
            out[times >= t] = v
            cur_v, cur_t = v, t
        elif kind == "target":
            c = float(e[3]) if len(e) > 3 else 0.1
            m = times >= t
            out[m] = v + (cur_v - v) * np.exp(-(times[m] - t) / max(c, 1e-4))
            cur_v, cur_t = v, t  # приближённо
    return out


def render_sfx(events, offset):
    buf = np.zeros(N)
    for e in events:
        start = e["start"] + offset
        stop = min(e["stop"] + offset, start + 3.0)
        if stop <= 0 or start >= DUR:
            continue
        i0 = max(0, int(start * SR))
        i1 = min(N, int(stop * SR) + 1)
        if i1 <= i0:
            continue
        times = np.arange(i0, i1) / SR
        # времена автоматизации — в секундах сегмента, сдвигаем в ролик
        fix = lambda evs: [[k, v, t + offset] + ([c[0]] if c and c[0] is not None else []) for k, v, t, *c in evs]
        fev = fix(e["freq"]) or [["set", 440, start]]
        gev = fix(e["gain"])
        f = automate(fev, times, fev[0][1])
        g = automate(gev, times, 1.0) if gev else np.full_like(times, 0.05)
        ph = 2 * math.pi * np.cumsum(f) / SR
        y = osc(ph, f, e["type"]) * g
        # микро-фейды против щелчков
        n = len(y)
        fl = min(n // 2, int(0.002 * SR))
        if fl > 0:
            ramp = np.linspace(0, 1, fl)
            y[:fl] *= ramp
            y[-fl:] *= ramp[::-1]
        buf[i0:i1] += y
    return buf


# ── музыкальные инструменты ──
def env_exp(n, tau):
    return np.exp(-t_arr(n) / tau)


def place(buf, x, t, gain=1.0):
    i0 = int(round(t * SR))
    if i0 >= len(buf) or i0 + len(x) <= 0:
        return
    a, b = max(0, i0), min(len(buf), i0 + len(x))
    buf[a:b] += x[a - i0 : b - i0] * gain


def kick():
    n = int(0.42 * SR)
    t = t_arr(n)
    f = 46 + 120 * np.exp(-t / 0.035)
    ph = 2 * math.pi * np.cumsum(f) / SR
    y = np.sin(ph) * np.exp(-t / 0.22)
    y = np.tanh(y * 1.6) / np.tanh(1.6)
    click = rng.standard_normal(int(0.004 * SR)) * np.linspace(1, 0, int(0.004 * SR)) * 0.35
    y[: len(click)] += click
    return y


def noise_hp(n, fc, order=4):
    sos = signal.butter(order, fc, "highpass", fs=SR, output="sos")
    return signal.sosfilt(sos, rng.standard_normal(n))


def noise_bp(n, lo, hi, order=3):
    sos = signal.butter(order, [lo, hi], "bandpass", fs=SR, output="sos")
    return signal.sosfilt(sos, rng.standard_normal(n))


def clap():
    n = int(0.32 * SR)
    t = t_arr(n)
    body = noise_bp(n, 900, 5200)
    e = np.zeros(n)
    for d in (0.0, 0.011, 0.022):
        i = int(d * SR)
        e[i:] += np.exp(-(t[: n - i]) / 0.006) * 0.8
    i = int(0.03 * SR)
    e[i:] += np.exp(-(t[: n - i]) / 0.11)
    y = body * e
    return y / (np.abs(y).max() + 1e-9)


def snare():
    n = int(0.25 * SR)
    t = t_arr(n)
    y = noise_bp(n, 1200, 7000) * np.exp(-t / 0.09) * 0.8
    y += np.sin(2 * math.pi * 190 * t) * np.exp(-t / 0.05) * 0.6
    return y / (np.abs(y).max() + 1e-9)


def hat(open_=False):
    n = int((0.22 if open_ else 0.06) * SR)
    y = noise_hp(n, 7500) * env_exp(n, 0.07 if open_ else 0.018)
    return y / (np.abs(y).max() + 1e-9)


def crash(length=2.2):
    n = int(length * SR)
    t = t_arr(n)
    y = noise_hp(n, 4200, 2) * np.exp(-t / 0.75)
    y += noise_bp(n, 2500, 6000, 2) * np.exp(-t / 0.3) * 0.5
    return y / (np.abs(y).max() + 1e-9)


def _blep(t, dt):
    y = np.zeros_like(t)
    m1 = t < dt
    x = t[m1] / dt
    y[m1] = 2 * x - x * x - 1
    m2 = t > 1 - dt
    x = (t[m2] - 1) / dt
    y[m2] = x * x + 2 * x + 1
    return y


def saw(freq, n, detune_cents=0.0, phase0=0.0):
    """PolyBLEP-пила: дёшево и почти без алиасинга."""
    f = freq * 2 ** (detune_cents / 1200)
    dt = f / SR
    t = (phase0 / (2 * math.pi) + dt * np.arange(n)) % 1.0
    return 2 * t - 1 - _blep(t, dt)


def square(freq, n, phase0=0.0):
    f = freq
    dt = f / SR
    t = (phase0 / (2 * math.pi) + dt * np.arange(n)) % 1.0
    t2 = (t + 0.5) % 1.0
    return ((2 * t - 1 - _blep(t, dt)) - (2 * t2 - 1 - _blep(t2, dt))) * 0.5


def lowpass(x, fc, order=2):
    sos = signal.butter(order, fc, "lowpass", fs=SR, output="sos")
    return signal.sosfilt(sos, x)


# ── аранжировка ──
CHORDS = {  # голоса пэда (MIDI) и корень баса
    "Am": ([57, 60, 64, 69], 33),
    "F": ([53, 57, 60, 65], 29),
    "C": ([55, 60, 64, 67], 36),
    "G": ([55, 59, 62, 67], 31),
    "E": ([56, 59, 64, 68], 28),
}
PROG = ["Am", "F", "C", "G", "Am", "F", "C", "G", "E", "Am", "F", "G", "C", "C"]
N_BARS = len(PROG)

drums = np.zeros(N)
bass = np.zeros(N)
padL = np.zeros(N)
padR = np.zeros(N)
lead = np.zeros(N)
fx = np.zeros(N)

K, CL, SN, HC, HO, CR = kick(), clap(), snare(), hat(False), hat(True), crash()

BUILD_BARS = (7, 8)  # брейк/разгон перед раскрытием карты
DROP_BAR = 9
END_BAR = 12

for b in range(N_BARS):
    t0 = b * BAR
    chord = PROG[b]
    notes, root = CHORDS[chord]
    in_build = b in BUILD_BARS
    # ── ударные ──
    for beat in range(4):
        tb = t0 + beat * BEAT
        if b < END_BAR:
            if not (b == 8 and beat >= 2):
                place(drums, K, tb, 0.95)
            if beat in (1, 3) and not in_build:
                place(drums, CL, tb, 0.42)
            if not in_build or b == 7:
                place(drums, HO, tb + BEAT / 2, 0.16)
            for s16 in range(4):
                if s16 != 2:
                    place(drums, HC, tb + s16 * BEAT / 4, 0.07 if s16 % 2 else 0.1)
        elif b == END_BAR and beat == 0:
            place(drums, K, tb, 1.0)
    # под финальной карточкой — лёгкие хэты, затихающие к концу
    if b >= END_BAR:
        for e8 in range(8):
            k_f = max(0.0, 1 - ((b - END_BAR) * 8 + e8) / 16)
            tb = t0 + e8 * BEAT / 2
            if b == END_BAR and e8 == 0:
                continue
            place(drums, HC, tb, 0.07 * k_f)
            if e8 % 2 == 1:
                place(drums, HO, tb, 0.09 * k_f)
    # разгон: дробь малого, ускоряется к раскрытию
    if b == 8:
        hits = [t0 + i * BEAT / 2 for i in range(4)] + [t0 + 2 * BEAT + i * BEAT / 4 for i in range(8)]
        for i, th in enumerate(hits):
            place(drums, SN, th, 0.18 + 0.5 * i / len(hits))
    # тарелки на сильных местах
    if b in (0, 5, DROP_BAR, END_BAR):
        place(drums, CR, t0, 0.5 if b != END_BAR else 0.62)

    # ── бас: восьмые на слабые доли + корень на сильной ──
    if b < END_BAR and b != 8:
        f = midi_hz(root)
        for e8 in range(8):
            if e8 % 2 == 0 and e8 != 0:
                continue
            tn = t0 + e8 * BEAT / 2
            n = int(BEAT / 2 * SR * 0.92)
            ln = n
            x = saw(f * (2 if e8 in (3, 7) else 1), ln) * 0.6 + np.sin(2 * math.pi * f * t_arr(ln)) * 0.7
            x *= np.minimum(1, t_arr(ln) / 0.004) * np.exp(-t_arr(ln) / 0.2)
            x = lowpass(x, 700 if not in_build else 420)
            place(bass, x, tn, 0.55)
    elif b == END_BAR:
        f = midi_hz(CHORDS["C"][1])
        n = int(BAR * 1.6 * SR)
        x = (np.sin(2 * math.pi * f * t_arr(n)) * 0.9 + saw(f, n) * 0.25) * np.exp(-t_arr(n) / 1.1)
        place(bass, lowpass(x, 500), t0, 0.7)

    # ── пэд: суперсо, по такту, мягкая атака/релиз ──
    if b <= END_BAR:
        length = BAR if b < END_BAR else BAR * 2
        n = int(length * SR) + int(0.08 * SR)
        e = np.minimum(1, t_arr(n) / 0.03) * np.minimum(1, np.maximum(0, (n - np.arange(n)) / (0.08 * SR)))
        if b == END_BAR:
            e *= np.exp(-t_arr(n) / 2.2)
        for m in notes:
            f = midi_hz(m)
            for side, dets in ((padL, (-14, 3, 9)), (padR, (-6, -2, 13))):
                acc = np.zeros(n)
                for d in dets:
                    acc += saw(f, n, d, rng.uniform(0, 2 * math.pi))
                side_x = lowpass(acc, 1400 if in_build else 2600) * e
                place(side, side_x, t0, 0.05 if not in_build else 0.035)

    # ── лид-арпеджио: шестнадцатые по звукам аккорда (с сегмента прокачки и после раскрытия) ──
    if (5 <= b <= 6) or (DROP_BAR <= b):
        pattern = [0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 2, 3, 1, 2]
        tones = [n_ + 12 for n_ in notes]
        for i, pi in enumerate(pattern):
            tn = t0 + i * BEAT / 4
            if b >= END_BAR:  # финал: арпеджио тише и затухает к концу ролика
                k_f = max(0.0, 1 - ((b - END_BAR) * 16 + i) / 32) * 0.6
                if b == END_BAR and i < 2:
                    continue
            else:
                k_f = 1.0
            f = midi_hz(tones[pi])
            ln = int(0.16 * SR)
            x = square(f, ln) * 0.5 + saw(f * 1.003, ln) * 0.5
            x = lowpass(x, 3200) * np.minimum(1, t_arr(ln) / 0.003) * np.exp(-t_arr(ln) / 0.075)
            place(lead, x, tn, (0.075 if i % 4 else 0.095) * k_f)

# ── FX: подъём перед раскрытием, удар на раскрытии, свип перед финальной карточкой ──
def riser(length, lo=300, hi=9000, gain=0.25):
    n = int(length * SR)
    y = np.zeros(n)
    noise = rng.standard_normal(n)
    block = 512
    zi = None
    for i in range(0, n, block):
        k = i / n
        fc = lo * (hi / lo) ** k
        sos = signal.butter(2, [fc * 0.7, min(fc * 1.4, SR / 2 * 0.95)], "bandpass", fs=SR, output="sos")
        if zi is None:
            zi = signal.sosfilt_zi(sos) * 0
        seg, zi = signal.sosfilt(sos, noise[i : i + block], zi=zi)
        y[i : i + block] = seg
    y /= np.abs(y).max() + 1e-9
    return y * np.linspace(0, 1, n) ** 2 * gain


def impact(length=1.6):
    n = int(length * SR)
    t = t_arr(n)
    f = 30 + 45 * np.exp(-t / 0.25)
    ph = 2 * math.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t / 0.55)


place(fx, riser(BAR * 2 - 0.02, 250, 9000, 0.3), BAR * 7)
place(fx, impact(), BAR * DROP_BAR, 0.75)
place(fx, riser(BEAT * 2, 800, 10000, 0.18), END_CARD_AT - BEAT * 2)
place(fx, impact(2.2), END_CARD_AT, 0.85)

# ── сайдчейн от бочки для баса и пэда ──
duck = np.ones(N)
for b in range(N_BARS):
    for beat in range(4):
        if b >= END_BAR:
            break
        if b == 8 and beat >= 2:
            continue
        i0 = int((b * BAR + beat * BEAT) * SR)
        n = int(BEAT * SR)
        tt = t_arr(n)
        d = 1 - 0.62 * np.exp(-tt / 0.09)
        duck[i0 : i0 + n] = np.minimum(duck[i0 : i0 + n], d[: max(0, min(n, N - i0))])

bass *= duck
padL *= duck
padR *= duck

# ── простая реверберация (синтетическая импульсная характеристика) ──
def reverb_ir(length=1.6, seed=7):
    r = np.random.default_rng(seed)
    n = int(length * SR)
    t = t_arr(n)
    ir = r.standard_normal(n) * np.exp(-t / 0.42)
    ir = lowpass(ir, 6000)
    ir[: int(0.012 * SR)] = 0
    return ir / np.sqrt((ir**2).sum())


irL, irR = reverb_ir(seed=7), reverb_ir(seed=8)

# пинг-понг дилей для лида (3/16)
dl = int(BEAT * 0.75 * SR)
leadL = lead.copy()
leadR = lead.copy()
leadR[dl:] += lead[:-dl] * 0.35
leadL[2 * dl :] += lead[: -2 * dl] * 0.22

def active_rms_db(x, win=0.05, floor_db=-60):
    """RMS только по звучащим окнам (чтобы паузы не занижали уровень)."""
    n = int(win * SR)
    m = len(x) // n
    w = np.sqrt(np.mean(x[: m * n].reshape(m, n) ** 2, axis=1) + 1e-20)
    act = w[20 * np.log10(w) > floor_db]
    return 20 * np.log10(np.sqrt(np.mean(act**2)) + 1e-12) if len(act) else -120.0


# баланс стемов по «активному» RMS (дБ): бочка/бас впереди, пэд и лид чуть ниже
TARGETS = {"drums": -15.0, "bass": -17.5, "pad": -20.5, "lead": -21.0, "fx": -21.0}
stems = {"drums": [drums], "bass": [bass], "pad": [padL, padR], "lead": [lead, leadL, leadR], "fx": [fx]}
for nm, arrs in stems.items():
    ref = arrs[0] if nm != "pad" else (padL + padR) / 2
    g = 10 ** ((TARGETS[nm] - active_rms_db(ref)) / 20)
    for a in arrs:
        a *= g
    print(f"  stem {nm:5s} gain {20 * np.log10(g):+6.1f} dB → active rms {active_rms_db(ref):6.1f} dB, peak {np.abs(ref).max():.3f}")
# реверберация — от уже сбалансированных стемов
send = lead * 0.8 + (padL + padR) * 0.3 + drums * 0.04
revL = signal.fftconvolve(send, irL)[:N] * 0.3
revR = signal.fftconvolve(send, irR)[:N] * 0.3
musicL = drums + bass + padL + leadL + fx + revL
musicR = drums + bass + padR + leadR + fx + revR

# ── игровые SFX ──
sfx = np.zeros(N)
counts = {}
for name, start, dur, _ in SEGMENTS:
    meta = json.load(open(f"{FRAMES}/{name}/meta.json"))
    evs = [e for e in meta["audio"] if e["start"] < dur - 1e-3]
    counts[name] = len(evs)
    sfx += render_sfx(evs, start)
print("sfx events per segment:", counts)

# ── сведение ──
def rms_db(x):
    return 20 * np.log10(np.sqrt(np.mean(x**2)) + 1e-12)


music = np.stack([musicL, musicR])
print("music rms dB (pre):", round(rms_db(music), 2), "peak", round(np.abs(music).max(), 3))
active = np.abs(sfx) > 1e-4
print("sfx rms dB (pre, active):", round(rms_db(sfx[active]) if active.any() else -120, 2), "peak", round(np.abs(sfx).max(), 3))

# уровни: музыка ≈ -17 dBFS RMS, SFX ≈ -21 dBFS RMS там, где звучат
music *= 10 ** ((-17 - rms_db(music)) / 20)
sfx *= 10 ** ((-21 - rms_db(sfx[active])) / 20)
mix = music + sfx[None, :] * np.array([[1.0], [1.0]])

# мягкий лимитер: сжатие пиков через tanh выше -3 dBFS, затем нормализация до -1 dBFS
thr = 10 ** (-3 / 20)
over = np.abs(mix) > thr
mix = np.where(over, np.sign(mix) * (thr + (1 - thr) * np.tanh((np.abs(mix) - thr) / (1 - thr))), mix)
mix *= 10 ** (-1 / 20) / np.abs(mix).max()

# финальный фейд 0.5 с и мини-фейд в начале
fade = int(0.5 * SR)
mix[:, -fade:] *= np.linspace(1, 0, fade) ** 1.5
mix[:, : int(0.004 * SR)] *= np.linspace(0, 1, int(0.004 * SR))

print("final peak dBFS:", round(20 * np.log10(np.abs(mix).max()), 2), "rms dBFS:", round(rms_db(mix), 2), "clipped samples:", int((np.abs(mix) >= 1.0).sum()))
wavfile.write(f"{WORK}/audio.wav", SR, (mix.T * 32767).astype(np.int16))
print(f"wrote {WORK}/audio.wav", round(N / SR, 3), "s")

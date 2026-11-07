#!/usr/bin/env python3
"""
The app's sound cues, synthesized: nothing recorded, nothing licensed. Run again to rebuild
src/audio/cues/*.wav (`npm run sounds`); the same seed gives the same files.

Each cue is short (under 1.6 s), mono, 32 kHz, 16-bit, and peaks at -3 dBFS; the app plays them
quieter still (src/lib/feedback.ts). The palette follows the app's materials: stone, copper, paper.
"""
import math
import os
import random
import struct
import wave

RATE = 32_000
OUT = os.path.join(os.path.dirname(__file__), "..", "src", "audio", "cues")
random.seed(1453)


def silence(seconds):
    return [0.0] * int(seconds * RATE)


def mix(into, sound, at=0.0, gain=1.0):
    """Adds `sound` into `into` from `at` seconds, growing `into` as needed."""
    start = int(at * RATE)
    end = start + len(sound)
    if end > len(into):
        into.extend([0.0] * (end - len(into)))
    for i, s in enumerate(sound):
        into[start + i] += s * gain
    return into


def tone(freq, seconds, decay, attack=0.004, partials=((1.0, 1.0),), detune=0.0, glide_to=None):
    """A struck tone: partials (ratio, level), each dying away faster the higher it is."""
    n = int(seconds * RATE)
    out = [0.0] * n
    for ratio, level in partials:
        phase = 0.0
        phase2 = 0.0
        tail = decay / (1 + 0.6 * (ratio - 1))
        for i in range(n):
            t = i / RATE
            f = freq if glide_to is None else freq * (glide_to / freq) ** min(1.0, t / seconds)
            phase += 2 * math.pi * f * ratio / RATE
            value = math.sin(phase)
            if detune:
                # A slightly sharper twin: the slow beat of a real bell.
                phase2 += 2 * math.pi * (f * ratio + detune) / RATE
                value = 0.5 * (value + math.sin(phase2))
            env = min(1.0, t / attack) * math.exp(-t / tail)
            out[i] += value * level * env
    return out


def noise(seconds, decay, low=None, high=None, attack=0.001):
    """A burst of noise, one-pole filtered: `low` cuts below, `high` cuts above (Hz)."""
    n = int(seconds * RATE)
    out = []
    lp = hp_prev_in = hp_prev_out = 0.0
    a_lp = 1 - math.exp(-2 * math.pi * high / RATE) if high else 1.0
    a_hp = math.exp(-2 * math.pi * low / RATE) if low else 0.0
    for i in range(n):
        t = i / RATE
        x = random.uniform(-1, 1)
        lp += a_lp * (x - lp)
        y = lp
        if low:
            hp = a_hp * (hp_prev_out + y - hp_prev_in)
            hp_prev_in, hp_prev_out = y, hp
            y = hp
        out.append(y * min(1.0, t / attack) * math.exp(-t / decay))
    return out


def finish(samples, peak_db=-3.0, fade=0.02):
    """Peak-normalized, with a short fade so no file ends on a click."""
    peak = max(abs(s) for s in samples) or 1.0
    gain = 10 ** (peak_db / 20) / peak
    n = len(samples)
    fade_n = int(fade * RATE)
    return [s * gain * (min(1.0, (n - i) / fade_n) if fade_n else 1) for i, s in enumerate(samples)]


def write(name, samples):
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, f"{name}.wav")
    with wave.open(path, "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(RATE)
        f.writeframes(b"".join(struct.pack("<h", int(max(-1, min(1, s)) * 32767)) for s in samples))
    print(f"{path}  {len(samples) / RATE:.2f} s  {os.path.getsize(path) // 1024} KB")


def note(name):
    """Hz of a note such as "C6"."""
    steps = {"C": -9, "D": -7, "E": -5, "F": -4, "G": -2, "A": 0, "B": 2}[name[0]]
    return 440 * 2 ** ((steps + 12 * (int(name[1:]) - 4)) / 12)


# Ziyaret Mührü: the photo has settled on the seal's picture. A small stone tap.
def seal_fit():
    s = silence(0.16)
    mix(s, noise(0.02, 0.003, low=2500), gain=0.5)
    mix(s, tone(1900, 0.12, 0.022, attack=0.001, partials=((1, 1), (1.53, 0.5))), gain=0.7)
    mix(s, tone(240, 0.14, 0.035, attack=0.001), gain=0.8)
    return finish(s, peak_db=-4)


# Ziyaret Mührü: the seal is pressed. A wooden knock (in the range a phone's speaker can play;
# the low thud under it is for headphones), then a small copper bell rings out.
def seal_stamp():
    s = silence(1.6)
    mix(s, tone(520, 0.12, 0.035, attack=0.001, glide_to=260, partials=((1, 1), (2.3, 0.35))), gain=0.9)
    mix(s, noise(0.05, 0.012, low=400, high=3500), gain=0.5)
    mix(s, tone(120, 0.25, 0.07, attack=0.002, glide_to=55), gain=0.45)
    bell = tone(note("C6"), 1.45, 0.9, attack=0.003, detune=1.6, partials=((1, 1), (2.76, 0.45), (5.4, 0.22), (8.93, 0.1)))
    mix(s, bell, at=0.09, gain=0.95)
    return finish(s)


# Taşın Dili: an inscription is found. Two soft notes rising, a little shimmer over them.
def inscription_found():
    s = silence(0.9)
    soft = ((1, 1), (2, 0.12))
    mix(s, tone(note("G5"), 0.7, 0.32, attack=0.012, partials=soft), gain=0.7)
    mix(s, tone(note("D6"), 0.75, 0.38, attack=0.012, partials=soft), at=0.09, gain=0.7)
    for i, f in enumerate((2350, 2790, 3520)):
        mix(s, tone(f, 0.25, 0.06, attack=0.003), at=0.14 + 0.035 * i, gain=0.12)
    return finish(s, peak_db=-5)


# A badge is earned: a quick bright run upward, then a full chord that sparkles away.
def badge():
    s = silence(1.3)
    mallet = ((1, 1), (3, 0.18), (4, 0.1))
    for i, n in enumerate(("C6", "E6", "G6")):
        mix(s, tone(note(n), 0.35, 0.16, attack=0.002, partials=mallet), at=0.075 * i, gain=0.55)
    chord_at = 0.24
    bright = ((1, 1), (2, 0.25), (3, 0.12), (5, 0.05))
    for n, g in (("C6", 0.45), ("E6", 0.4), ("G6", 0.4), ("C7", 0.5)):
        mix(s, tone(note(n), 1.0, 0.45, attack=0.006, partials=bright), at=chord_at, gain=g)
    # A rush of air under the run, and sparkles over the chord.
    mix(s, noise(0.3, 0.12, low=3000, attack=0.15), gain=0.05)
    for i in range(7):
        f = random.uniform(3000, 5200)
        mix(s, tone(f, 0.18, 0.05, attack=0.002), at=chord_at + 0.03 + i * 0.07, gain=0.08)
    return finish(s)


if __name__ == "__main__":
    write("seal-fit", seal_fit())
    write("seal-stamp", seal_stamp())
    write("inscription-found", inscription_found())
    write("badge", badge())

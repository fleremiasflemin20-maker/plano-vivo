"""Original background music for the presentation video, synthesised from scratch.

Light, upbeat pop loop: pad chords, plucked arpeggios, bass and soft drums over the
progression C – G – Am – F at 112 BPM, with an intro (no drums), a fade-in and a
fade-out. No samples or third-party recordings, so it can be published freely.

    python musica.py 175 musica.wav     # duration in seconds, output file
"""

import sys
import wave

import numpy as np

RATE = 44100
BPM = 112
BEAT = 60 / BPM
BAR = 4 * BEAT
rng = np.random.default_rng(7)


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


# C – G – Am – F (one bar each), as MIDI notes: root, third, fifth.
CHORDS = [(48, 52, 55), (43, 47, 50), (45, 48, 52), (41, 45, 48)]


def env(n, attack, release):
    e = np.ones(n)
    a, r = min(n, int(attack * RATE)), min(n, int(release * RATE))
    if a:
        e[:a] = np.linspace(0, 1, a)
    if r:
        e[-r:] *= np.linspace(1, 0, r)
    return e


def lowpass(x, cutoff):
    # One-pole low-pass filter (vectorised enough for a few minutes of audio).
    alpha = 1 - np.exp(-2 * np.pi * cutoff / RATE)
    try:
        from scipy.signal import lfilter

        return lfilter([alpha], [1, alpha - 1], x)
    except ImportError:
        pass
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc += alpha * (x[i] - acc)
        y[i] = acc
    return y


def saw(freq, n):
    t = np.arange(n) / RATE
    return 2 * ((t * freq) % 1) - 1


def pad(chord, n):
    out = np.zeros(n)
    for note in chord + (chord[0] + 12,):
        f = midi(note + 12)
        for detune in (0.997, 1.003):
            out += saw(f * detune, n)
    return out * env(n, 0.35, 0.4) / 8


def pluck(freq, n, decay=0.22):
    t = np.arange(n) / RATE
    tone = np.sin(2 * np.pi * freq * t) + 0.35 * np.sin(4 * np.pi * freq * t)
    return tone * np.exp(-t / decay) * env(n, 0.004, 0.02)


def kick(n):
    t = np.arange(n) / RATE
    f = 50 + 70 * np.exp(-t / 0.04)
    return np.sin(2 * np.pi * np.cumsum(f) / RATE) * np.exp(-t / 0.16)


def noise_hit(n, decay, bright):
    x = rng.standard_normal(n) * np.exp(-np.arange(n) / RATE / decay)
    if bright:  # crude high-pass: difference of samples
        x = np.diff(x, prepend=0)
    return x


def song(seconds):
    total = int((seconds + 1) * RATE)
    music = np.zeros(total)
    pads = np.zeros(total)
    bar_n = int(BAR * RATE)
    eighth = int(BEAT / 2 * RATE)
    beat_n = int(BEAT * RATE)
    bars = int(np.ceil(seconds / BAR)) + 1
    for b in range(bars):
        start = b * bar_n
        if start >= total:
            break
        chord = CHORDS[b % 4]
        n = min(bar_n, total - start)
        pads[start : start + n] += pad(chord, n)
        # Arpeggio: chord tones up two octaves, eighth notes, a different order every
        # other bar so the loop does not feel mechanical.
        order = [0, 1, 2, 1, 0, 2, 1, 2] if b % 2 == 0 else [0, 2, 1, 2, 0, 1, 2, 1]
        for i, k in enumerate(order):
            s = start + i * eighth
            if s >= total:
                break
            m = min(eighth * 2, total - s)
            music[s : s + m] += 0.22 * pluck(midi(chord[k] + 24), m)
        # Bass: root on 1 and the "and" of 2, fifth on 3.
        for pos, note in ((0, chord[0]), (1.5, chord[0]), (2, chord[2]), (3.5, chord[0])):
            s = start + int(pos * beat_n)
            if s >= total:
                continue
            m = min(int(0.9 * beat_n), total - s)
            music[s : s + m] += 0.35 * pluck(midi(note - 12), m, decay=0.35)
        # Drums after a 4-bar intro.
        if b >= 4:
            for beat in range(4):
                s = start + beat * beat_n
                if s >= total:
                    continue
                m = min(int(0.3 * RATE), total - s)
                if beat in (0, 2):
                    music[s : s + m] += 0.55 * kick(m)
                else:
                    music[s : s + m] += 0.12 * noise_hit(m, 0.07, False)
            for e in range(8):
                s = start + e * eighth
                if s >= total:
                    continue
                m = min(int(0.05 * RATE), total - s)
                music[s : s + m] += (0.05 if e % 2 else 0.03) * noise_hit(m, 0.015, True)
    music += lowpass(pads, 1800) * 0.9
    music = music[: int(seconds * RATE)]
    # Fade in 2 s, fade out 4 s, normalise with headroom.
    music *= env(len(music), 2.0, 4.0)
    music /= np.max(np.abs(music)) / 0.8
    return music


def write(path, x):
    stereo = np.repeat((x * 32767).astype(np.int16)[:, None], 2, axis=1)
    with wave.open(path, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(stereo.tobytes())


if __name__ == '__main__':
    write(sys.argv[2], song(float(sys.argv[1])))

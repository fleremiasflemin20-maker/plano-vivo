"""Builds the presentation video: narration (edge-tts), recording (record.js), mix (ffmpeg).

    cd tools/video
    npm install playwright@1.65.1
    python montar.py            # narration + recording + final MP4/VTT in dist/media/

Needs Microsoft Edge, ffmpeg and `pip install edge-tts`. The narration text in guion.json
is sent to Microsoft's speech service; nothing else leaves the computer.
"""

import json
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
MEDIA = HERE.parents[1] / 'dist' / 'media'
VOICE = 'es-EC-AndreaNeural'
DEMO = HERE.parents[1] / 'test-recognize.mjs'


def run(*cmd, **kw):
    return subprocess.run(cmd, check=True, cwd=HERE, **kw)


def narration(scenes):
    (HERE / 'audio').mkdir(exist_ok=True)
    for s in scenes:
        out = HERE / 'audio' / f"{s['id']}.mp3"
        run(
            'python',
            '-m',
            'edge_tts',
            '--voice',
            VOICE,
            '--rate',
            '+4%',
            '--text',
            s['texto'],
            '--write-media',
            str(out),
        )
        d = run(
            'ffprobe',
            '-v',
            'error',
            '-show_entries',
            'format=duration',
            '-of',
            'csv=p=0',
            str(out),
            capture_output=True,
            text=True,
        ).stdout
        s['audio'] = round(float(d), 2)


def demo_plans():
    # The synthetic test plans: our own drawings, no third-party images.
    script = (
        f"const m = await import('{DEMO.as_uri()}');"
        "const fs = await import('node:fs');"
        "for (const [n, p] of [['demo', m.syntheticPlan(90)], ['diagonal', m.diagonalPlan(90)]])"
        " { fs.writeFileSync(n + '.rgba', Buffer.from(p.rgba.buffer));"
        " fs.writeFileSync(n + '.size', p.W + ' ' + p.H); }"
    )
    run('node', '--input-type=module', '-e', script)
    for name in ('demo', 'diagonal'):
        w, h = (HERE / f'{name}.size').read_text().split()
        run(
            'ffmpeg',
            '-v',
            'error',
            '-y',
            '-f',
            'rawvideo',
            '-pix_fmt',
            'rgba',
            '-s',
            f'{w}x{h}',
            '-i',
            f'{name}.rgba',
            f'{name}.png',
        )


def ts(ms, sep):
    h, ms = divmod(int(ms), 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return f'{h:02}:{m:02}:{s:02}{sep}{ms:03}'


def mix(scenes):
    by_id = {s['id']: s for s in scenes}
    timeline = json.loads((HERE / 'timeline.json').read_text())
    inputs, filters, labels = ['-i', 'raw.webm'], [], []
    for i, t in enumerate(timeline, start=1):
        inputs += ['-i', f"audio/{t['id']}.mp3"]
        d = t['start'] + 350
        filters.append(f'[{i}:a]adelay={d}|{d}[a{i}]')
        labels.append(f'[a{i}]')
    filters.append(''.join(labels) + f'amix=inputs={len(labels)}:normalize=0,apad[aout]')
    MEDIA.mkdir(exist_ok=True)
    out = MEDIA / 'plano-vivo-presentacion.mp4'
    run(
        'ffmpeg',
        '-v',
        'error',
        '-y',
        *inputs,
        '-filter_complex',
        ';'.join(filters),
        '-map',
        '0:v',
        '-map',
        '[aout]',
        '-c:v',
        'libx264',
        '-preset',
        'slow',
        '-crf',
        '27',
        '-pix_fmt',
        'yuv420p',
        '-r',
        '25',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-shortest',
        '-movflags',
        '+faststart',
        str(out),
    )
    run(
        'ffmpeg',
        '-v',
        'error',
        '-y',
        '-ss',
        '20',
        '-i',
        str(out),
        '-frames:v',
        '1',
        '-vf',
        'scale=640:-1',
        '-q:v',
        '4',
        str(MEDIA / 'plano-vivo-presentacion.jpg'),
    )
    cues = ['WEBVTT', '']
    for t in timeline:
        start = t['start'] + 350
        end = start + by_id[t['id']]['audio'] * 1000
        cues += [f"{ts(start, '.')} --> {ts(end, '.')}", by_id[t['id']]['texto'], '']
    (MEDIA / 'plano-vivo-presentacion.vtt').write_text('\n'.join(cues), encoding='utf-8')


if __name__ == '__main__':
    scenes = json.loads((HERE / 'guion.json').read_text(encoding='utf-8'))
    narration(scenes)
    (HERE / 'guion.json').write_text(
        json.dumps(scenes, ensure_ascii=False, indent=1), encoding='utf-8'
    )
    demo_plans()
    run('node', 'record.js')
    mix(scenes)

import subprocess, os, json, re, tempfile, shutil
from flask import Flask, request, jsonify, send_file, render_template_string
from flask_cors import CORS
from werkzeug.utils import secure_filename

app = Flask(__name__)
CORS(app)

MAX_FILE_MB = int(os.environ.get('MAX_FILE_MB', 500))
MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024

FFMPEG  = shutil.which('ffmpeg')  or 'ffmpeg'
FFPROBE = shutil.which('ffprobe') or 'ffprobe'

UPLOAD_FOLDER = tempfile.gettempdir()

# ── helpers ──────────────────────────────────────────────────────────────────

def run(cmd, timeout=300):
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)

def tmp(suffix='.mp4'):
    f = tempfile.NamedTemporaryFile(delete=False, suffix=suffix, dir=UPLOAD_FOLDER)
    f.close()
    return f.name

# ── routes ───────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    with open('index.html', encoding='utf-8') as f:
        return f.read()

@app.route('/health')
def health():
    ok = bool(shutil.which('ffmpeg'))
    return jsonify({'status': 'ok', 'ffmpeg': ok})

@app.route('/analyze', methods=['POST'])
def analyze():
    """Receive video, detect black frames with FFmpeg, return timestamps."""
    f = request.files.get('video')
    if not f:
        return jsonify({'error': 'No video'}), 400
    if f.content_length and f.content_length > MAX_FILE_BYTES:
        return jsonify({'error': f'Archivo muy grande (máx {MAX_FILE_MB} MB)'}), 413

    ext = os.path.splitext(secure_filename(f.filename))[1] or '.mp4'
    src = tmp(ext)
    f.save(src)

    try:
        # Duration
        pr = run([FFPROBE, '-v', 'quiet', '-print_format', 'json',
                  '-show_format', src])
        duration = float(json.loads(pr.stdout)['format']['duration'])

        # Black frame detection
        bd = run([FFMPEG, '-i', src,
                  '-vf', 'blackdetect=d=0.05:pix_th=0.10',
                  '-an', '-f', 'null', '-'], timeout=120)

        blacks = []
        for line in bd.stderr.split('\n'):
            m = re.search(r'black_start:([\d.]+)\s+black_end:([\d.]+)', line)
            if m:
                blacks.append({'start': float(m.group(1)), 'end': float(m.group(2))})

        return jsonify({'duration': duration, 'black_frames': blacks})
    finally:
        try: os.unlink(src)
        except: pass

@app.route('/cut', methods=['POST'])
def cut():
    """Cut a segment and return the MP4 file."""
    f      = request.files.get('video')
    start  = request.form.get('start', '0')
    end    = request.form.get('end',   '10')
    index  = request.form.get('index', '1')

    if not f:
        return jsonify({'error': 'No video'}), 400

    ext = os.path.splitext(secure_filename(f.filename))[1] or '.mp4'
    src = tmp(ext)
    out = tmp('.mp4')
    f.save(src)

    try:
        r = run([
            FFMPEG,
            '-ss', str(start), '-to', str(end),
            '-i', src,
            '-c', 'copy',
            '-avoid_negative_ts', 'make_zero',
            '-movflags', '+faststart',
            '-y', out
        ])
        if r.returncode != 0:
            return jsonify({'error': r.stderr[-600:]}), 500

        base = os.path.splitext(secure_filename(f.filename))[0]
        return send_file(out, mimetype='video/mp4', as_attachment=True,
                         download_name=f'{base}_segmento_{index}.mp4')
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        try: os.unlink(src)
        except: pass

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5050))
    print(f'CortaClip corriendo en http://localhost:{port}')
    app.run(host='0.0.0.0', port=port, debug=False)

import subprocess, os, json, re, tempfile, shutil, sys, base64, threading, uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from werkzeug.utils import secure_filename

# Auto-install ffmpeg if not found
if not shutil.which('ffmpeg'):
    subprocess.run(['apt-get', 'update', '-qq'], check=False)
    subprocess.run(['apt-get', 'install', '-y', '-qq', 'ffmpeg'], check=False)

app = Flask(__name__, static_folder='.')
CORS(app)

MAX_FILE_MB    = int(os.environ.get('MAX_FILE_MB', 500))
MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024
ANTHROPIC_KEY  = os.environ.get('ANTHROPIC_API_KEY', '')

FFMPEG  = shutil.which('ffmpeg')  or 'ffmpeg'
FFPROBE = shutil.which('ffprobe') or 'ffprobe'
TMP     = tempfile.gettempdir()

# In-memory session store: session_id -> tmp file path
_sessions = {}
_sessions_lock = threading.Lock()

def run(cmd, timeout=300):
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)

def tmp(suffix='.mp4'):
    f = tempfile.NamedTemporaryFile(delete=False, suffix=suffix, dir=TMP)
    f.close()
    return f.name

# ── routes ────────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    with open('index.html', encoding='utf-8') as f:
        return f.read()

@app.route('/health')
def health():
    return jsonify({
        'status': 'ok',
        'ffmpeg': bool(shutil.which('ffmpeg')),
        'claude': bool(ANTHROPIC_KEY)
    })

@app.route('/upload', methods=['POST'])
def upload():
    """Upload video once, store in session, return session_id + duration + black frames."""
    f = request.files.get('video')
    if not f:
        return jsonify({'error': 'No video'}), 400

    ext = os.path.splitext(secure_filename(f.filename))[1] or '.mp4'
    src = tmp(ext)
    f.save(src)

    try:
        # Get duration
        pr = run([FFPROBE, '-v', 'quiet', '-print_format', 'json', '-show_format', src])
        duration = float(json.loads(pr.stdout)['format']['duration'])

        # Black frame detection
        bd = run([FFMPEG, '-i', src, '-vf', 'blackdetect=d=0.05:pix_th=0.10',
                  '-an', '-f', 'null', '-'], timeout=120)
        blacks = []
        for line in bd.stderr.split('\n'):
            m = re.search(r'black_start:([\d.]+)\s+black_end:([\d.]+)', line)
            if m:
                blacks.append({'start': float(m.group(1)), 'end': float(m.group(2))})

        # Store session
        session_id = str(uuid.uuid4())
        with _sessions_lock:
            _sessions[session_id] = {'path': src, 'filename': secure_filename(f.filename)}

        return jsonify({
            'session_id': session_id,
            'duration': duration,
            'black_frames': blacks
        })
    except Exception as e:
        try: os.unlink(src)
        except: pass
        return jsonify({'error': str(e)}), 500


@app.route('/cut_all', methods=['POST'])
def cut_all():
    """Cut all segments in parallel from a single uploaded session."""
    data = request.get_json()
    session_id = data.get('session_id')
    segments   = data.get('segments', [])  # [{start, end, index}, ...]

    with _sessions_lock:
        session = _sessions.get(session_id)
    if not session:
        return jsonify({'error': 'Sesión no encontrada. Subí el video de nuevo.'}), 404

    src      = session['path']
    filename = session['filename']
    base     = os.path.splitext(filename)[0]
    results  = {}

    def cut_one(seg):
        out = tmp('.mp4')
        r = run([
            FFMPEG,
            '-ss', str(seg['start']),
            '-to', str(seg['end']),
            '-i', src,
            '-c', 'copy',
            '-avoid_negative_ts', 'make_zero',
            '-movflags', '+faststart',
            '-y', out
        ])
        if r.returncode != 0:
            return seg['index'], None, r.stderr[-400:]
        return seg['index'], out, None

    # Run all cuts in parallel (up to 4 workers)
    with ThreadPoolExecutor(max_workers=4) as ex:
        futures = {ex.submit(cut_one, seg): seg for seg in segments}
        for future in as_completed(futures):
            idx, out_path, err = future.result()
            results[str(idx)] = {'path': out_path, 'error': err}

    # Store cut results back in session
    with _sessions_lock:
        _sessions[session_id]['cuts'] = results

    # Return which cuts succeeded
    summary = {k: {'ok': v['path'] is not None, 'error': v['error']}
               for k, v in results.items()}
    return jsonify({'ok': True, 'results': summary})


@app.route('/download/<session_id>/<int:index>', methods=['GET'])
def download(session_id, index):
    """Download a specific cut segment."""
    with _sessions_lock:
        session = _sessions.get(session_id)
    if not session:
        return jsonify({'error': 'Sesión expirada'}), 404

    cuts = session.get('cuts', {})
    cut  = cuts.get(str(index))
    if not cut or not cut['path']:
        return jsonify({'error': cut['error'] if cut else 'No cortado aún'}), 404

    base     = os.path.splitext(session['filename'])[0]
    dl_name  = f"{base}_segmento_{index}.mp4"
    client   = session.get('clients', {}).get(str(index), '')
    if client:
        safe = re.sub(r'[^\w\s-]', '', client).strip().replace(' ', '_')
        dl_name = f"{safe}_segmento_{index}.mp4"

    return send_file(cut['path'], mimetype='video/mp4',
                     as_attachment=True, download_name=dl_name)


@app.route('/identify', methods=['POST'])
def identify():
    """Use Claude Vision to identify client name from a frame image."""
    if not ANTHROPIC_KEY:
        return jsonify({'client': '', 'error': 'No API key'}), 200

    data       = request.get_json()
    session_id = data.get('session_id')
    index      = str(data.get('index'))
    frame_b64  = data.get('frame')   # base64 JPEG from browser canvas

    if not frame_b64:
        return jsonify({'client': ''}), 200

    # Remove data URL prefix if present
    if ',' in frame_b64:
        frame_b64 = frame_b64.split(',')[1]

    try:
        import urllib.request
        req_body = json.dumps({
            'model': 'claude-opus-4-6',
            'max_tokens': 100,
            'messages': [{
                'role': 'user',
                'content': [
                    {
                        'type': 'image',
                        'source': {
                            'type': 'base64',
                            'media_type': 'image/jpeg',
                            'data': frame_b64
                        }
                    },
                    {
                        'type': 'text',
                        'text': (
                            'This is a frame from an advertising screen video. '
                            'What is the name of the advertiser/client/brand shown? '
                            'Reply with ONLY the brand or client name, nothing else. '
                            'If you cannot identify it clearly, reply with "Desconocido".'
                        )
                    }
                ]
            }]
        }).encode('utf-8')

        req = urllib.request.Request(
            'https://api.anthropic.com/v1/messages',
            data=req_body,
            headers={
                'Content-Type': 'application/json',
                'x-api-key': ANTHROPIC_KEY,
                'anthropic-version': '2023-06-01'
            },
            method='POST'
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            result = json.loads(resp.read())
        client = result['content'][0]['text'].strip()

        # Store in session
        with _sessions_lock:
            if session_id in _sessions:
                if 'clients' not in _sessions[session_id]:
                    _sessions[session_id]['clients'] = {}
                _sessions[session_id]['clients'][index] = client

        return jsonify({'client': client})

    except Exception as e:
        return jsonify({'client': '', 'error': str(e)}), 200


@app.route('/cleanup/<session_id>', methods=['DELETE'])
def cleanup(session_id):
    """Delete temp files for a session."""
    with _sessions_lock:
        session = _sessions.pop(session_id, None)
    if session:
        try: os.unlink(session['path'])
        except: pass
        for cut in session.get('cuts', {}).values():
            try: os.unlink(cut['path'])
            except: pass
    return jsonify({'ok': True})


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5050))
    print(f'CortaClip corriendo en http://localhost:{port}')
    app.run(host='0.0.0.0', port=port, debug=False)

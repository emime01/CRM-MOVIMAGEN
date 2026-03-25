import subprocess, os, json, re, tempfile, shutil, uuid, base64
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

ANTHROPIC_KEY = os.environ.get('ANTHROPIC_API_KEY', '')
FFMPEG  = shutil.which('ffmpeg')  or 'ffmpeg'
FFPROBE = shutil.which('ffprobe') or 'ffprobe'

# Use /tmp for all session files — persists within same worker
SESSION_DIR = os.path.join(tempfile.gettempdir(), 'cortaclip_sessions')
os.makedirs(SESSION_DIR, exist_ok=True)

def session_meta_path(sid):
    return os.path.join(SESSION_DIR, f'{sid}.json')

def session_video_path(sid, ext):
    return os.path.join(SESSION_DIR, f'{sid}_src{ext}')

def session_cut_path(sid, index):
    return os.path.join(SESSION_DIR, f'{sid}_cut_{index}.mp4')

def save_meta(sid, data):
    with open(session_meta_path(sid), 'w') as f:
        json.dump(data, f)

def load_meta(sid):
    p = session_meta_path(sid)
    if not os.path.exists(p):
        return None
    with open(p) as f:
        return json.load(f)

def run(cmd, timeout=300):
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)

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
    f = request.files.get('video')
    if not f:
        return jsonify({'error': 'No video'}), 400

    sid = str(uuid.uuid4())
    ext = os.path.splitext(secure_filename(f.filename))[1] or '.mp4'
    src = session_video_path(sid, ext)
    f.save(src)

    try:
        # Get duration
        pr = run([FFPROBE, '-v', 'quiet', '-print_format', 'json', '-show_format', src])
        duration = float(json.loads(pr.stdout)['format']['duration'])

        # Black frame detection — sensitive settings to catch fast black frames
        bd = run([FFMPEG, '-i', src,
                  '-vf', 'blackdetect=d=0.01:pix_th=0.08',
                  '-an', '-f', 'null', '-'], timeout=180)
        blacks = []
        for line in bd.stderr.split('\n'):
            m = re.search(r'black_start:([\d.]+)\s+black_end:([\d.]+)', line)
            if m:
                blacks.append({'start': float(m.group(1)), 'end': float(m.group(2))})

        # Save session metadata to disk
        save_meta(sid, {'filename': secure_filename(f.filename), 'ext': ext, 'duration': duration})

        return jsonify({'session_id': sid, 'duration': duration, 'black_frames': blacks})

    except Exception as e:
        try: os.unlink(src)
        except: pass
        return jsonify({'error': str(e)}), 500


@app.route('/cut_all', methods=['POST'])
def cut_all():
    data = request.get_json()
    sid  = data.get('session_id')
    segs = data.get('segments', [])

    meta = load_meta(sid)
    if not meta:
        return jsonify({'error': 'Sesión no encontrada. Subí el video de nuevo.'}), 404

    src = session_video_path(sid, meta['ext'])
    if not os.path.exists(src):
        return jsonify({'error': 'Archivo de video no encontrado. Subí el video de nuevo.'}), 404

    def cut_one(seg):
        out = session_cut_path(sid, seg['index'])
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
            return seg['index'], False, r.stderr[-400:]
        return seg['index'], os.path.exists(out) and os.path.getsize(out) > 0, None

    results = {}
    with ThreadPoolExecutor(max_workers=4) as ex:
        futures = {ex.submit(cut_one, seg): seg for seg in segs}
        for future in as_completed(futures):
            idx, ok, err = future.result()
            results[str(idx)] = {'ok': ok, 'error': err}

    return jsonify({'ok': True, 'results': results})


@app.route('/download/<sid>/<int:index>', methods=['GET'])
def download(sid, index):
    meta = load_meta(sid)
    if not meta:
        return jsonify({'error': 'Sesión expirada'}), 404

    cut = session_cut_path(sid, index)
    if not os.path.exists(cut) or os.path.getsize(cut) == 0:
        return jsonify({'error': 'Segmento no encontrado'}), 404

    base    = os.path.splitext(meta['filename'])[0]
    dl_name = f'{base}_segmento_{index}.mp4'

    # Check if client name was saved
    clients_path = os.path.join(SESSION_DIR, f'{sid}_clients.json')
    if os.path.exists(clients_path):
        with open(clients_path) as f:
            clients = json.load(f)
        client = clients.get(str(index), '')
        if client and client != 'Desconocido':
            safe = re.sub(r'[^\w\s-]', '', client).strip().replace(' ', '_')
            dl_name = f'{safe}_segmento_{index}.mp4'

    return send_file(cut, mimetype='video/mp4', as_attachment=True, download_name=dl_name)


@app.route('/identify', methods=['POST'])
def identify():
    if not ANTHROPIC_KEY:
        return jsonify({'client': ''}), 200

    data      = request.get_json()
    sid       = data.get('session_id')
    index     = str(data.get('index'))
    frame_b64 = data.get('frame', '')

    if not frame_b64:
        return jsonify({'client': ''}), 200
    if ',' in frame_b64:
        frame_b64 = frame_b64.split(',')[1]

    try:
        import urllib.request as urlreq
        body = json.dumps({
            'model': 'claude-sonnet-4-6',
            'max_tokens': 60,
            'messages': [{
                'role': 'user',
                'content': [
                    {'type': 'image', 'source': {'type': 'base64', 'media_type': 'image/jpeg', 'data': frame_b64}},
                    {'type': 'text', 'text': (
                        'This is a frame from an advertising video shown on a digital screen. '
                        'What is the brand or client name visible? '
                        'Reply with ONLY the brand name. If unclear, reply "Desconocido".'
                    )}
                ]
            }]
        }).encode()

        req = urlreq.Request(
            'https://api.anthropic.com/v1/messages', data=body,
            headers={'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY,
                     'anthropic-version': '2023-06-01'}, method='POST'
        )
        with urlreq.urlopen(req, timeout=15) as resp:
            result = json.loads(resp.read())
        client = result['content'][0]['text'].strip()

        # Save client name to disk
        if sid:
            clients_path = os.path.join(SESSION_DIR, f'{sid}_clients.json')
            clients = {}
            if os.path.exists(clients_path):
                with open(clients_path) as f:
                    clients = json.load(f)
            clients[index] = client
            with open(clients_path, 'w') as f:
                json.dump(clients, f)

        return jsonify({'client': client})

    except Exception as e:
        return jsonify({'client': '', 'error': str(e)}), 200


@app.route('/cleanup/<sid>', methods=['DELETE'])
def cleanup(sid):
    meta = load_meta(sid)
    if meta:
        # Delete all files for this session
        for f in os.listdir(SESSION_DIR):
            if f.startswith(sid):
                try: os.unlink(os.path.join(SESSION_DIR, f))
                except: pass
    return jsonify({'ok': True})


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5050))
    print(f'CortaClip corriendo en http://localhost:{port}')
    app.run(host='0.0.0.0', port=port, debug=False)

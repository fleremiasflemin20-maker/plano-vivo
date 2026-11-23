"""Loopback-only service. No credentials, external uploads or public binding."""

import json
import mimetypes
import re
import sqlite3
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal
from urllib.parse import urlparse
from uuid import uuid4

import cv2
import numpy as np
import pymupdf
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, model_validator
from starlette.concurrency import run_in_threadpool
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .analyzer import analyze
from .ifc_export import export_ifc

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / 'runtime'
RUNTIME.mkdir(exist_ok=True)
DB = RUNTIME / 'jobs.sqlite3'
pool = ThreadPoolExecutor(max_workers=1)
lock = threading.Lock()
active = {}
ocr_engine = None
ocr_attempted = False
ocr_lock = threading.Lock()
mimetypes.add_type('text/javascript', '.mjs')
mimetypes.add_type('text/javascript', '.js')


def connect():
    return sqlite3.connect(DB, timeout=15)


def init_db():
    with connect() as db:
        db.execute(
            'CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, created REAL, status TEXT, progress INTEGER, message TEXT, result TEXT)'
        )
        db.execute(
            "UPDATE jobs SET status='failed',message='El servicio se reinicio. Vuelve a analizar el archivo.' WHERE status IN ('queued','running')"
        )


@asynccontextmanager
async def lifespan(app):
    init_db()
    yield


app = FastAPI(title='Plano Vivo Local', version='2.1', lifespan=lifespan)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=['localhost', '127.0.0.1'])


@app.middleware('http')
async def local_origin(request: Request, call_next):
    origin = request.headers.get('origin')
    if origin and origin != str(request.base_url).rstrip('/'):
        return JSONResponse(
            {'detail': 'Origen no permitido. Abre la aplicacion local.'}, status_code=403
        )
    try:
        if int(request.headers.get('content-length', '0')) > 32 * 1024 * 1024:
            return JSONResponse({'detail': 'Archivo demasiado grande.'}, status_code=413)
    except ValueError:
        return JSONResponse({'detail': 'Longitud no valida.'}, status_code=400)
    response = await call_next(request)
    response.headers['X-Content-Type-Options'] = 'nosniff'
    return response


@app.get('/api/capabilities')
def capabilities():
    import importlib.util

    return {
        'python': True,
        'pdf_vector': True,
        'ocr': importlib.util.find_spec('rapidocr_onnxruntime') is not None,
        'ifc': True,
        'local_only': True,
    }


async def read_upload(file):
    data = await file.read(20 * 1024 * 1024 + 1)
    await file.close()
    if not data or len(data) > 20 * 1024 * 1024:
        raise HTTPException(413, 'Usa un archivo entre 1 byte y 20 MB.')
    return data


@app.post('/api/inspect')
async def inspect(file: UploadFile = File(...)):
    data = await read_upload(file)
    if not data.startswith(b'%PDF'):
        return {'pages': 1}
    try:
        with pymupdf.open(stream=data, filetype='pdf') as doc:
            if doc.needs_pass:
                raise ValueError('PDF protegido por contrasena.')
            return {'pages': len(doc)}
    except Exception as exc:
        raise HTTPException(422, str(exc))


@app.post('/api/ocr')
async def ocr_image(file: UploadFile = File(...), boxes: str | None = Form(None)):
    data = await read_upload(file)
    try:
        areas = None
        if boxes is not None:
            areas = json.loads(boxes)
            if not isinstance(areas, list) or not all(
                isinstance(b, list)
                and len(b) == 4
                and all(isinstance(v, (int, float)) and 0 <= v <= 1 for v in b)
                and b[0] < b[2]
                and b[1] < b[3]
                for b in areas
            ):
                raise ValueError('Áreas de texto no válidas.')
        texts = await run_in_threadpool(read_texts, data, areas)
    except (ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(422, str(exc))
    if texts is None:
        raise HTTPException(501, 'OCR no disponible: instala las dependencias de backend.')
    return {'texts': texts}


def update(job_id, status, percent, message, result=None):
    with connect() as db:
        db.execute(
            "UPDATE jobs SET status=?,progress=?,message=?,result=? WHERE id=? AND status!='cancelled'",
            (
                status,
                percent,
                message,
                json.dumps(result, ensure_ascii=False) if result else None,
                job_id,
            ),
        )


def get_ocr():
    """RapidOCR, loaded once on first use (None when it is not installed)."""
    global ocr_engine, ocr_attempted
    with ocr_lock:
        if not ocr_attempted:
            ocr_attempted = True
            try:
                from rapidocr_onnxruntime import RapidOCR

                ocr_engine = RapidOCR()
            except Exception:
                ocr_engine = None
    return ocr_engine


# Plan labels are Latin text, numbers and units; anything else is a misreading.
PLAN_TEXT = re.compile(r"[0-9A-Za-zÁÉÍÓÚÜÑáéíóúüñ .,:;'()/+\-²³°ºª&#%]+")


def read_texts(data, boxes=None):
    """
    Texts in an image. Without `boxes`, detect and read everything (boxes as fractions
    of the image size). With `boxes` (fractions [x0, y0, x1, y1], e.g. the text areas
    found by the browser recogniser), read each area on its own, enlarged: small room
    numbers that full-page detection misses can still be read.
    """
    image = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError('El archivo no es una imagen válida.')
    engine = get_ocr()
    if engine is None:
        return None
    h, w = image.shape[:2]
    if boxes is not None:
        texts = []
        for index, (x0, y0, x1, y1) in enumerate(boxes[:200]):
            pad = 2
            crop = image[
                max(0, int(y0 * h) - pad) : min(h, int(y1 * h) + pad + 1),
                max(0, int(x0 * w) - pad) : min(w, int(x1 * w) + pad + 1),
            ]
            if crop.shape[0] < 4 or crop.shape[1] < 4:
                continue
            k = 48 / crop.shape[0]
            crop = cv2.resize(crop, None, fx=k, fy=k, interpolation=cv2.INTER_CUBIC)
            crop = cv2.copyMakeBorder(crop, 16, 16, 16, 16, cv2.BORDER_REPLICATE)
            results, _ = engine(crop, use_det=False, use_cls=False, use_rec=True)
            if not results:
                continue
            text, score = str(results[0][0]).strip(), float(results[0][1])
            if score >= 0.5 and PLAN_TEXT.fullmatch(text):
                texts.append({'index': index, 'text': text[:150], 'score': round(score, 3)})
        return texts
    # Small web images: OCR needs letters a few tens of pixels high.
    factor = min(4.0, max(1.0, 1600 / max(h, w)))
    if factor > 1:
        image = cv2.resize(image, None, fx=factor, fy=factor, interpolation=cv2.INTER_CUBIC)
    results, _ = engine(image)
    texts = []
    for box, text, score in results or []:
        text = str(text).strip()
        if score < 0.6 or not PLAN_TEXT.fullmatch(text):
            continue
        points = np.array(box) / factor
        texts.append(
            {
                'text': text[:150],
                'box': [
                    float(points[:, 0].min() / w),
                    float(points[:, 1].min() / h),
                    float(points[:, 0].max() / w),
                    float(points[:, 1].max() / h),
                ],
                'score': round(float(score), 3),
            }
        )
    return texts[:400]


def run_job(job_id, data, page, width, height, thickness, cancelled):
    def progress(percent, message):
        if cancelled.is_set():
            raise InterruptedError('Analisis cancelado.')
        update(job_id, 'running', percent, message)

    try:
        result = analyze(data, page, width, height, thickness, progress, get_ocr())
        if not cancelled.is_set():
            update(job_id, 'succeeded', 100, 'Modelo listo.', result)
    except InterruptedError:
        pass
    except Exception as exc:
        update(job_id, 'failed', 0, str(exc)[:500])
    finally:
        with lock:
            active.pop(job_id, None)


@app.post('/api/jobs', status_code=202)
async def create_job(
    file: UploadFile = File(...),
    page: int = Form(1, ge=1, le=1000),
    width: float = Form(12, ge=1, le=300),
    height: float = Form(2.8, ge=2, le=12),
    thickness: float = Form(0.18, ge=0.05, le=1),
):
    data = await read_upload(file)
    with lock:
        if len(active) >= 3:
            raise HTTPException(429, 'Hay tres analisis en curso. Espera a que terminen.')
        job_id = str(uuid4())
        cancelled = threading.Event()
        active[job_id] = cancelled
    with connect() as db:
        db.execute(
            'INSERT INTO jobs VALUES (?,?,?,?,?,?)',
            (job_id, time.time(), 'queued', 0, 'En cola local.', None),
        )
        db.execute(
            "DELETE FROM jobs WHERE id IN (SELECT id FROM jobs WHERE status IN ('succeeded','failed','cancelled') ORDER BY created DESC LIMIT -1 OFFSET 20)"
        )
    pool.submit(run_job, job_id, data, page, width, height, thickness, cancelled)
    return {'id': job_id, 'status': 'queued'}


@app.get('/api/jobs/{job_id}')
def job(job_id: str):
    with connect() as db:
        row = db.execute(
            'SELECT status,progress,message,result FROM jobs WHERE id=?', (job_id,)
        ).fetchone()
    if not row:
        raise HTTPException(404, 'Analisis no encontrado.')
    return {
        'id': job_id,
        'status': row[0],
        'progress': row[1],
        'message': row[2],
        'result': json.loads(row[3]) if row[3] else None,
    }


@app.post('/api/jobs/{job_id}/cancel')
def cancel(job_id: str):
    with lock:
        if job_id in active:
            active[job_id].set()
    with connect() as db:
        db.execute(
            "UPDATE jobs SET status='cancelled',message='Cancelado.' WHERE id=? AND status IN ('queued','running')",
            (job_id,),
        )
    return {'status': 'cancelled'}


class Point(BaseModel):
    x: float = Field(ge=0, le=1, allow_inf_nan=False)
    y: float = Field(ge=0, le=1, allow_inf_nan=False)


class Wall(BaseModel):
    id: str = Field(default='', max_length=100)
    a: Point
    b: Point
    type: Literal['wall', 'door', 'window'] = 'wall'
    height: float | None = Field(default=None, ge=2, le=12, allow_inf_nan=False)
    thickness: float | None = Field(default=None, ge=0.05, le=1, allow_inf_nan=False)
    sill: float | None = Field(default=None, ge=0, le=10, allow_inf_nan=False)
    openHeight: float | None = Field(default=None, gt=0, le=10, allow_inf_nan=False)
    inferred: bool = False


class Project(BaseModel):
    name: str = Field(default='Plano Vivo', max_length=80)
    width: float = Field(ge=1, le=300, allow_inf_nan=False)
    ratio: float = Field(gt=0.02, lt=50, allow_inf_nan=False)
    height: float = Field(ge=2, le=12, allow_inf_nan=False)
    thickness: float = Field(ge=0.05, le=1, allow_inf_nan=False)
    walls: list[Wall] = Field(max_length=2000)


@app.post('/api/export/ifc')
def ifc(project: Project):
    return Response(
        export_ifc(project.model_dump(exclude_none=True)),
        media_type='application/x-step',
        headers={'Content-Disposition': 'attachment; filename="plano-vivo.ifc"'},
    )


@app.get('/', response_class=HTMLResponse)
def index():
    html = (ROOT / 'dist/index.html').read_text(encoding='utf-8')
    return html.replace('<head>', '<head><meta name="python-engine" content="local">')


app.mount('/', StaticFiles(directory=ROOT / 'dist', html=True), name='static')


if __name__ == '__main__':
    import uvicorn

    uvicorn.run('backend.server:app', host='127.0.0.1', port=8877)

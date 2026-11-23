import json
import tempfile
import time
import unittest
from pathlib import Path

import ifcopenshell
import ifcopenshell.geom
import numpy as np
import cv2
import pymupdf
from fastapi.testclient import TestClient

from backend.analyzer import analyze, clean_lines, point_distance
from backend.raster import extract_lines
from backend.ifc_export import export_ifc
from backend import server

ROOT = Path(__file__).resolve().parents[1]


class BackendTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.png = (ROOT / 'fixtures/plano-prueba.png').read_bytes()
        doc = pymupdf.open()
        page = doc.new_page(width=600, height=450)
        for a, b in [
            ((60, 50), (540, 50)),
            ((540, 50), (540, 400)),
            ((540, 400), (60, 400)),
            ((60, 400), (60, 50)),
            ((300, 50), (300, 200)),
            ((300, 245), (300, 400)),
        ]:
            page.draw_line(a, b, width=5, color=(0, 0, 0))
        page.insert_text((100, 150), 'SALA', fontsize=14)
        doc.new_page(width=600, height=450)
        cls.pdf = doc.tobytes()
        doc.close()
        fixture = ROOT / 'fixtures/plano-vector.pdf'
        if not fixture.exists():
            # PyMuPDF embeds a timestamp, so rewriting on every run would dirty the repo.
            fixture.write_bytes(cls.pdf)

    def test_raster(self):
        result = analyze(self.png)
        self.assertGreaterEqual(len(result['walls']), 6)
        self.assertLess(len(result['walls']), 30)
        self.assertTrue(any(w['type'] == 'door' for w in result['walls']))
        self.assertTrue(result['image'].startswith('data:image/png;base64,'))

    def test_vectors_and_text(self):
        result = analyze(self.pdf)
        self.assertEqual(result['analysis']['source'], 'pdf-vector')
        self.assertEqual(result['analysis']['pages'], 2)
        self.assertTrue(any(t['text'] == 'SALA' for t in result['analysis']['texts']))
        self.assertEqual(result['analysis']['wall_segments'], 6)
        self.assertRaises(ValueError, analyze, self.pdf, 3)

    def test_large_sheet_short_partitions_and_thin_annotations(self):
        image = np.full((2200, 3200), 255, np.uint8)
        # A long wall crosses several tiles; a real doorway must stay open.
        expected = [(100, 300, 1500, 300), (1600, 300, 3100, 300)]
        # Small partitions are shorter than the old global length threshold.
        expected += [(x, 300, x, 375) for x in range(200, 3000, 200)]
        for line in expected:
            cv2.line(image, line[:2], line[2:], 0, 7)
        cv2.line(image, (100, 200), (3100, 200), 0, 1)  # dimension line
        for x in range(300, 2800, 300):
            cv2.rectangle(image, (x, 600), (x + 90, 660), 0, 1)  # furniture
        raw, info = extract_lines(image)
        lines = clean_lines(raw, 3200, 2200)
        self.assertGreater(info['tiles'], 1)
        self.assertGreater(info['thin_candidates_removed'], 0)
        for line in expected:
            midpoint = (np.array(line[:2]) + np.array(line[2:])) / 2
            self.assertLess(min(point_distance(midpoint, l)[0] for l in lines), 6)
        self.assertGreater(min(point_distance(np.array([1550, 300]), l)[0] for l in lines), 30)
        self.assertFalse(any(abs(l[1] - 200) < 5 and abs(l[3] - 200) < 5 for l in lines))
        self.assertLess(len(lines), len(expected) + 5)  # no duplicates at tile seams

    def test_no_silent_350_segment_truncation(self):
        raw = [
            (20 + x * 45, 20 + y * 45, 45 + x * 45, 20 + y * 45)
            for y in range(20)
            for x in range(20)
        ]
        self.assertEqual(len(clean_lines(raw, 1000, 1000)), 400)

    def test_ifc_semantics_and_opening(self):
        project = {
            'name': 'Prueba',
            'width': 10,
            'ratio': 0.8,
            'height': 3,
            'thickness': 0.2,
            'walls': [
                {'id': 'door', 'a': {'x': 0.1, 'y': 0.5}, 'b': {'x': 0.2, 'y': 0.5}, 'type': 'door'}
            ],
        }
        model = ifcopenshell.file.from_string(export_ifc(project))
        self.assertEqual(len(model.by_type('IfcWall')), 1)
        self.assertEqual(len(model.by_type('IfcDoor')), 1)
        self.assertEqual(len(model.by_type('IfcRelVoidsElement')), 1)
        self.assertEqual(len(model.by_type('IfcRelFillsElement')), 1)
        shape = ifcopenshell.geom.create_shape(
            ifcopenshell.geom.settings(), model.by_type('IfcWall')[0]
        )
        self.assertGreater(len(shape.geometry.verts), 0)
        verts = np.array(shape.geometry.verts).reshape(-1, 3)
        self.assertAlmostEqual(verts[:, 2].min(), 2.1, places=4)
        self.assertAlmostEqual(verts[:, 2].max(), 3.0, places=4)

    def test_api_job_and_access(self):
        with tempfile.TemporaryDirectory(dir=ROOT / 'runtime') as folder:
            old_db = server.DB
            server.DB = Path(folder) / 'test.sqlite3'
            try:
                with TestClient(server.app, base_url='http://localhost') as client:
                    self.assertTrue(client.get('/api/capabilities').json()['python'])
                    self.assertIn('python-engine', client.get('/').text)
                    self.assertIn('javascript', client.get('/app.mjs').headers['content-type'])
                    self.assertEqual(
                        client.post(
                            '/api/jobs',
                            files={'file': ('test.png', self.png, 'image/png')},
                            headers={'Origin': 'https://example.com'},
                        ).status_code,
                        403,
                    )
                    self.assertEqual(
                        client.post(
                            '/api/inspect',
                            files={'file': ('test.pdf', self.pdf, 'application/pdf')},
                        ).json()['pages'],
                        2,
                    )
                    response = client.post(
                        '/api/jobs',
                        files={'file': ('test.pdf', self.pdf, 'application/pdf')},
                        data={'page': 1, 'width': 12, 'height': 2.8, 'thickness': 0.18},
                    )
                    self.assertEqual(response.status_code, 202, response.text)
                    job_id = response.json()['id']
                    end = time.monotonic() + 50
                    while time.monotonic() < end:
                        state = client.get('/api/jobs/' + job_id).json()
                        if state['status'] in ('succeeded', 'failed'):
                            break
                        time.sleep(0.2)
                    self.assertEqual(state['status'], 'succeeded', state)
                    result = state['result']
                    result.pop('image', None)
                    exported = client.post('/api/export/ifc', json=result)
                    self.assertEqual(exported.status_code, 200, exported.text[:500])
                    self.assertTrue(exported.text.startswith('ISO-10303-21;'))
                    self.assertEqual(
                        client.post('/api/export/ifc', json={'width': -1}).status_code, 422
                    )
            finally:
                server.DB = old_db


if __name__ == '__main__':
    unittest.main()

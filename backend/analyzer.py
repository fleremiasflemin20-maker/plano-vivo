"""Geometric reconstruction, with explicit uncertainty and source coordinates."""
import base64
import math
from statistics import median
from uuid import uuid4

import cv2
import numpy as np
import pymupdf


def point_distance(p, line):
    a, b = line[:2], line[2:4]
    delta = b - a
    den = float(delta @ delta)
    t = float(np.clip((p-a) @ delta / den, 0, 1)) if den else 0
    return float(np.linalg.norm(p-a-t*delta)), t


def clean_lines(raw, width, height):
    minimum = max(18, min(width, height)*.035)
    lines = [np.array(l[:4], dtype=float) for l in raw if np.linalg.norm(np.array(l[2:4])-np.array(l[:2])) >= minimum]
    lines.sort(key=lambda l: -np.linalg.norm(l[2:]-l[:2]))
    result = []
    tolerance = max(3, min(14, width*.012))
    for line in lines[:5000]:
        delta = line[2:]-line[:2]
        norm = np.linalg.norm(delta)
        duplicate = False
        for existing in result:
            direction = existing[2:]-existing[:2]
            dot = abs(float(delta @ direction)/(norm*np.linalg.norm(direction)))
            if dot < .985:
                continue
            if max(point_distance(line[:2], existing)[0], point_distance(line[2:], existing)[0]) < tolerance:
                duplicate = True
                break
        if not duplicate:
            result.append(line)
        if len(result) >= 350:
            break
    # Snap close endpoint-to-endpoint and endpoint-to-line junctions.
    for i, line in enumerate(result):
        for offset in (0, 2):
            p = line[offset:offset+2].copy()
            best, target = 7., None
            for j, other in enumerate(result):
                if i == j:
                    continue
                distance, t = point_distance(p, other)
                if distance < best:
                    best, target = distance, other[:2]+t*(other[2:]-other[:2])
            if target is not None:
                line[offset:offset+2] = target
    return result


def decode(data, page_number):
    vectors, texts, pages = [], [], 1
    if data.startswith(b'%PDF'):
        doc = pymupdf.open(stream=data, filetype='pdf')
        if doc.needs_pass:
            raise ValueError('El PDF está protegido por contraseña.')
        pages = len(doc)
        if not 1 <= page_number <= pages:
            raise ValueError(f'El PDF tiene {pages} páginas.')
        page = doc[page_number-1]
        scale = min(2.5, 1600/max(page.rect.width, page.rect.height))
        pix = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), alpha=False)
        rgb = np.frombuffer(pix.samples, np.uint8).reshape(pix.height, pix.width, pix.n)
        image = cv2.cvtColor(rgb[:, :, :3], cv2.COLOR_RGB2BGR)
        rotation = page.rotation_matrix
        def xy(p):
            q = pymupdf.Point(p)*rotation
            return q.x*scale, q.y*scale
        for path in page.get_drawings():
            color = path.get('color') or path.get('fill')
            if color and sum(color)/len(color) > .8:
                continue
            for item in path['items']:
                if item[0] == 'l':
                    vectors.append((*xy(item[1]), *xy(item[2])))
                elif item[0] == 're':
                    rect = item[1]
                    for p, q in ((rect.tl,rect.tr),(rect.tr,rect.br),(rect.br,rect.bl),(rect.bl,rect.tl)):
                        vectors.append((*xy(p), *xy(q)))
        for word in page.get_text('words'):
            box = pymupdf.Rect(word[:4])*rotation
            texts.append({'text':word[4][:150], 'box':[v*scale for v in box], 'source':'pdf'})
        doc.close()
        return image, vectors, texts, pages, 'pdf-vector' if len(vectors)>=4 else 'pdf-raster'
    image = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError('El archivo no es una imagen o un PDF válido.')
    if image.shape[0]*image.shape[1] > 60_000_000:
        raise ValueError('La imagen es demasiado grande. Reduce su resolución.')
    factor = min(1, 1600/max(image.shape[:2]))
    if factor < 1:
        image = cv2.resize(image, None, fx=factor, fy=factor, interpolation=cv2.INTER_AREA)
    return image, vectors, texts, pages, 'image'


def analyze(data, page_number=1, world_width=12., height=2.8, thickness=.18, progress=lambda *_:None, ocr=None):
    progress(8,'Leyendo el archivo original…')
    image, vectors, texts, pages, source = decode(data, page_number)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    angle = 0.
    if not vectors:
        coarse = cv2.HoughLinesP(cv2.Canny(gray, 60, 160), 1, np.pi/180, 65, minLineLength=min(gray.shape)*.15, maxLineGap=5)
        if coarse is not None:
            angles = []
            for x1,y1,x2,y2 in coarse.reshape(-1,4):
                a = math.degrees(math.atan2(y2-y1,x2-x1))
                a = (a+45)%90-45
                if abs(a)<=12:
                    angles.append(a)
            angle = median(angles) if angles else 0.
            if abs(angle)>.4:
                h,w = gray.shape
                matrix = cv2.getRotationMatrix2D((w/2,h/2),angle,1)
                image = cv2.warpAffine(image,matrix,(w,h),borderValue=(255,255,255))
                gray = cv2.cvtColor(image,cv2.COLOR_BGR2GRAY)
    h,w = gray.shape
    progress(25,'Separando textos y trazos…')
    if not texts and ocr is not None:
        try:
            results,_ = ocr(image)
            for box,text,score in results or []:
                if score>.65:
                    points=np.array(box)
                    texts.append({'text':str(text)[:150], 'box':[float(points[:,0].min()),float(points[:,1].min()),float(points[:,0].max()),float(points[:,1].max())], 'source':'ocr','score':float(score)})
        except Exception:
            pass
    clean = gray.copy()
    for word in texts:
        x1,y1,x2,y2=[int(v) for v in word['box']]
        if (x2-x1)*(y2-y1)<w*h*.02:
            cv2.rectangle(clean,(max(0,x1-1),max(0,y1-1)),(min(w-1,x2+1),min(h-1,y2+1)),255,-1)
    progress(45,'Extrayendo geometría del plano…')
    if vectors:
        raw = vectors
    else:
        # Local contrast correction handles mild illumination gradients.
        blur = cv2.GaussianBlur(clean,(0,0),18)
        normalized = cv2.divide(clean,blur,scale=255)
        edges=cv2.Canny(normalized,55,155)
        found=cv2.HoughLinesP(edges,1,np.pi/360,35,minLineLength=max(25,min(w,h)*.045),maxLineGap=4)
        raw=found.reshape(-1,4).tolist() if found is not None else []
    lines=clean_lines(raw,w,h)
    if not lines:
        raise ValueError('No se encontraron paredes claras. Usa una imagen frontal y nítida o dibuja sobre el plano.')
    progress(65,'Uniendo paredes y proponiendo aberturas…')
    walls=[]
    def element(line,kind):
        return {'id':str(uuid4()),'a':{'x':float(np.clip(line[0]/w,0,1)),'y':float(np.clip(line[1]/h,0,1))},'b':{'x':float(np.clip(line[2]/w,0,1)),'y':float(np.clip(line[3]/h,0,1))},'type':kind,'inferred':True,'source':source}
    for line in lines:
        walls.append(element(line,'wall'))
    openings=[]
    for i,a in enumerate(lines):
        direction=a[2:]-a[:2]
        norm=np.linalg.norm(direction)
        for j in range(i+1,len(lines)):
            b=lines[j]
            perpendicular=lambda p:abs(float((p[0]-a[0])*direction[1]-(p[1]-a[1])*direction[0]))/norm
            if max(perpendicular(b[:2]),perpendicular(b[2:]))>7:
                continue
            pairs=[(np.linalg.norm(p-q),p,q) for p in (a[:2],a[2:]) for q in (b[:2],b[2:])]
            distance,p,q=min(pairs,key=lambda item:item[0])
            if not .55<=distance/w*world_width<=1.6:
                continue
            mid=(p+q)/2
            if any(k not in (i,j) and point_distance(mid,line)[0]<5 for k,line in enumerate(lines)) or any(point_distance(mid,line)[0]<8 for line in openings):
                continue
            line=np.concatenate([p,q]);openings.append(line)
            samples=[gray[int(np.clip(p[1]+t*(q[1]-p[1]),0,h-1)),int(np.clip(p[0]+t*(q[0]-p[0]),0,w-1))]<130 for t in np.linspace(.15,.85,15)]
            walls.append(element(line,'window' if sum(samples)>10 else 'door'))
    progress(85,'Comprobando la superposición…')
    original=(gray<145).astype(np.uint8)
    predicted=np.zeros_like(gray)
    for line in lines:
        cv2.line(predicted,tuple(np.round(line[:2]).astype(int)),tuple(np.round(line[2:]).astype(int)),255,max(2,round(thickness/world_width*w)))
    nearby=cv2.dilate(original,np.ones((7,7),np.uint8))
    count=np.count_nonzero(predicted)
    support=float(np.count_nonzero((predicted>0)&(nearby>0))/count) if count else 0.
    ok,png=cv2.imencode('.png',image)
    if not ok:
        raise ValueError('No se pudo preparar la imagen de referencia.')
    notes=[f'Motor Python: {len(lines)} segmentos y {len(openings)} aberturas propuestas.',f'Coincidencia visual de trazos: {support:.0%}; no es una medida de exactitud arquitectónica.','Escala, alturas y espesores deben confirmarse. Los muebles e instalaciones no se reconstruyen automáticamente.']
    if abs(angle)>.4:
        notes.append(f'Rotación corregida: {angle:.1f}°. No se corrigió perspectiva.')
    return {'version':2,'width':world_width,'ratio':h/w,'height':height,'thickness':thickness,'material':'#e5e7df','floorColor':'#cfb792','walls':walls,'image':'data:image/png;base64,'+base64.b64encode(png).decode(),'report':' '.join(notes),'analysis':{'source':source,'page':page_number,'pages':pages,'texts':texts[:400],'rotation':angle,'line_support':support,'wall_segments':len(lines),'openings':len(openings)}}

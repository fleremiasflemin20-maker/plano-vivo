# Plano Vivo

Editor de planos 2D con reconstrucción 3D, recorrido y motor Python local.

**Web:** https://fleremiasflemin20-maker.github.io/plano-vivo/

**Versión original conservada:** https://fleremiasflemin20-maker.github.io/plano-vivo/classic/

## Dos formas de usarlo

### En GitHub Pages

Abre la web, sube una imagen o un PDF y pulsa **Construir en 3D**. La interpretación geométrica se ejecuta en el navegador. También puedes dibujar desde cero y ver el modelo mientras editas. GitHub Pages no ejecuta el servidor Python.

### En tu computador, con Python

Requiere Python 3.10 o superior. En Windows:

```powershell
git clone https://github.com/fleremiasflemin20-maker/plano-vivo.git
cd plano-vivo
.\setup-local.ps1
```

Abre **http://127.0.0.1:8877/**. Para volver a iniciarlo, ejecuta `start-local.ps1`. El servicio escucha solo en este computador y no transmite los planos a servicios externos. La interfaz identifica esta modalidad con la etiqueta «Motor Python».

Instalación manual, también aplicable a Linux/macOS:

```bash
python -m venv .venv
# Activa el entorno de acuerdo con tu sistema operativo.
python -m pip install -r backend/requirements.txt
python -m backend.server
```

## Funciones implementadas

- Paredes con dos puntos y recintos rectangulares.
- Selección, movimiento de extremos y edición de longitud, ángulo, altura y espesor.
- Ajuste a cuadrícula y esquinas, ortogonalidad y longitud fija.
- Puertas y ventanas con dimensiones editables.
- Cotas, medición y áreas aproximadas de recintos cerrados.
- Longitudes, áreas netas de muros y volúmenes geométricos preliminares.
- Deshacer/rehacer, autoguardado IndexedDB y cinco versiones locales recuperables.
- Importación de los proyectos JSON de la primera versión.
- Detección de líneas y propuestas de aberturas desde imágenes, en un trabajador separado.
- Vista dual, materiales básicos, iluminación y recorrido con colisiones.
- Exportación DXF, SVG, GLB, CSV y PNG.
- Motor local FastAPI/OpenCV: lectura de vectores PDF, selección de página, limpieza de imagen, corrección de inclinación y OCR con RapidOCR.
- Cola local de análisis, progreso, cancelación y resultados persistidos en SQLite.
- Exportación IFC4 local con muros, aberturas, puertas, ventanas y relaciones de huecos/rellenos.

## Precisión y alcance

Es un prototipo de diseño conceptual. La reconstrucción automática propone geometría; no garantiza interpretar cualquier plano ni reconoce automáticamente mobiliario, instalaciones o todos los símbolos. Los elementos inferidos se resaltan para revisión. Las cotas, alturas y espesores dependen de los valores confirmados por el usuario.

Las áreas de recintos se aproximan mediante una cuadrícula. Los volúmenes suman segmentos y pueden contar dos veces las intersecciones. No incluye diseño estructural ni comprobación normativa. La coincidencia visual que informa Python mide apoyo de trazos sobre la imagen, no exactitud arquitectónica.

La modalidad web procesa la primera página de un PDF como imagen. La modalidad Python permite elegir la página y extrae sus vectores cuando existen. La corrección de fotografías contempla inclinaciones pequeñas, no una rectificación completa de perspectiva.

Los modelos JSON y las versiones del navegador son locales. Descarga una copia para conservarla fuera del almacenamiento del navegador. El servidor conserva hasta veinte resultados terminados en `runtime/jobs.sqlite3`; esa carpeta no se sube a GitHub.

## Comprobaciones

```bash
node test.mjs
python -m unittest backend.test_backend -v
```

Las pruebas verifican áreas y cantidades con aberturas, proyectos antiguos, exportación DXF, detección de un plano sintético e imagen vacía, lectura de vectores y textos PDF, API de trabajos, restricción de origen y geometría/relaciones IFC. Se verificaron además en navegador dibujo rectangular, deshacer/rehacer, construcción PNG/PDF, edición por medidas, recorrido y descarga GLB/IFC.

Los archivos de `fixtures/` son planos sintéticos generados para pruebas, no planos personales.

## Publicación

`.github/workflows/pages.yml` verifica JavaScript y publica `dist/` con GitHub Actions al actualizar `main`. El servidor y sus dependencias no se incluyen en el sitio estático.

## Hoja de ruta pendiente

- Reconocimiento semántico de mobiliario, instalaciones y símbolos, con un banco de planos reales etiquetados.
- Aceptación y comparación de detecciones por partes sin reemplazar correcciones.
- Varias plantas, escaleras, desniveles y alineación entre pisos.
- Recorridos automáticos con puntos de interés.
- Biblioteca de muebles e iluminación configurable.
- Edición en lenguaje natural con previsualización.
- Ampliación del IFC a espacios, losas y edificios de varios niveles.

## Dependencias

Three.js y PDF.js están incluidos en `dist/vendor/`, con sus licencias. Las dependencias Python se instalan desde `backend/requirements.txt`. PyMuPDF utiliza licencia AGPL/comercial; IfcOpenShell LGPL. Consulta las licencias originales antes de redistribuir una variante con condiciones diferentes.

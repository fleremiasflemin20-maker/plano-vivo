# Plantea 3D

Editor de planos 2D con reconstrucción 3D, recorrido y motor Python local.

**Web:** https://plantea-3d.fleremiasflemin.workers.dev (Cloudflare) · copia en https://fleremiasflemin20-maker.github.io/plano-vivo/

**Video de presentación (2 min 54 s, con música):** botón «▶ Ver cómo funciona» en la web, o [`dist/media/plantea-3d-presentacion.mp4`](dist/media/plantea-3d-presentacion.mp4).

**Sugerencias:** botón «Sugerencias» en la web, sin cuenta. Plan de lanzamiento y cómo leerlas: [`docs/lanzamiento.md`](docs/lanzamiento.md).

**Versión original conservada:** https://fleremiasflemin20-maker.github.io/plano-vivo/classic/

## Dos formas de usarlo

### En GitHub Pages

Abre la web, sube una imagen o un PDF y pulsa **Construir en 3D**. La interpretación geométrica se ejecuta en el navegador. También puedes dibujar desde cero y ver el modelo mientras editas. GitHub Pages no ejecuta el servidor Python.

### En tu computador, con Python

Requiere Python 3.10 o superior. En Windows:

```powershell
git clone https://github.com/fleremiasflemin20-maker/plano-vivo.git
cd plantea-3d
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
- Reconocimiento de planos arquitectónicos desde imágenes, en un trabajador separado: muros y tabiques con su grosor real (también en diagonal, con sus puertas y ventanas), puertas con su lado de giro, ventanas y ventanales, pasos, escaleras y terrazas, muebles, textos, escala leída de la barra gráfica (o estimada por el ancho de las puertas) y recintos cerrados.
- Escaleras, terrazas, muebles y textos como elementos de planta: se dibujan en 2D, se construyen en 3D (peldaños hasta la altura de planta, tarima, cama con cabecero, sofá con respaldo, mesa con patas, encimera, bloques para el resto; los textos sobre el piso) y se exportan en DXF (capas ESCALERAS, TERRAZAS, MUEBLES y TEXTOS).
- Vista dual, materiales básicos, iluminación y recorrido con colisiones.
- Exportación DXF, SVG, GLB, CSV y PNG.
- Motor local FastAPI/OpenCV: lectura de vectores PDF, selección de página, limpieza de imagen, corrección de inclinación y OCR con RapidOCR.
- Cola local de análisis, progreso, cancelación y resultados persistidos en SQLite.
- Exportación IFC4 local con muros, aberturas, puertas, ventanas y relaciones de huecos/rellenos.

## Precisión y alcance

### Cómo se reconoce un plano

`dist/recognize/` analiza la imagen sin servicios externos:

1. **Preparación.** Las imágenes pequeñas se amplían (las de internet suelen medir menos de 500 px) y las grandes se reducen conservando el píxel más oscuro. Se separa la tinta del papel y de los rellenos de piso.
2. **Grosores de trazo.** La transformada de distancia mide el grosor de cada trazo. Los muros son el grosor que concentra más tinta; muebles, textos, rayados y vidrios son el trazo fino.
3. **Muros.** Una apertura morfológica conserva los trazos gruesos; las bandas horizontales y verticales resultantes dan cada muro con su grosor. Los planos de líneas usan las líneas dobles.
4. **Líneas finas.** El *black-hat* (contraste local) detecta líneas tenues aunque estén sobre un piso gris.
5. **Aberturas.** Cada hueco entre muros alineados, o entre el extremo de un muro y otro muro, se clasifica: líneas dentro = ventana; arco u hoja = puerta, con su bisagra y lado de giro; vacío = paso, o ventanal si es ancho.
6. **Uniones.** Los extremos se ajustan a los muros perpendiculares para cerrar esquinas y recintos.
7. **Muros en diagonal.** El tensor de estructura mide la orientación local de los trazos gruesos; los que van en ángulo se separan antes de buscar los muros rectos (si no, saldrían como una escalera de trozos cortos). Cada trazo recto y del grosor de un muro se convierte en muro con su dirección y grosor, se une a los muros que toca y, si hay un hueco entre dos tramos alineados, en puerta o ventana.
8. **Escaleras y terrazas.** Series regulares de líneas paralelas: peldaños si el paso es de alrededor de un grosor de muro (≈ 0,28 m), pavimento si es mayor o forma una rejilla. Se buscan en un trazo más tenue que el resto (las huellas suelen dibujarse muy claras, y ampliar una imagen pequeña las difumina) y se admite una huella perdida en la serie.
9. **Muebles y textos.** Los trazos finos que quedan se agrupan. Los grupos pequeños, de alrededor de un grosor de muro de alto, son textos (números de recinto, rótulos). Los contornos con medidas de mueble se clasifican por tamaño en metros: cama, sofá, mesa, encimera, bañera o mueble pequeño, y se descartan los que van de pared a pared (baldosas). Los textos se colocan en 3D como la imagen de su zona del plano; con el motor Python se leen con OCR (RapidOCR) y se escriben como texto.
10. **Escala.** La barra gráfica se reconoce por la proporción entre sus divisiones (por ejemplo 0 – 1 – 2,5 – 5 m) sin leer los números; si no hay barra, se usa el ancho de al menos dos puertas. En ambos casos el grosor de muro resultante debe ser físicamente razonable.

Los muebles se clasifican solo por su tamaño y su forma; un mueble poco habitual sale como «Mueble» genérico. Los muros curvos no se reconocen, y los planos de líneas dobles (sin muros rellenos) todavía no reconocen muros en diagonal, muebles ni textos.

Si la imagen no parece un plano arquitectónico (un croquis a mano, por ejemplo), se usa el detector de líneas anterior. Con el motor Python, los PDF siguen usando la lectura de vectores; las imágenes usan este reconocimiento.

El análisis de imágenes conserva hasta 4096 píxeles en el lado mayor. Los planos grandes se procesan por zonas solapadas y los segmentos se unen en las coordenadas de la lámina, manteniendo los huecos entre muros. Esto se aplica tanto al navegador como al motor local. Python centra los trazos de muros rellenos y filtra trazos finos cuando existe suficiente geometría gruesa; este filtro es heurístico y puede omitir elementos finos en dibujos de estilos mezclados. No equivale a reconocer semánticamente cada símbolo.

Las pruebas de regresión incluyen una lámina sintética de 3200 × 2200 con tabiques cortos, cotas y mobiliario fino, un plano de navegador de 1800 × 1350 y 400 segmentos sin truncamiento silencioso. No constituyen una evaluación de precisión sobre planos profesionales reales.

Es un prototipo de diseño conceptual. La reconstrucción automática propone geometría; no garantiza interpretar cualquier plano ni reconoce automáticamente mobiliario, instalaciones o todos los símbolos. Los elementos inferidos se resaltan para revisión. Las cotas, alturas y espesores dependen de los valores confirmados por el usuario.

Las áreas de recintos se aproximan mediante una cuadrícula. Los volúmenes suman segmentos y pueden contar dos veces las intersecciones. No incluye diseño estructural ni comprobación normativa. La coincidencia visual que informa Python mide apoyo de trazos sobre la imagen, no exactitud arquitectónica.

La modalidad web procesa la primera página de un PDF como imagen. La modalidad Python permite elegir la página y extrae sus vectores cuando existen. La corrección de fotografías contempla inclinaciones pequeñas, no una rectificación completa de perspectiva.

Los modelos JSON y las versiones del navegador son locales. Descarga una copia para conservarla fuera del almacenamiento del navegador. El servidor conserva hasta veinte resultados terminados en `runtime/jobs.sqlite3`; esa carpeta no se sube a GitHub.

## Comprobaciones

```bash
node test.mjs
python -m unittest backend.test_backend -v
```

Las pruebas del reconocedor usan dos láminas sintéticas con la respuesta conocida, cada una a dos resoluciones: una planta con escalera de trazo tenue, terraza, cama, mesa y rótulo, y otra con un chaflán a 45° con puerta y un tabique a 30°. Las del motor Python incluyen la lectura OCR de una imagen pequeña, completa y por zonas.

Las pruebas verifican áreas y cantidades con aberturas, proyectos antiguos, exportación DXF, detección de un plano sintético e imagen vacía, lectura de vectores y textos PDF, API de trabajos, restricción de origen y geometría/relaciones IFC. Se verificaron además en navegador dibujo rectangular, deshacer/rehacer, construcción PNG/PDF, edición por medidas, recorrido y descarga GLB/IFC.

Los archivos de `fixtures/` son planos sintéticos generados para pruebas, no planos personales.

## Estructura del código

`dist/` es a la vez el código fuente y lo que se publica; no hay paso de compilación.

- `dist/app.mjs`: punto de entrada; conecta los módulos y recupera el último proyecto.
- `dist/ui/core.mjs`: estado compartido, utilidades del DOM, historial y autoguardado.
- `dist/ui/plan.mjs`: lienzo 2D, herramientas de dibujo, inspector y calibración de escala.
- `dist/ui/model.mjs`: recálculo de recintos y cantidades, modelo 3D, restauración y ejemplo.
- `dist/ui/build.mjs`: importación de imágenes/PDF y reconstrucción (navegador o Python).
- `dist/ui/files.mjs`: guardar/abrir proyectos, versiones locales y exportaciones.
- `dist/ui/feedback.mjs`: formulario de sugerencias y video de presentación.
- `worker/index.js`: Worker de Cloudflare (sitio y buzón de sugerencias).
- `dist/recognize/`: reconocimiento de planos (`raster.mjs` operaciones de imagen, `walls.mjs` muros rectos y en diagonal, `openings.mjs` aberturas, `features.mjs` escaleras y terrazas, `objects.mjs` muebles y textos, `scale.mjs` escala, `index.mjs` orquestación).
- `dist/geometry.mjs`, `dist/detect.mjs`, `dist/viewer.mjs`, `dist/storage.mjs`: geometría, detector de líneas (respaldo), visor Three.js e IndexedDB.
- `backend/`: motor local FastAPI (`server.py`), análisis OpenCV/PDF (`analyzer.py`, `raster.py`) e IFC (`ifc_export.py`).

El formato se comprueba en cada pull request. Antes de subir cambios:

```bash
npx prettier@3.9.10 --write "dist/**/*.{mjs,js,css,html}" "worker/*.js" test.mjs test-recognize.mjs test-worker.mjs
python -m pip install ruff==0.17.6 && ruff format backend preview.py
```

## Publicación

`.github/workflows/pages.yml` comprueba el formato y ejecuta las pruebas de JavaScript y de Python en cada pull request y en `main`; solo publica `dist/` en GitHub Pages cuando todas pasan y el cambio llega a `main`. El servidor y sus dependencias no se incluyen en el sitio estático.

### Cloudflare

`wrangler.jsonc` publica `dist/` como archivos estáticos de un Worker, más el buzón de sugerencias (`worker/index.js`, `POST /api/sugerencias`), que guarda en la base D1 `plano-vivo-sugerencias` (esquema en `migrations/`) con un límite de cinco envíos por minuto por visitante. No guarda direcciones IP ni usa cookies. Después de fusionar en `main`:

```powershell
npx wrangler deploy
```

### Video

`tools/video/` regenera el video de presentación: guion por escenas (`guion.json`), narración con voz sintética, música de fondo original generada por código (`musica.py`, sin derechos de terceros), grabación automática de la web con Playwright y montaje con ffmpeg (la música baja sola cuando habla la voz). Instrucciones en `tools/video/montar.py`.

## Hoja de ruta pendiente

- Reconocimiento de mobiliario por su símbolo (no solo por tamaño), instalaciones y símbolos, con un banco de planos reales etiquetados.
- Lectura de textos (OCR) también en la versión web, sin el motor Python.
- Aceptación y comparación de detecciones por partes sin reemplazar correcciones.
- Varias plantas, escaleras, desniveles y alineación entre pisos.
- Recorridos automáticos con puntos de interés.
- Biblioteca de muebles e iluminación configurable.
- Edición en lenguaje natural con previsualización.
- Ampliación del IFC a espacios, losas y edificios de varios niveles.

## Dependencias

Three.js y PDF.js están incluidos en `dist/vendor/`, con sus licencias. Las dependencias Python se instalan desde `backend/requirements.txt`. PyMuPDF utiliza licencia AGPL/comercial; IfcOpenShell LGPL. Consulta las licencias originales antes de redistribuir una variante con condiciones diferentes.

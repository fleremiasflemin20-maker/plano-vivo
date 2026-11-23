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
- Reconocimiento de planos arquitectónicos desde imágenes, en un trabajador separado: muros y tabiques con su grosor real, puertas con su lado de giro, ventanas y ventanales, pasos, escaleras y terrazas, escala leída de la barra gráfica (o estimada por el ancho de las puertas) y recintos cerrados.
- Escaleras y terrazas como elementos de planta: se dibujan en 2D, se construyen en 3D (peldaños hasta la altura de planta, tarima) y se exportan en DXF.
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
7. **Escaleras y terrazas.** Series regulares de líneas paralelas: peldaños si el paso es de alrededor de un grosor de muro (≈ 0,28 m), pavimento si es mayor o forma una rejilla.
8. **Escala.** La barra gráfica se reconoce por la proporción entre sus divisiones (por ejemplo 0 – 1 – 2,5 – 5 m) sin leer los números; si no hay barra, se usa el ancho de al menos dos puertas. En ambos casos el grosor de muro resultante debe ser físicamente razonable.

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
- `dist/recognize/`: reconocimiento de planos (`raster.mjs` operaciones de imagen, `walls.mjs` muros, `openings.mjs` aberturas, `features.mjs` escaleras y terrazas, `scale.mjs` escala, `index.mjs` orquestación).
- `dist/geometry.mjs`, `dist/detect.mjs`, `dist/viewer.mjs`, `dist/storage.mjs`: geometría, detector de líneas (respaldo), visor Three.js e IndexedDB.
- `backend/`: motor local FastAPI (`server.py`), análisis OpenCV/PDF (`analyzer.py`, `raster.py`) e IFC (`ifc_export.py`).

El formato se comprueba en cada pull request. Antes de subir cambios:

```bash
npx prettier@3.9.10 --write "dist/**/*.{mjs,js,css,html}" test.mjs test-recognize.mjs
python -m pip install ruff==0.17.6 && ruff format backend preview.py
```

## Publicación

`.github/workflows/pages.yml` comprueba el formato y ejecuta las pruebas de JavaScript y de Python en cada pull request y en `main`; solo publica `dist/` cuando todas pasan y el cambio llega a `main`. El servidor y sus dependencias no se incluyen en el sitio estático.

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

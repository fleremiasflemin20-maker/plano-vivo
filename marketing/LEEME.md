# Material de marketing · Plano Vivo

Esta carpeta se guarda en GitHub, salvo las grabaciones crudas (`fuentes/*-tmp/`) y el plano de internet del video 6, cuya licencia falta confirmar. Las imágenes usan nuestros propios planos de prueba y capturas reales de la app, así que no hay problema de derechos de terceros.

## Qué hay

| Carpeta | Contenido | Formato |
| --- | --- | --- |
| `video/` | Video de presentación con todas las funciones (2 min 54 s, con música) y subtítulos `.srt` | 1280 × 720 |
| `reels/` | 3 reels narrados, de 22 a 27 s, con subtítulos `.srt` | 1080 × 1920 |
| `publicaciones/` | 7 publicaciones para el feed | 1080 × 1080 |
| `historias/` | 3 historias | 1080 × 1920 |
| `portadas/` | LinkedIn, Facebook, vista previa de enlaces y miniatura del video | según la red |
| `laminas/` | 4 láminas A3 (PNG de alta resolución, unos 290 ppp, y PDF) y el dossier completo `dossier-plano-vivo.pdf` | A3 horizontal |
| `capturas/` | Capturas y renders en alta resolución para nuevas piezas | hasta 3200 × 2000 |
| `fuentes/` | Scripts que regeneran todo (ver al final) | |

## Textos para publicar

### Reel 1 · De plano a 3D (`reel-01-de-plano-a-3d.mp4`)

> ¿Tienes el plano de tu casa? 🏠 Súbelo a Plano Vivo y míralo en 3D en segundos: muros, puertas, ventanas, escaleras y muebles, con medidas reales. Gratis y en tu navegador. 🔗 Enlace en el perfil.
>
> #arquitectura #planos #3D #diseñodeinteriores #construcción #casa #arquitecturaecuador

### Reel 2 · Recorre tu casa (`reel-02-recorre-tu-casa.mp4`)

> ¿Y si pudieras caminar por tu casa antes de construirla? 👣 Con Plano Vivo conviertes el plano en 3D, lo recorres por dentro y pruebas acabados para paredes y pisos. Gratis, sin instalar nada. 🔗 Enlace en el perfil.
>
> #arquitectura #render #3D #remodelación #diseño #hogar #planodecasa

### Reel 3 · Dibuja en 3D (`reel-03-dibuja-en-3d.mp4`)

> Dibuja tu casa y mírala en 3D al instante ✏️➡️🏠 Recintos con dos clics, paredes, puertas y ventanas, medidas y áreas. Ideal para estudiantes y para planificar una reforma. 🔗 Enlace en el perfil.
>
> #arquitectura #estudiantesdearquitectura #diseño #3D #planos #reforma

### Publicaciones (en orden sugerido)

1. `01-plano-a-3d` · «Presentamos Plano Vivo: de un plano a un 3D que puedes recorrer. Gratis, en tu navegador. 👉 Enlace en el perfil.»
2. `02-antes-despues` · «Antes: una imagen del plano. Después: un modelo 3D editable. ¿Lo pruebas con el tuyo?»
3. `03-tres-pasos` · «Así de simple: sube el plano, pulsa Construir en 3D, recorre y exporta.»
4. `04-que-reconoce` · «Plano Vivo lee tu plano como un arquitecto: muros con su grosor, puertas con su giro, escaleras, terrazas, muebles y la escala.»
5. `05-para-quien` · «Arquitectos, estudiantes, constructores, inmobiliarias, diseño interior… y tú, si estás pensando en reformar tu casa.»
6. `06-exporta` · «No te encierra: exporta en DXF, SVG, GLB, CSV, PNG y, con el motor local, en IFC para BIM.»
7. `07-tu-opinion` · «Estamos en beta y queremos mejorar contigo. Pruébalo y usa el botón Sugerencias, sin crear cuenta.»

Hashtags de base: `#arquitectura #planos #3D #diseño #construcción #PlanoVivo`

### Historias

- `01-recorre-tu-casa`: con el sticker de enlace a la web.
- `02-tres-pasos`: para destacar «Cómo funciona».
- `03-pruebalo`: con el sticker de enlace; sirve como recordatorio cada semana.

### LinkedIn (con `portadas/linkedin-1584x396.png` como portada y el video de presentación)

> Les presento Plano Vivo: una herramienta web gratuita que convierte la imagen o el PDF de un plano en un modelo 3D editable, medible y recorrible.
>
> Reconoce muros con su grosor (también en diagonal), puertas con su lado de giro, ventanas, escaleras, terrazas, muebles y la escala del plano. Calcula longitudes, áreas y volúmenes, y exporta a DXF, GLB y CSV.
>
> Está en beta y busco a gente que trabaje con planos para probarla. ¿Me ayudan? 👉 plano-vivo.fleremiasflemin.workers.dev

## Calendario sugerido (2 semanas)

| Día | Instagram / TikTok | Facebook / LinkedIn |
| --- | --- | --- |
| Lunes | Reel 1 + historia 01 | Publicación de LinkedIn con el video |
| Miércoles | Publicación 02 + historia 02 | Publicación 02 en grupos de arquitectura |
| Viernes | Reel 2 | Publicación 04 |
| Lunes | Publicación 03 + historia 03 | Dossier PDF por correo a 5 docentes o estudios |
| Miércoles | Reel 3 | Publicación 05 |
| Viernes | Publicación 07 (pedir opiniones) | Publicación 06 |

Consejo: en Instagram y TikTok pueden añadir música de la biblioteca de la app al subir el reel, con volumen bajo, para que se siga escuchando la narración.

## Láminas profesionales

- `lamina-00-portada`: portada del dossier.
- `lamina-01-presentacion-de-proyecto`: lámina estilo arquitectura, con axonometría, planta acotada, cuadro de cantidades y cajetín. Sirve para mostrar qué entrega Plano Vivo.
- `lamina-02-flujo-de-trabajo`: los cinco pasos, del plano al modelo.
- `lamina-03-ficha-tecnica`: todas las funciones, formatos, privacidad y alcance.
- `dossier-plano-vivo.pdf`: las cuatro juntas, para enviar a universidades, estudios e inmobiliarias. Se imprime en A3.

## Regenerar el material

Hace falta Microsoft Edge, Node, ffmpeg, `pip install edge-tts` y `npm install playwright@1.65.1` en alguna carpeta. Desde `fuentes/`, con `NODE_PATH` apuntando a ese `node_modules`:

```powershell
node capturas.cjs   # capturas de la app publicada
node renders.cjs    # renders limpios del modelo 3D
node piezas.cjs     # publicaciones, historias, portadas, láminas y dossier
node reels.cjs      # los tres reels (narración + grabación + montaje)
```

Los textos de la narración se envían al servicio de voz de Microsoft (edge-tts); nada más sale del computador.

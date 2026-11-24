# Lanzamiento de Plano Vivo (beta)

## Ya está listo

- **Web pública:** https://plano-vivo.fleremiasflemin.workers.dev (Cloudflare). La copia en GitHub Pages sigue funcionando.
- **Video de presentación** (2 min 54 s, con música): botón «▶ Ver cómo funciona» dentro de la app, o el archivo `dist/media/plano-vivo-presentacion.mp4`, con subtítulos en `dist/media/plano-vivo-presentacion.vtt`.
- **Buzón de sugerencias:** botón «Sugerencias» arriba a la derecha. No pide cuenta. Los mensajes se guardan en la base de datos D1 `plano-vivo-sugerencias` de Cloudflare.

Para leer las sugerencias:

```powershell
npx wrangler d1 execute plano-vivo-sugerencias --remote --command "SELECT id, creada, tipo, valoracion, mensaje, contacto FROM sugerencias ORDER BY id DESC LIMIT 50"
```

Para ver el promedio de valoraciones:

```powershell
npx wrangler d1 execute plano-vivo-sugerencias --remote --command "SELECT tipo, COUNT(*) AS mensajes, ROUND(AVG(valoracion), 1) AS valoracion FROM sugerencias GROUP BY tipo"
```

## Paso 1 · Prueba cerrada (semanas 1 y 2)

Busquen entre 10 y 20 personas que trabajen con planos: estudiantes de arquitectura, arquitectos, maestros de obra, diseñadores de interiores, agentes inmobiliarios. Les pidan tres tareas concretas:

1. Subir un plano propio y pulsar «Construir en 3D».
2. Corregir algo del resultado (una pared, la escala).
3. Enviar una sugerencia diciendo qué falló o qué echaron de menos.

Las tareas concretas dan mejores sugerencias que preguntar «¿qué te parece?».

## Paso 2 · Lanzamiento abierto (desde la semana 3)

| Canal | Qué publicar |
| --- | --- |
| WhatsApp y grupos de amigos o compañeros | Mensaje corto con el enlace (abajo) |
| Facebook: grupos de arquitectura y construcción de Ecuador y Latinoamérica | Publicación con el video |
| Instagram y TikTok | Corte vertical de 30 s: plano → 3D → recorrido |
| LinkedIn | Publicación personal contando por qué lo hicieron |
| Universidades (facultades de arquitectura y diseño) | Escribir a docentes de taller: lo pueden usar en clase |
| Reddit (r/arquitectura, r/SideProject) | Publicación en primera persona pidiendo opiniones |

Más adelante, cuando el reconocimiento esté probado con planos reales de usuarios, pueden lanzarlo en Product Hunt.

## Mensajes listos para copiar

**WhatsApp:**

> ¡Hola! Estamos probando Plano Vivo, una web gratuita que convierte un plano (foto o PDF) en un modelo 3D que puedes recorrer. ¿Me ayudas probándolo con un plano tuyo y contándome qué tal? Hay un botón «Sugerencias» dentro, sin registrarte: https://plano-vivo.fleremiasflemin.workers.dev

**Facebook / LinkedIn:**

> Construimos Plano Vivo: subes la foto o el PDF de un plano y en segundos tienes un modelo 3D con muros, puertas, ventanas, escaleras y muebles, que puedes medir, editar, recorrer por dentro y exportar a DXF o GLB. Funciona en el navegador, es gratis y no hay que instalar nada.
>
> Está en beta y queremos mejorarlo con quienes trabajan con planos todos los días. Pruébalo con un plano tuyo y cuéntanos qué falló o qué te gustaría con el botón «Sugerencias».
>
> 👉 https://plano-vivo.fleremiasflemin.workers.dev

**Instagram / TikTok (texto del video):**

> De un plano a un 3D que puedes recorrer, en segundos y gratis. ¿Lo pruebas con el plano de tu casa? Enlace en la bio. #arquitectura #planos #diseñodeinteriores #3D

## Paso 3 · Ciclo semanal

1. **Lunes:** leer las sugerencias de la semana (comando de arriba).
2. Elegir una o dos mejoras, las que más se repitan o las que bloqueen el uso.
3. Publicarlas (pull request → fusionar → `npx wrangler deploy`).
4. Contar en los mismos grupos qué se mejoró gracias a las sugerencias. Así la gente sigue escribiendo.

## Antes de crecer mucho

- **Dominio propio** (por ejemplo `planovivo.app`), conectado al Worker desde el panel de Cloudflare. Se ve más profesional que una dirección `workers.dev` con el nombre de la cuenta.
- **Página de privacidad** corta: los planos se procesan en el navegador y no se suben; el buzón guarda solo el texto que la persona escribe y, si lo pone, su contacto.
- **Medición de visitas:** Cloudflare Web Analytics no usa cookies y se activa desde el panel (Workers → plano-vivo → Métricas).

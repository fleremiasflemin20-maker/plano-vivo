# Plano Vivo frente a otros programas de planos

Investigación del 24 de noviembre de 2026, con fuentes públicas: comparativas y páginas de los fabricantes. La mayoría de las fuentes son material comercial de cada marca, así que sus afirmaciones de precisión no están verificadas de forma independiente.

## Quién hace qué

| Programa | Tipo | Lo que destaca | Lo que Plano Vivo puede aprender |
| --- | --- | --- | --- |
| **Revit** (Autodesk) | BIM profesional | Arquitectura, estructura e instalaciones (MEP) en un solo modelo. Planos, cortes, alzados y cuadros (schedules) se mantienen sincronizados. | Elementos con datos (muros, columnas, losas) y cuadros de cantidades automáticos. |
| **Archicad** (Graphisoft) | BIM profesional | El concepto de «edificio virtual»: muros, losas, cubiertas y escaleras se comportan como elementos reales de obra. | Terminología de obra y elementos estructurales. |
| **Planner 5D** | Web y móvil | Sube una imagen o un PDF y detecta muros, recintos, puertas y ventanas. | Lo mismo que ya hace Plano Vivo con «Construir en 3D». |
| **Houzz Pro** (AutoMate AI) | Profesionales del hogar | Calca el documento 2D y conserva muros, puertas y ventanas. | Reconocimiento automático; Plano Vivo además es gratis y local. |
| **Coohom, Homestyler, Krea** | Web con IA | Convierten un plano en 3D. Krea pide confirmar la escala y editar antes de dar el resultado por bueno. | Confirmar la escala y revisar antes de aceptar, como ya hace la revisión de Plano Vivo. |
| **RoomSketcher** | Web y app | Nombres y áreas de cada ambiente, que se actualizan solos. Siete formas de mostrar medidas y área total. | **Cuadro de áreas con nombres**: añadido. |
| **magicplan** | App de escaneo | Mide con el teléfono. Para cada muro, ventana o puerta da sus medidas, y para cada recinto el área, el perímetro, el área de muros y el volumen. Exporta a OBJ, IFC y USDZ. | Cantidades por recinto: añadidas, con el cuadro de áreas y los cómputos. |

**Lo que dicen las propias fuentes:**
- La calidad del plano de partida manda: un pequeño hueco en un muro impide reconocer un recinto. Por eso añadimos **Cerrar uniones**.
- Estas herramientas sirven para el anteproyecto y la aprobación del cliente; el proyecto final se termina en un programa profesional. Por eso Plano Vivo exporta a **DXF**, y a **IFC** con el motor local.

## Qué añadimos (PR #11)

Para que un arquitecto o un ingeniero civil pueda trabajar con más exactitud:

1. **Ejes estructurales** (1, 2, 3 / A, B, C) desde un origen y sus luces, con burbujas en el plano y capa `EJES` en el DXF.
2. **Columnas** en los cruces de ejes, con su sección b × h, en 2D, 3D, DXF y cómputos.
3. **Losa** con su espesor, en 3D y en cómputos.
4. **Ambientes con nombre** (Sala, Dormitorio, Baño…) y **cuadro de áreas** con porcentajes.
5. **Longitud escrita** al dibujar: `4.25`, `425cm` o `3<90`. Se suma a lo que ya había: longitud fija, ortogonal, imán, cuadrícula y el inspector con longitud, ángulo y posición exactos.
6. **Cerrar uniones** y **Enderezar muros**: corrigen los defectos típicos de un plano reconocido o dibujado a mano.
7. **Revisión técnica**:
   - uniones abiertas;
   - muros desviados o muy cortos;
   - puertas angostas;
   - recintos sin puerta, sin ventana o pequeños para su tipo;
   - escaleras fuera de la regla de Blondel.
8. **Cómputos métricos** con rendimientos editables, exportables a CSV:
   - mampostería y bloques;
   - mortero y dinteles;
   - enlucido y pintura;
   - pisos y contrapiso;
   - carpintería;
   - hormigón y acero referencial de columnas y losa.
9. **Glosario de obra**: muro, vano, antepecho, dintel, luz, eje, columna, viga, losa, contrapiso, enlucido, cota, NPT, huella, contrahuella…

**Importante:** las áreas mínimas, cuantías y rendimientos son **referencias generales**. No encontré en línea el texto de la NEC (MIDUVI) con las medidas mínimas de vivienda, así que no las cité. La app recuerda verificar la ordenanza municipal y la NEC.

## Siguientes pasos recomendados

Ordenados por impacto para profesionales:

1. **Varias plantas (niveles)**, con NPT y escalera que las conecte. Es lo que más piden los proyectos de 2 o más pisos.
2. **Vigas** entre columnas y **cimentación** (zapatas) en planta.
3. **Cotas encadenadas** exteriores, automáticas por eje y por vano.
4. **Cortes y alzados** generados del modelo.
5. **Lámina imprimible** (PDF) con cajetín, escala y norte.
6. **Normativa por país o ciudad** configurable: NEC Ecuador y las ordenanzas de Quito y Guayaquil, cargadas desde sus documentos oficiales.

## Fuentes

- [Matterport: The 8 Best Floor Plan Software Available in 2026](https://matterport.com/blog/best-floor-plan-software)
- [Gitnux: Top 10 Best Architectural Floor Plan Software of 2026](https://gitnux.org/best/architectural-floor-plan-software/)
- [Planner 5D: Turn your floor plan into a 3D model](https://planner5d.com/ai/floor-plan-to-3d-model)
- [Houzz Pro: 3D design floor planner](https://www.houzz.com/for-pros/3d-design-floor-planner.md)
- [Wood Floor Business: Houzz unveils AI-powered 3D floor plan](https://www.woodfloorbusiness.com/news/article/15743002/houzz-unveils-aipowered-3d-floor-plan)
- [Coohom: AI floor plan recognition](https://www.coohom.com/article/ai-floor-plan-recognition)
- [Krea: floorplan 2D to 3D](https://www.krea.ai/nodes/app/terrificstrikingmongoose/floorplan-2d-to-3d-by-workitstudio-2)
- [Revizto: Archicad vs Revit](https://revizto.com/en/archicad-vs-revit/)
- [MyArchitectAI: Archicad vs Revit 2026](https://www.myarchitectai.com/blog/revit-vs-archicad)
- [RoomSketcher: measurements](https://www.roomsketcher.com/features/pro-features/measurements/)
- [RoomSketcher help: what measurements can I add](https://help.roomsketcher.com/hc/en-us/articles/360000216525)
- [RoomSketcher: Is RoomSketcher better than magicplan?](https://www.roomsketcher.com/blog/is-roomsketcher-better-than-magicplan/)

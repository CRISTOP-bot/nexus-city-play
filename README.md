# NEXUS CITY Web Edition

Aplicación de navegador modular: no carga un motor de terceros, mantiene una edición ligera de la simulación en localStorage y publica estáticos con GitHub Pages.

## Módulos

- `index.html`: estructura y carga explícita de módulos en orden.
- `css/app.css`: estilos responsive, fuera del HTML.
- `js/core.js`: creación/migración de partida, RNG reproducible y persistencia.
- `js/learning.js`: cerebros, decisiones, aprendizaje, memoria y enseñanza.
- `js/simulation.js`: economía, empleo, relaciones, eventos, elecciones y expansión urbana.
- `js/renderer3d.js`: WebGL, edificios, residentes y cámara.
- `js/renderer-fallback.js`: mapa isométrico Canvas si WebGL no está o pierde contexto.
- `js/view.js`: métricas, gráfica, eventos y lista de residentes.
- `js/inspector.js`: perfil neuronal y enseñanza de habilidades.
- `js/app.js`: interacciones y ciclo de vida de página.
- `tests/`: pruebas Node.js integradas en GitHub Actions.

## Desarrollo y validación

Con Node.js 22+: `node --test tests/*.test.cjs`. El workflow además ejecuta `node --check` a todos los módulos. El despliegue de Pages espera a que el job de validación termine correctamente. En el contenedor usado para este cambio no hay Node ni navegador instalado; sí se comprobó la sintaxis de todos los módulos con el parser Tree-sitter JavaScript. Por eso no se declara que las pruebas Node se hayan ejecutado localmente; se ejecutarán en Actions.

## Cambios de esta auditoría

- Separación del antiguo bundle único en HTML, CSS y módulos JS.
- Renderer: única inicialización de WebGL; el render del HUD ya no intenta recrear canvas/contexto. El loop se inicia una vez; pérdida de contexto cae al renderer alternativo.
- Menos trabajo por frame: lista de residentes dibujados acotada a ~700 (WebGL) o ~1.100 (fallback), con el seleccionado incluido.
- Simulación: producción diaria y coste operativo; arreglado el comparador de precios que antes siempre empataba; socialización usa índices de hogar en vez de filtrar toda la ciudad por cada habitante; difusiones usan índice de residentes.
- Gobierno y eventos usan RNG guardado en la partida, y se acotaron límites de días/estados.
- Persistencia: esquema versión 2 migra partida anterior; administra fallos de JSON/localStorage con recuperación.
- UX: modal seguro por delegación de eventos, accesibilidad del mapa y pausa del reloj en pestaña oculta.

## Límites

La escena muestra voxels 3D/Canvas isométrico, pero las rutas casa/trabajo son una abstracción visual de ciclo, no pathfinding en una malla ni puertas físicas. El fallback tiene geometría isométrica 2D. La edición web es separada de la DB Python. El sistema no es inteligencia general. Los agentes se procesan en el hilo principal; aunque el renderer limita los modelos visibles, la simulación y localStorage todavía requieren medición en teléfonos de poca memoria y en poblaciones grandes. No se ha afirmado un benchmark nuevo como resultado de esta auditoría.

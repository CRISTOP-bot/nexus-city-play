# NEXUS CITY Web Edition

Aplicación modular de simulación en navegador, sin dependencias externas. La partida queda en localStorage de este navegador.

## Módulos

- `index.html`, `css/app.css`: UI, estilos y carga ordenada.
- `js/core.js`: mundo, habitantes, RNG reproducible, persistencia y migración.
- `js/learning.js`: memoria episódica/semántica, preferencias, personalidad, aprendizaje, decisiones y enseñanza.
- `js/simulation.js`: necesidades, acciones diarias, empleo, producción, comercio, política, sucesos, relaciones y vivienda.
- `js/renderer3d.js`, `js/renderer-fallback.js`: ciudad WebGL voxel en escritorio y mapa isométrico Canvas en celulares/dispositivos sin WebGL; móvil limita la resolución de dibujo para reducir carga.
- `js/view.js`, `js/inspector.js`, `js/app.js`: tablero, inspector neuronal e interacción.
- `tests/`: pruebas Node ejecutadas antes de publicar.

## Mejoras de mecánicas (schema 4)

- Seis rasgos individuales: sociabilidad, ambición, frugalidad, curiosidad, empatía y responsabilidad. Influyen en elecciones, aprendizaje, cuidado y actividad social.
- Necesidades ampliadas a alimento, energía, pertenencia, ropa, salud y estrés. El hambre deteriora salud; una buena alimentación y energía la recuperan poco a poco; descansar reduce estrés y fatiga.
- Decisiones nuevas: comprar ropa, descansar, estudiar y ayudar económicamente a un vecino con bajos recursos. Aprender de éxitos y fracasos cambia los valores de acción y habilidades.
- Relaciones evolucionan con conversaciones y ayuda; la ayuda genera recuerdos personales de gratitud y refuerza el vínculo.
- Políticas y eventos repercuten en bienestar, salud, educación o estrés. Las elecciones/eventos conservan RNG determinista por ciudad.
- El tablero mide bienestar incluyendo las necesidades nuevas; el inspector muestra personalidad y estado completo.
- Migración transparente a schema 4 mantiene partidas anteriores y asigna defaults a campos nuevos.

La vivienda inicial declara capacidad total para la población; la migración también recalcula ocupación desde las casas de cada residente. La economía de ropa se apoya en negocios existentes y el mercado local. El fondo municipal solo rescata a un proveedor esencial sin competencia cada 30 días y únicamente si el tesoro alcanza la subvención definida; el rescate queda registrado. El simulador sigue siendo una abstracción de agentes con reglas y aprendizaje acotado, no una IA general ni pathfinding físico. Los movimientos de peatones son visuales; el rendering limita instancias para no dibujar a toda la población en cada frame. La simulación corre en el hilo principal; el tamaño de población afecta el rendimiento y localStorage.

## Validación

Node.js 22+: `node --test tests/*.test.cjs`. GitHub Actions también comprueba sintaxis y bloquea el deploy si falla una prueba. En pantallas de hasta 820 px y tablets táctiles se selecciona el mapa Canvas antes de intentar WebGL; al estrechar una ventana desktop también se cambia al fallback. Las pruebas automatizadas verifican la selección del renderer y el workflow. Aún falta inspección visual manual en dispositivos Android/iOS reales; el fallback 2D es deliberadamente la opción de compatibilidad móvil.

# Asyne Finance — desarrollo local

Vue 3 + Element Plus + Vite, API Node.js con Express 5, PostgreSQL 17 y Docker Compose.

## Levantar

Desde esta carpeta, con Docker Desktop en marcha:

```sh
docker compose up --build -d
```

Abrir http://localhost:5174. El puerto se publica exclusivamente en loopback. La API y PostgreSQL solo son accesibles dentro de la red de Compose; Vite envía `/api` a Express.

No hace falta instalar Node ni PostgreSQL en el host. Para cambiar el puerto o la contraseña de desarrollo, copia `.env.example` a `.env` antes del primer arranque. Una base ya inicializada mantiene su contraseña hasta cambiarla en PostgreSQL.

## Primera versión

- Posiciones manuales: crear, editar y eliminar, con estrategia largo plazo o swing.
- Al añadir o editar una posición puedes indicar monto y entrada (cantidad calculada), salida objetivo y stop-loss. El formulario calcula al cambiar los datos la ganancia, pérdida, porcentajes y beneficio/riesgo brutos; los niveles se guardan y aparecen en la cartera. También se mantiene la entrada por cantidad. Salida y stop son opcionales para las posiciones a largo plazo. Estas estimaciones no incluyen comisiones ni deslizamiento.
- Coste y valoración agrupados por moneda (USD, EUR y USDT); sin conversión de divisas. Un precio vacío se mantiene desconocido y la valoración se marca como parcial.
- Planes manuales de trading: entrada, objetivo, stop, mercado, notas, caducidad y estado. Los planes no representan operaciones ejecutadas.
- Calculadora de posiciones con comisiones y límite de capital. Cálculos del riesgo con decimal.js; importes de resumen de interfaz son aproximaciones de visualización.
- Persistencia PostgreSQL mediante volumen `postgres_data`, migración inicial transaccional y validación de API con Zod. No se insertan posiciones ficticias automáticamente.

No hay conexión a cuentas de brokers, señales automáticas, autenticación ni ejecución de órdenes. Entorno de desarrollo local para un usuario; no debe exponerse a una red ni a Internet tal como está. La nueva aplicación no se publica en Sites.

## Desarrollo y comprobaciones

Los cambios en `frontend/src` y `backend/src` se reflejan sin reconstruir las imágenes. Si cambias dependencias, actualiza `package-lock.json` y vuelve a construir.

```sh
docker compose logs -f api web
docker compose exec api npm test
docker compose exec web npm run build
docker compose down
```

`docker compose down` conserva la base de datos. No añadas `-v` si quieres mantener tus registros.

## Estructura

- `frontend/`: aplicación Vue y componentes Element Plus.
- `backend/src/`: API Express, reglas y migraciones PostgreSQL.
- `backend/test/`: pruebas del cálculo y validación.
- `compose.yaml`: servicios web, API y base de datos.
- `legacy-prototype/`: maqueta HTML inicial, separada de la aplicación Docker; no se utiliza para desarrollo.

## Próximas etapas

Importación de cartera, historial de movimientos y un motor de análisis para propuestas verificadas. Las reglas de riesgo de la calculadora son editables y sus valores iniciales solo sirven de ejemplo.


## Catálogo y cotizaciones

El selector consulta `assets` en PostgreSQL, con identidad separada por proveedor, mercado (MIC) y moneda. «Actualizar catálogo» importa pares spot de Binance en USDT/EUR, acciones estadounidenses y el catálogo de ETF/ETP en USD/EUR de Twelve Data. Estar en el catálogo no garantiza acceso a cotizaciones en el plan gratuito. Los errores de sincronización conservan el catálogo anterior. Las posiciones previas se mantienen y pueden asociarse a un activo al editarlas.

- Cripto: API pública Binance Market Data, sin cuenta ni clave. Última operación REST al iniciar y WebSocket de operaciones retransmitido por Express como SSE, con publicación a la interfaz de como máximo una actualización por segundo por activo.
- Acciones/ETF: Twelve Data `/quote`, consultado cada 60 segundos mientras la página está visible, con caché compartida. Fuente, fecha de cotización y mercado cerrado se muestran de forma explícita; no se promete cobertura mundial ni datos consolidados en tiempo real. La respuesta se verifica contra símbolo, MIC y moneda.
- Como máximo 50 activos distintos por vista. Los datos desconectados, pendientes o recibidos hace más de 90 segundos no entran en la valoración vigente. Las últimas cotizaciones recibidas se conservan en PostgreSQL; no se confunden con precios manuales ni se cambia automáticamente tu entrada.
- Límite local de Twelve Data: 7 solicitudes/minuto y 750/día por proceso, además de los límites propios del proveedor. El contador se reinicia al reiniciar la API; el proveedor es la autoridad final sobre la cuota. La clave nunca se envía al navegador.

Para habilitar bolsa, crea una clave personal en https://twelvedata.com, copia `.env.example` a `.env` si aún no existe y configura `TWELVE_DATA_API_KEY`. No compartas ni subas ese archivo. Después:

```sh
docker compose up -d --force-recreate api
```

El plan Basic tiene límites diarios y de cobertura; algunos ETF o mercados requieren otro plan. El portal muestra un error cuando un instrumento no está cubierto y no contrata servicios de pago.

Comprobación de integración contra datos públicos reales (crea y elimina únicamente su posición temporal):

```sh
docker compose exec -T api node backend/src/check-markets.js
```

Documentación: https://github.com/binance/binance-spot-api-docs/blob/master/faqs/market_data_only.md y https://twelvedata.com/pricing.

## Inicio, diario de swing e informes

El inicio muestra resultados abiertos y realizados por estrategia y moneda, operaciones abiertas/cerradas, porcentaje de aciertos y el último informe diario. Los precios ausentes no se convierten en cero. El realizado de largo plazo no está disponible porque las ventas históricas no están registradas.

Las propuestas diarias incluyen mercado, entrada, objetivo, stop, fuentes y caducidad. Introduce un importe para estimar beneficio y pérdida. El selector permite descartar o registrar una compra efectivamente ejecutada, con su precio, importe, comisión y fecha. En «Mis ejecuciones» se registran ventas totales o parciales. Las propuestas y las ejecuciones son registros diferentes; no se envían órdenes al bróker.

Las automatizaciones de Codex están programadas para iniciar al abrir NYSE (09:30, hasta tres propuestas) y al cerrar (16:00, informe; 13:00 en sesiones reducidas), hora de Nueva York. Solo trabajan de lunes a viernes con sesión bursátil, excluyendo festivos y verificando cierres extraordinarios. Requieren el equipo, Codex y Docker disponibles. Su procedimiento y los contratos de publicación están en [DAILY_TASKS.md](DAILY_TASKS.md). Las publicaciones son idempotentes por día y se guardan en PostgreSQL con fecha, hora y fuentes. El informe conserva además una fotografía de la cartera y del diario.

Verificación del diario con registros temporales aislados:

```sh
docker compose exec -T api node backend/src/check-journal.js
```

`check-publications.js` verifica publicación, fotografía de datos y deduplicación. Solo ejecutarlo cuando no exista una publicación real del día; elimina exclusivamente sus registros temporales.

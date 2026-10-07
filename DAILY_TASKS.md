# Tareas diarias locales

Dos automatizaciones de Codex trabajan en esta carpeta: análisis a la apertura regular (09:30) y resumen al cierre (16:00, o 13:00 en sesiones reducidas), America/New_York, de lunes a viernes y solo en días de sesión de NYSE. Necesitan este equipo, Codex y los contenedores disponibles. No son un servicio alojado ni operan en el bróker.

## Comprobación obligatoria del calendario

Antes de consultar la cartera o iniciar un análisis, ejecutar:

```powershell
docker compose exec -T api node backend/src/daily-task.js schedule-check analysis
docker compose exec -T api node backend/src/daily-task.js schedule-check report
```

Usar solo el comando de la tarea correspondiente. Si `due` es falso por horario, fin de semana o festivo, terminar en silencio sin publicaciones ni notificaciones. Si `calendarVerified` es falso, verificar y actualizar el calendario oficial antes de trabajar. El calendario local cubre 2026–2028 y falla de forma segura fuera de ese intervalo. Si `due` es verdadero, comprobar además en fuentes oficiales si hay un cierre extraordinario o cambio de horario para la fecha. Ante falta de verificación, no inventar una sesión abierta.

Fuente: https://www.nyse.com/trade/hours-calendars. Los cierres bursátiles no coinciden necesariamente con todos los festivos federales de Estados Unidos.

Las comprobaciones programadas usan varias horas de Madrid para cubrir automáticamente el desfase de cinco o seis horas con Nueva York: apertura a las 14:30/15:30 y cierre a las 18:00/19:00/21:00/22:00. La puerta de calendario filtra las comprobaciones que no corresponden, con una tolerancia de 45 minutos para el arranque. No se generan varios análisis: la base de datos impide duplicados por día. El proceso empieza a la apertura/cierre; investigar y redactar necesita tiempo adicional. Si se cambia la zona horaria del equipo, revisar las horas del programador.

## Consultar datos

```powershell
docker compose exec -T api node backend/src/daily-task.js context
docker compose exec -T api node backend/src/daily-task.js catalog BTC
docker compose exec -T api node backend/src/daily-task.js research UUID_DEL_ACTIVO
```

`context` actualiza cotizaciones de las posiciones y devuelve cartera, propuestas, compras, ventas, estadísticas, informes y estado del proveedor. Los precios no disponibles permanecen ausentes. No usar el precio de referencia del Excel como precio vigente. No confundir USD, USDT y EUR.

`research` obtiene velas cerradas de 4 horas de Binance para cripto, con fecha, fuente y métricas reproducibles. Para acciones y ETF, consultar además fuentes públicas fiables que identifiquen el mercado, moneda y fecha de cotización. La ausencia de clave de Twelve Data no autoriza a inventar precios. El soporte histórico automatizado de bolsa no está implementado en ese comando.

## Análisis a la apertura

1. Leer el contexto local y comprobar si `batches` ya contiene el día actual de Madrid. Si existe, no reemplazar ni duplicar.
2. Investigar cripto, acciones y ETF, con cotizaciones fechadas, liquidez, tendencia, soportes/resistencias y eventos relevantes. Buscar fuentes primarias actuales en la web para noticias/eventos. No transmitir importes ni posiciones privadas a buscadores.
3. Publicar **hasta tres** oportunidades de compra spot de swing, sin apalancamiento. Ninguna cuota obliga a proponer operaciones. Si no hay datos suficientes, publicar cero y explicar las limitaciones. No se exige una oportunidad de cada categoría. Evitar concentración y activos que ya tengan una operación de swing abierta, salvo justificación explícita.
4. Identificar inequívocamente cada activo en el catálogo PostgreSQL. Usar el mercado y moneda del catálogo. Entrada limitada, objetivo y stop deben tener explicación técnica y cumplir stop < entrada < objetivo. No derivar niveles arbitrarios solo para obtener una relación beneficio/riesgo. Indicar invalidación, horizonte orientativo, caducidad (máximo 48 horas), fuente y hora real de los datos. No poner la hora de consulta como fecha de cotización. El servidor admite datos de hasta 96 horas para cierres de bolsa de fin de semana; evaluar si siguen siendo adecuados.
5. El usuario no ha fijado capital ni riesgo máximo. No asignarle un presupuesto ni suponer tolerancia al riesgo. El portal calcula el escenario con el importe que introduzca.
6. Guardar un JSON UTF-8 dentro de `local-data/` (ignorado por Git), copiarlo al contenedor y publicar:

```powershell
docker compose cp local-data/analysis-YYYY-MM-DD.json api:/tmp/daily-analysis.json
docker compose exec -T api node backend/src/daily-task.js publish-analysis /tmp/daily-analysis.json
```

Forma del JSON (sustituir todos los valores de ejemplo por investigación verificada):

```json
{
  "day": "YYYY-MM-DD",
  "summary": "Resumen de mercados, cobertura y motivos para proponer menos de tres si procede.",
  "sources": [{"title": "Fuente primaria consultada", "url": "https://..."}],
  "ideas": [{
    "assetId": "UUID exacto del catálogo",
    "entry": 100,
    "stop": 95,
    "target": 110,
    "rationale": "Tesis, horizonte, datos y niveles observados; distinguir hechos e inferencias.",
    "invalidation": "Qué condición invalida la propuesta antes de entrar.",
    "sourceAt": "Fecha ISO UTC real de los datos",
    "expiresAt": "Fecha ISO UTC de caducidad",
    "sources": [{"title": "Cotización y análisis", "url": "https://..."}]
  }]
}
```

El servidor conserva una publicación diaria inmutable y hasta tres ideas. `created:false` significa que ya existía. No crear ejemplos en la base de datos real. El panel nunca marca una orden como ejecutada por tocar un precio.

## Resumen al cierre

1. Leer `context`. Si `reports` contiene el día actual de Madrid, no duplicar.
2. Revisar los activos, propuestas vigentes/caducadas, decisiones y compras/ventas declaradas. Investigar el contexto de mercado relevante con fuentes fechadas.
3. Escribir el resumen y observaciones en español. Separar ganancias realizadas de no realizadas, y swing de largo plazo; separar monedas. Las ventas de largo plazo anteriores al diario no están registradas y su resultado realizado es desconocido. Explicitar cobertura de precios y datos faltantes; no sumar ceros ficticios.
4. Dar sugerencias razonadas de revisión de riesgo, concentración, órdenes caducadas y niveles próximos. No ejecutar compras/ventas, no modificar los niveles originales ni afirmar que el bróker ejecutó una orden. Una comprobación puntual no demuestra todos los cruces intradía.
5. Guardar el JSON en `local-data/`, copiarlo y publicar:

```powershell
docker compose cp local-data/report-YYYY-MM-DD.json api:/tmp/daily-report.json
docker compose exec -T api node backend/src/daily-task.js publish-report /tmp/daily-report.json
```

```json
{
  "day": "YYYY-MM-DD",
  "title": "Resumen diario de cartera y swing",
  "summary": "Resumen sustentado en los datos consultados.",
  "observations": ["Estado de órdenes, activos y resultados."],
  "suggestions": ["Acción de revisión sugerida y su motivo."],
  "sources": [{"title": "Fuente primaria consultada", "url": "https://..."}]
}
```

La API adjunta automáticamente la fotografía completa de datos y estadísticas, además de la fecha y hora de creación. El inicio muestra el informe más reciente; el historial conserva las versiones diarias. Si falla un proveedor, guardar un informe con esa limitación; si falla PostgreSQL, informar del bloqueo sin afirmar que se guardó.

## Ejecuciones y estadísticas

- Cada propuesta admite una compra confirmada: monto sin comisión, precio medio real, comisión en la misma moneda y hora de ejecución. No se duplica en la tabla de posiciones manuales.
- Las ventas pueden ser parciales. El servidor bloquea ventas que excedan el saldo y asigna proporcionalmente la comisión de compra.
- Resultado realizado = cantidad vendida × (precio de venta − precio de compra) − comisión de venta − parte de la comisión de compra.
- Resultado abierto = cantidad restante × (precio vigente − precio de compra) − comisión de compra pendiente de asignar. No incluye comisiones futuras de venta desconocidas.
- Acierto = operaciones totalmente cerradas con beneficio / operaciones totalmente cerradas; las neutras forman parte del denominador.
- El total swing se muestra únicamente si todas las operaciones abiertas tienen precio. Los cálculos no incluyen rentabilidad fiscal ni movimientos anteriores no registrados.
- Las claves de petición evitan duplicar una ejecución al reintentar. El bloqueo de fila protege ante ventas concurrentes.

Fuentes técnicas: https://developers.binance.com/docs/binance-spot-api-docs/rest-api/market-data-endpoints

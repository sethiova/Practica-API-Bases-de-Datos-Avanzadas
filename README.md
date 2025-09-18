# API REST • Sistema de Incidencias (Universidad de Colima)

API REST en Node.js/Express con MySQL/MariaDB para gestionar Usuarios e Incidencias del sistema de reportes. Expone endpoints JSON y usa procedimientos almacenados para las operaciones principales.

## Tecnologías
- Node.js 18+
- Express 5.1.0
- MySQL/MariaDB (driver mysql 2.18.1)
- dotenv 17.2.1
- bcrypt 6.0.0 (hash de contraseñas)
- nodemon 3.1.10 (dev)

## Estructura
```
Practica API/
├─ index.js
├─ config.db.js
├─ routes/
│  ├─ users.js
│  └─ incidencias.js
├─ .env
├─ .gitignore
├─ package.json
└─ package-lock.json
```

## Requisitos
- Node.js 18+
- MySQL/MariaDB en ejecución
- Crear la base de datos y tabla(s) requeridas. Los SP usados están listados en este README.

## Configuración
Crear archivo `.env`:
```
PORT=3300
DBHOST=localhost
DBUSER=root
DBPASS=
DBNAME=incidencias
```

## Instalación y ejecución
```bash
npm install
# Desarrollo
npx nodemon index.js
# o
node index.js
```
Servidor en: `http://localhost:3300`

## Endpoints

### Usuarios
- GET /users  
  Devuelve lista de usuarios (sin contraseña).
- GET /users/:id  
  Devuelve un usuario por eCodUser.
- POST /users  
  Crea usuario (la API guarda hash con bcrypt).
- PUT /users/:id  
  Actualiza usuario; re-hash si cambia contraseña.
- DELETE /users/:id  
  Baja lógica: bStateUser = 0.
- PATCH /users/:id/reinstate  
  Reactiva usuario: bStateUser = 1.

Procedimientos almacenados (SP)
- GET /users/sp/all → CALL getAllUsers()
- GET /users/sp/:id → CALL getUserById(?)
- POST /users/sp → CALL postInsertUser(...)

Ejemplo POST /users
```json
{
  "tNombreCompletoUsuario": "Max Mendoza",
  "eMatricula": 20156537,
  "tContraseña": "MiClaveSegura!",
  "eEdad": 22,
  "tGenero": "Masculino",
  "tCorreoInstitucional": "mmendoza34@ucol.mx",
  "tTelefono": "3121351997",
  "tDireccion": "Manzanillo, Col.",
  "bStateUser": 1
}
```

### Incidencias
SP utilizados:
- sp_getAllIncidencias()
- sp_countIncidenciasByType(pTypeId)
- sp_updateIncidenciaState(pIncidenciaId, pNewStateId)
- sp_getRecentIncidencias(pDate)
- sp_updateIncidenciaContent(pIncidenciaId, pNewDescription)
- sp_countEmptyContentIncidencias()
- sp_getLongestIncidencia()
- sp_deleteInactiveIncidencias(pInactiveStateId) → baja lógica en endpoint
- sp_markOldIncidenciasAsInactive(pDaysOld, pInactiveStateId)

Rutas:
- GET /incidencias  
  Lista todas las incidencias (CALL sp_getAllIncidencias).
  - Respuesta 200: `{ "count": N, "data": [ ... ] }`
- GET /incidencias/count/:typeId  
  Cuenta incidencias por tipo (CALL sp_countIncidenciasByType).
  - Respuesta 200: `{ "typeId": 3, "total": 5 }`
- POST /incidencias/:id/state  
  Actualiza estado por SP. Body: `{ "newStateId": 2 }`
- GET /incidencias/recent?from=YYYY-MM-DD HH:mm:ss  
  Incidencias desde fecha dada (CALL sp_getRecentIncidencias).
- POST /incidencias/:id/content  
  Actualiza descripción. Body: `{ "description": "texto <=100" }`
- GET /incidencias/countEmpty  
  Cuenta incidencias sin contenido (CALL sp_countEmptyContentIncidencias).
- GET /incidencias/longest-content  
  Incidencia con descripción más larga (CALL sp_getLongestIncidencia).
- DELETE /incidencias/inactive/:stateId  
  Baja lógica (marca bStateIncidencia=0) para las incidencias con `fkeEstadoIncidencia = stateId` (SP adaptado).
- POST /incidencias/mark-old-inactive  
  Marca como inactivas (cambia estado) incidencias con `fhUpdateIncidencia` anterior a N días. Body: `{ "daysOld": 30, "inactiveStateId": 5 }`.

Ejemplos rápidos (curl)
```bash
# Listar incidencias
curl -X GET "http://localhost:3300/incidencias"

# Contar por tipo (typeId=3)
curl -X GET "http://localhost:3300/incidencias/count/3"

# Actualizar estado (id=15 -> state=2)
curl -X POST "http://localhost:3300/incidencias/15/state" ^
  -H "Content-Type: application/json" ^
  -d "{\"newStateId\":2}"

# Recientes desde 2025-09-01
curl -X GET "http://localhost:3300/incidencias/recent?from=2025-09-01%2000:00:00"

# Actualizar contenido
curl -X POST "http://localhost:3300/incidencias/15/content" ^
  -H "Content-Type: application/json" ^
  -d "{\"description\":\"Descripción actualizada\"}"

# Sin contenido
curl -X GET "http://localhost:3300/incidencias/countEmpty"

# Más larga
curl -X GET "http://localhost:3300/incidencias/longest-content"

# Desactivar por estado inactivo (=5)
curl -X DELETE "http://localhost:3300/incidencias/inactive/5"

# Marcar antiguas como inactivas (30 días, estado 5)
curl -X POST "http://localhost:3300/incidencias/mark-old-inactive" ^
  -H "Content-Type: application/json" ^
  -d "{\"daysOld\":30,\"inactiveStateId\":5}"
```

## Manejo de errores
- 400: parámetros inválidos o faltantes.
- 404: no encontrado o sin resultados.
- 500: error de BD o formato inesperado del resultado del SP.
Los handlers registran detalles del error MySQL en consola (code, errno, sqlState, sqlMessage) para diagnóstico.

## Seguridad
- Contraseñas de usuarios se almacenan hasheadas con bcrypt.
- No exponer `.env` (incluido en `.gitignore`).
- Validaciones de entrada en cada endpoint.

## Notas
- Para rutas similares, se priorizan rutas específicas para evitar colisiones (p. ej., `/incidencias/countEmpty` antes de parámetros dinámicos).
- Si los SP están en otro esquema, invocar con `CALL esquema.procedimiento(...)`.

## Licencia
Uso académico.

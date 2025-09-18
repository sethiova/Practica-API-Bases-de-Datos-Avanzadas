const express = require("express");
const app = express();

const dotenv = require("dotenv");
dotenv.config();

app.use(express.json());

const {connection} = require("../config.db");

// GET /incidencias/count/:typeId  (también acepta ?typeId=)
// Entrada:
//   - Params: typeId (int) o Query: ?typeId=int
// Salida 200:
//   { "typeId": number, "total": number }
// Errores:
//   400 parámetros inválidos; 500 error BD o formato inesperado
const countIncidenciasByType = (request, response) => {
  const typeIdRaw = request.params.typeId ?? request.query.typeId;
  const typeId = Number(typeIdRaw);

  if (!Number.isInteger(typeId)) {
    return response.status(400).json({
      message: "Parámetro 'typeId' inválido. Debe ser entero.",
      received: typeIdRaw
    });
  }

  connection.query("CALL sp_countIncidenciasByType(?)", [typeId], (error, results) => {
    if (error) {
      console.error("Error MySQL en sp_countIncidenciasByType:", {
        code: error.code,
        errno: error.errno,
        sqlState: error.sqlState,
        sqlMessage: error.sqlMessage,
        sql: error.sql
      });
      return response.status(500).json({
        message: "Error al contar incidencias",
        details: {
          code: error.code,
          errno: error.errno,
          sqlState: error.sqlState,
          sqlMessage: error.sqlMessage
        }
      });
    }

    if (!Array.isArray(results) || !Array.isArray(results[0])) {
      console.warn("Formato inesperado de resultados del SP:", { preview: JSON.stringify(results).slice(0, 200) });
      return response.status(500).json({
        message: "Formato inesperado de resultados del procedimiento",
        details: { preview: JSON.stringify(results).slice(0, 200) }
      });
    }

    const row = results[0][0];
    const total = row?.total;

    if (typeof total !== "number") {
      return response.status(500).json({
        message: "El procedimiento no devolvió la columna 'total'",
        details: row
      });
    }

    return response.status(200).json({ typeId, total });
  });
};

app.route("/incidencias/count/:typeId").get(countIncidenciasByType);

// POST /incidencias/:id/state
// Entrada:
//   - Params: id (int) -> id de la incidencia a actualizar
//   - Body JSON: { "newStateId": number }
// Salida (200):
//   { "id_incidencia": 123, "message": "Estado actualizado", "affectedRows": 1 }
const updateIncidenciaState = (request, response) => {
  const incidenciaIdRaw = request.params.id ?? request.body?.incidenciaId;
  const newStateIdRaw = request.body?.newStateId;

  const incidenciaId = Number(incidenciaIdRaw);
  const newStateId = Number(newStateIdRaw);

  if (!Number.isInteger(incidenciaId) || !Number.isInteger(newStateId)) {
    return response.status(400).json({
      message: "Parámetros inválidos. 'id' (URL) y 'newStateId' (body) deben ser enteros.",
      received: { id: incidenciaIdRaw, newStateId: newStateIdRaw }
    });
  }

  connection.query(
    "CALL sp_updateIncidenciaState(?, ?)",
    [incidenciaId, newStateId],
    (error, results) => {
      if (error) {
        console.error("Error MySQL en sp_updateIncidenciaState:", {
          code: error.code,
          errno: error.errno,
          sqlState: error.sqlState,
          sqlMessage: error.sqlMessage,
          sql: error.sql
        });
        return response.status(500).json({
          message: "Error al actualizar el estado de la incidencia",
          details: {
            code: error.code,
            errno: error.errno,
            sqlState: error.sqlState,
            sqlMessage: error.sqlMessage
          }
        });
      }

      // Fila devuelta por el SELECT del SP
      const row = results?.[0]?.[0];
      // Intento de obtener filas afectadas desde los OkPacket devueltos por CALL
      const okPacket = Array.isArray(results)
        ? results.find(r => r && typeof r.affectedRows === "number")
        : undefined;
      const affectedRows = okPacket?.affectedRows;

      if (!row) {
        return response.status(500).json({
          message: "Formato inesperado de resultados del procedimiento",
          details: { preview: JSON.stringify(results).slice(0, 200) }
        });
      }

      if (affectedRows === 0) {
        // El UPDATE no afectó filas: id inexistente o mismo estado
        return response.status(404).json({
          message: "Incidencia no encontrada o sin cambios",
          id: incidenciaId
        });
      }

      return response.status(200).json({
        id_incidencia: row.id_incidencia ?? incidenciaId,
        message: row.message,
        affectedRows
      });
    }
  );
};

app.route("/incidencias/:id/state").post(updateIncidenciaState);


// Utilidad: formatea Date a 'YYYY-MM-DD HH:mm:ss' (MySQL/MariaDB)
function toMySQLTimestamp(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
         `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// GET /incidencias/recent?from=YYYY-MM-DD HH:mm:ss (también acepta ISO 8601 o ?date=)
// Entrada:
//   - Query: from (recomendado) o date -> fecha base
// Salida 200:
//   { "from": "YYYY-MM-DD HH:mm:ss", "count": number, "data": [ ...filas... ] }
const getRecentIncidencias = (request, response) => {
  const fromRaw = request.query.from ?? request.query.date;
  if (!fromRaw) {
    return response.status(400).json({
      message: "Falta el parámetro 'from' en query.",
      hint: "Usa ?from=2025-09-01 00:00:00 o ?from=2025-09-01T00:00:00Z"
    });
  }

  const parsed = new Date(fromRaw);
  if (Number.isNaN(parsed.getTime())) {
    return response.status(400).json({
      message: "Fecha inválida en 'from'.",
      received: fromRaw,
      hint: "Formato válido: ISO 8601 o 'YYYY-MM-DD HH:mm:ss'"
    });
  }

  const fromTs = toMySQLTimestamp(parsed);

  connection.query("CALL sp_getRecentIncidencias(?)", [fromTs], (error, results) => {
    if (error) {
      console.error("Error MySQL en sp_getRecentIncidencias:", {
        code: error.code,
        errno: error.errno,
        sqlState: error.sqlState,
        sqlMessage: error.sqlMessage,
        sql: error.sql
      });
      return response.status(500).json({
        message: "Error al obtener incidencias recientes",
        details: {
          code: error.code,
          errno: error.errno,
          sqlState: error.sqlState,
          sqlMessage: error.sqlMessage
        }
      });
    }

    if (!Array.isArray(results) || !Array.isArray(results[0])) {
      console.warn("Formato inesperado de resultados del SP:", { preview: JSON.stringify(results).slice(0, 200) });
      return response.status(500).json({
        message: "Formato inesperado de resultados del procedimiento",
        details: { preview: JSON.stringify(results).slice(0, 200) }
      });
    }

    const rows = results[0];
    return response.status(200).json({ from: fromTs, count: rows.length, data: rows });
  });
};

app.route("/incidencias/recent").get(getRecentIncidencias);

// POST /incidencias/:id/content
// Entrada:
//   - Params: id (int)
//   - Body JSON: { "description": "texto (<=100)" }
// Salida 200:
//   { "id_incidencia": number, "message": "Contenido actualizado", "affectedRows": 1 }
const updateIncidenciaContent = (request, response) => {
  const incidenciaIdRaw = request.params.id ?? request.body?.incidenciaId;
  const descriptionRaw = request.body?.description;

  const incidenciaId = Number(incidenciaIdRaw);

  if (!Number.isInteger(incidenciaId)) {
    return response.status(400).json({
      message: "Parámetro 'id' inválido. Debe ser entero.",
      received: incidenciaIdRaw
    });
  }

  if (typeof descriptionRaw !== "string" || descriptionRaw.trim().length === 0) {
    return response.status(400).json({
      message: "Campo 'description' inválido. Debe ser texto no vacío."
    });
  }

  const description = descriptionRaw.trim();
  if (description.length > 100) {
    return response.status(400).json({
      message: "Campo 'description' excede 100 caracteres.",
      length: description.length
    });
  }

  connection.query(
    "CALL sp_updateIncidenciaContent(?, ?)",
    [incidenciaId, description],
    (error, results) => {
      if (error) {
        console.error("Error MySQL en sp_updateIncidenciaContent:", {
          code: error.code,
          errno: error.errno,
          sqlState: error.sqlState,
          sqlMessage: error.sqlMessage,
          sql: error.sql
        });
        return response.status(500).json({
          message: "Error al actualizar el contenido de la incidencia",
          details: {
            code: error.code,
            errno: error.errno,
            sqlState: error.sqlState,
            sqlMessage: error.sqlMessage
          }
        });
      }

      const row = results?.[0]?.[0];
      const okPacket = Array.isArray(results)
        ? results.find(r => r && typeof r.affectedRows === "number")
        : undefined;
      const affectedRows = okPacket?.affectedRows ?? 0;

      if (!row) {
        return response.status(500).json({
          message: "Formato inesperado de resultados del procedimiento",
          details: { preview: JSON.stringify(results).slice(0, 200) }
        });
      }

      if (affectedRows === 0) {
        return response.status(404).json({
          message: "Incidencia no encontrada o sin cambios",
          id: incidenciaId
        });
      }

      return response.status(200).json({
        id_incidencia: row.id_incidencia ?? incidenciaId,
        message: row.message,
        affectedRows
      });
    }
  );
};

app.route("/incidencias/:id/content").post(updateIncidenciaContent);

// GET /incidencias/countEmpty
// Entrada:
//   - (sin parámetros ni body)
// Salida 200:
//   { "total": number }
// Errores:
//   500: error de BD o formato inesperado
const countEmptyContentIncidencias = (request, response) => {
  connection.query("CALL sp_countEmptyContentIncidencias()", [], (error, results) => {
    if (error) {
      console.error("Error MySQL en sp_countEmptyContentIncidencias:", {
        code: error.code,
        errno: error.errno,
        sqlState: error.sqlState,
        sqlMessage: error.sqlMessage,
        sql: error.sql
      });
      return response.status(500).json({
        message: "Error al contar incidencias sin contenido",
        details: {
          code: error.code,
          errno: error.errno,
          sqlState: error.sqlState,
          sqlMessage: error.sqlMessage
        }
      });
    }

    if (!Array.isArray(results) || !Array.isArray(results[0])) {
      console.warn("Formato inesperado de resultados del SP:", { preview: JSON.stringify(results).slice(0, 200) });
      return response.status(500).json({
        message: "Formato inesperado de resultados del procedimiento",
        details: { preview: JSON.stringify(results).slice(0, 200) }
      });
    }

    const row = results[0][0];
    const total = row?.total;

    if (typeof total !== "number") {
      return response.status(500).json({
        message: "El procedimiento no devolvió la columna 'total'",
        details: row
      });
    }

    return response.status(200).json({ total });
  });
};

app.route("/incidencias/countEmpty").get(countEmptyContentIncidencias);

// GET /incidencias/longest-content
// Entrada: (sin parámetros ni body)
// Salida 200: { "length": number, "data": { ...incidencia } }
// Errores: 404 no hay incidencias; 500 error BD o formato inesperado
const getLongestIncidencia = (request, response) => {
  connection.query("CALL sp_getLongestIncidencia()", [], (error, results) => {
    if (error) {
      console.error("Error MySQL en sp_getLongestIncidencia:", {
        code: error.code,
        errno: error.errno,
        sqlState: error.sqlState,
        sqlMessage: error.sqlMessage,
        sql: error.sql
      });
      return response.status(500).json({
        message: "Error al obtener la incidencia con contenido más largo",
        details: {
          code: error.code,
          errno: error.errno,
          sqlState: error.sqlState,
          sqlMessage: error.sqlMessage
        }
      });
    }

    if (!Array.isArray(results) || !Array.isArray(results[0])) {
      return response.status(500).json({
        message: "Formato inesperado de resultados del procedimiento",
        details: { preview: JSON.stringify(results).slice(0, 200) }
      });
    }

    const row = results[0][0];
    if (!row) {
      return response.status(404).json({ message: "No hay incidencias registradas" });
    }

    const length = (row.tDescripcionIncidencia ?? "").length;
    return response.status(200).json({ length, data: row });
  });
};

app.route("/incidencias/longest-content").get(getLongestIncidencia);

// DELETE /incidencias/inactive/:stateId
// Entrada: Params -> stateId (int)  [en tu caso, normalmente 5]
// Salida 200: { inactiveStateId, total_desactivadas }
// Errores: 400 parámetro inválido; 500 error BD o formato inesperado
const deleteInactiveIncidencias = (request, response) => {
  const stateIdRaw = request.params.stateId ?? request.query.stateId;
  const inactiveStateId = Number(stateIdRaw);

  if (!Number.isInteger(inactiveStateId)) {
    return response.status(400).json({
      message: "Parámetro 'stateId' inválido. Debe ser entero.",
      received: stateIdRaw
    });
  }

  connection.query(
    "CALL sp_deleteInactiveIncidencias(?)",
    [inactiveStateId],
    (error, results) => {
      if (error) {
        console.error("Error MySQL en sp_deleteInactiveIncidencias:", {
          code: error.code,
          errno: error.errno,
          sqlState: error.sqlState,
          sqlMessage: error.sqlMessage,
          sql: error.sql
        });
        return response.status(500).json({
          message: "Error al desactivar incidencias",
          details: {
            code: error.code,
            errno: error.errno,
            sqlState: error.sqlState,
            sqlMessage: error.sqlMessage
          }
        });
      }

      if (!Array.isArray(results) || !Array.isArray(results[0])) {
        return response.status(500).json({
          message: "Formato inesperado de resultados del procedimiento",
          details: { preview: JSON.stringify(results).slice(0, 200) }
        });
      }

      const row = results[0][0] || {};
      const total = row.total_desactivadas ?? row.total ?? 0;

      return response.status(200).json({
        inactiveStateId,
        total_desactivadas: total
      });
    }
  );
};

app.route("/incidencias/inactive/:stateId").delete(deleteInactiveIncidencias)

// POST /incidencias/mark-old-inactive
// Entrada (Body JSON):
//   { "daysOld": number, "inactiveStateId": number }
// Salida 200:
//   { "daysOld": number, "inactiveStateId": number, "total_actualizadas": number }
// Errores:
//   400 parámetros inválidos; 500 error BD o formato inesperado
const markOldIncidenciasAsInactive = (request, response) => {
  const daysOldRaw = request.body?.daysOld;
  const inactiveStateIdRaw = request.body?.inactiveStateId;

  const daysOld = Number(daysOldRaw);
  const inactiveStateId = Number(inactiveStateIdRaw);

  if (!Number.isInteger(daysOld) || daysOld <= 0 || !Number.isInteger(inactiveStateId)) {
    return response.status(400).json({
      message: "Parámetros inválidos. 'daysOld' debe ser entero > 0 y 'inactiveStateId' entero.",
      received: { daysOld: daysOldRaw, inactiveStateId: inactiveStateIdRaw }
    });
  }

  connection.query(
    "CALL sp_markOldIncidenciasAsInactive(?, ?)",
    [daysOld, inactiveStateId],
    (error, results) => {
      if (error) {
        console.error("Error MySQL en sp_markOldIncidenciasAsInactive:", {
          code: error.code,
          errno: error.errno,
          sqlState: error.sqlState,
          sqlMessage: error.sqlMessage,
          sql: error.sql
        });
        return response.status(500).json({
          message: "Error al marcar incidencias antiguas como inactivas",
          details: {
            code: error.code,
            errno: error.errno,
            sqlState: error.sqlState,
            sqlMessage: error.sqlMessage
          }
        });
      }

      if (!Array.isArray(results) || !Array.isArray(results[0])) {
        return response.status(500).json({
          message: "Formato inesperado de resultados del procedimiento",
          details: { preview: JSON.stringify(results).slice(0, 200) }
        });
      }

      const row = results[0][0] || {};
      const total = row.total_actualizadas ?? row.total ?? 0;

      return response.status(200).json({
        daysOld,
        inactiveStateId,
        total_actualizadas: total
      });
    }
  );
};

app.route("/incidencias/mark-old-inactive").post(markOldIncidenciasAsInactive);

// GET /incidencias
// Entrada: (sin parámetros ni body)
// Salida 200: { "count": number, "data": [ ... ] }
// Errores: 404 sin registros; 500 error BD o formato inesperado
const getAllIncidencias = (request, response) => {
  connection.query("CALL sp_getAllIncidencias()", [], (error, results) => {
    if (error) {
      console.error("Error MySQL en sp_getAllIncidencias:", {
        code: error.code,
        errno: error.errno,
        sqlState: error.sqlState,
        sqlMessage: error.sqlMessage,
        sql: error.sql
      });
      return response.status(500).json({
        message: "Error al listar incidencias",
        details: {
          code: error.code,
          errno: error.errno,
          sqlState: error.sqlState,
          sqlMessage: error.sqlMessage
        }
      });
    }

    if (!Array.isArray(results) || !Array.isArray(results[0])) {
      return response.status(500).json({
        message: "Formato inesperado de resultados del procedimiento",
        details: { preview: JSON.stringify(results).slice(0, 200) }
      });
    }

    const rows = results[0];
    if (rows.length === 0) {
      return response.status(404).json({ message: "No se encontraron incidencias" });
    }

    return response.status(200).json({ count: rows.length, data: rows });
  });
};

app.route("/incidencias").get(getAllIncidencias);

// GET /incidencias/search
// Entrada (query): q (string, 1–100)
// Salida 200: { q, count, data }
// Errores: 400 parámetro inválido; 404 sin coincidencias; 500 error BD/resultado inesperado
const searchIncidenciasByText = (request, response) => {
  const qRaw = request.query.q;

  if (typeof qRaw !== "string" || qRaw.trim().length === 0 || qRaw.trim().length > 100) {
    return response.status(400).json({
      message: "Parámetro 'q' inválido. Debe ser texto (1–100 caracteres).",
      received: qRaw
    });
  }

  const q = qRaw.trim();

  connection.query("CALL sp_searchIncidenciasByText(?)", [q], (error, results) => {
    if (error) {
      console.error("Error MySQL en sp_searchIncidenciasByText:", {
        code: error.code, errno: error.errno, sqlState: error.sqlState,
        sqlMessage: error.sqlMessage, sql: error.sql
      });
      return response.status(500).json({
        message: "Error al buscar incidencias por texto",
        details: { code: error.code, errno: error.errno, sqlState: error.sqlState, sqlMessage: error.sqlMessage }
      });
    }

    if (!Array.isArray(results) || !Array.isArray(results[0])) {
      return response.status(500).json({
        message: "Formato inesperado de resultados del procedimiento",
        details: { preview: JSON.stringify(results).slice(0, 200) }
      });
    }

    const rows = results[0];
    if (rows.length === 0) {
      return response.status(404).json({ message: "No se encontraron incidencias que coincidan", q });
    }

    return response.status(200).json({ q, count: rows.length, data: rows });
  });
};

app.route("/incidencias/search").get(searchIncidenciasByText);


module.exports = app;
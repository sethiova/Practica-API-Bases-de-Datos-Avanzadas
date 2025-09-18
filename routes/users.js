const express = require("express");
const app = express();

const dotenv = require("dotenv");
dotenv.config();

app.use(express.json());
const bcrypt = require("bcrypt");


const {connection} = require("../config.db");

const getUsers = (request, response) => {
    connection.query("SELECT eCodUser, tNombreCompletoUsuario, eMatricula, eEdad, tGenero, tCorreoInstitucional, tTelefono, tDireccion FROM users", (error, results) => {
        if (error) throw error;
        if (results.length === 0) {
            return response.status(404).json({ message: "No se encontraron usuarios" });
        }
        response.status(200).json(results);
    });
}

app.route("/users").get(getUsers);

const getUserById = (request, response) => {
    const id = request.params.id;
    connection.query("SELECT eCodUser, tNombreCompletoUsuario, eMatricula, eEdad, tGenero, tCorreoInstitucional, tTelefono, tDireccion FROM users WHERE eCodUser = ?", [id], (error, results) => {
        if (error) throw error;
        if (results.length === 0) {
            return response.status(404).json({ message: "Usuario no encontrado" });
        }
        response.status(200).json(results[0]);
    });
}

app.route("/users/:id").get(getUserById);

const postUser = async (request, response) => {
    try {
        const { tNombreCompletoUsuario, eMatricula, tContraseña, eEdad, tGenero, tCorreoInstitucional, tTelefono, tDireccion,bStateUser } = request.body;

        
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(tContraseña, saltRounds);
        
        connection.query("INSERT INTO users (tNombreCompletoUsuario, eMatricula, tContraseña, eEdad, tGenero, tCorreoInstitucional, tTelefono, tDireccion, bStateUser) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [tNombreCompletoUsuario, eMatricula, hashedPassword, eEdad, tGenero, tCorreoInstitucional, tTelefono, tDireccion, bStateUser], (error, results) => {
            if (error) throw error;
            response.status(201).json({ message: "Usuario creado correctamente", userId: results.insertId });
        });
    } catch (error) {
        console.error("Error al crear el usuario:", error);
    }
};

app.route("/users").post(postUser);

const putUser = async (request, response) => {
   try {
    const id = request.params.id;
    const { tNombreCompletoUsuario, eMatricula, tContraseña, eEdad, tGenero, tCorreoInstitucional, tTelefono, tDireccion,bStateUser } = request.body;

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(tContraseña, saltRounds);

    connection.query("UPDATE users SET tNombreCompletoUsuario = ?, eMatricula = ?, tContraseña = ?, eEdad = ?, tGenero = ?, tCorreoInstitucional = ?, tTelefono = ?, tDireccion = ?, bStateUser = ? WHERE eCodUser = ?", [tNombreCompletoUsuario, eMatricula, hashedPassword, eEdad, tGenero, tCorreoInstitucional, tTelefono, tDireccion,bStateUser, id], (error, results) => {
        if (error) throw error;
        if (results.affectedRows === 0) {
            return response.status(404).json({ message: "Usuario no encontrado" });
        }
        response.status(200).json({ message: "Usuario actualizado correctamente" });
    });
   } catch (error) {
        console.error("Error al actualizar el usuario:", error);
        response.status(500).json({ message: "Error interno del servidor" });
   }
};

app.route("/users/:id").put(putUser);

const delUser = (request, response) => {
  const id = parseInt(request.params.id, 10);
  connection.query(
    "UPDATE users SET bStateUser = 0, fhUpdateUser = CURRENT_TIMESTAMP WHERE eCodUser = ?",
    [id],
    (error, results) => {
      if (error) return response.status(500).json({ message: "Error al eliminar usuario" });
      if (results.affectedRows === 0) return response.status(404).json({ message: "Usuario no encontrado" });
      response.status(200).json({ message: "Usuario eliminado correctamente" });
    }
  );
};

app.route("/users/:id").delete(delUser);

const reinstateUser = (request, response) => {
  const id = parseInt(request.params.id, 10);
  connection.query(
    "UPDATE users SET bStateUser = 1, fhUpdateUser = CURRENT_TIMESTAMP WHERE eCodUser = ?",
    [id],
    (error, results) => {
      if (error) return response.status(500).json({ message: "Error al reinstaurar usuario" });
      if (results.affectedRows === 0) return response.status(404).json({ message: "Usuario no encontrado" });
      response.status(200).json({ message: "Usuario reinstaurado correctamente" });
    }
  );
};

app.route("/users/:id/reinstate").patch(reinstateUser);

const getALLUsersSP = (request, response) => {
    connection.query("CALL getAllUsers()", (error, results) => {
        if (error) throw error;
        response.status(200).json(results[0]);
    });
};

app.route("/users/sp/all").get(getALLUsersSP);

const getUserByIdSP = (request, response) => {
    const id = request.params.id;
    connection.query("CALL getUserById(?)", [id], (error, results) => {
        if (error) throw error;
        response.status(200).json(results[0]);
    });
};

app.route("/users/sp/:id").get(getUserByIdSP);

const postInsertUserSP = async (request, response) => {
    try {
        const { tNombreCompletoUsuario, eMatricula, tContraseña, eEdad, tGenero, tCorreoInstitucional, tTelefono, tDireccion, bStateUser } = request.body;
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(tContraseña, saltRounds);
        connection.query(
            "CALL postInsertUser(?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [tNombreCompletoUsuario, eMatricula, hashedPassword, eEdad, tGenero, tCorreoInstitucional, tTelefono, tDireccion, bStateUser],
            (error, results) => {
                if (error) throw error;
                const userId = results[0][0]?.userId || 0;
                response.status(201).json({ message: "Usuario creado correctamente", userId });
            }
        );
    } catch (error) {
        console.error("Error al crear el usuario:", error);
        response.status(500).json({ message: "Error interno del servidor" });
    }
};

app.route("/users/sp").post(postInsertUserSP);

module.exports = app;
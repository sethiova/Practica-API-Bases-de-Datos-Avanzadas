const dotenv = require("dotenv");
dotenv.config();

const mysql = require("mysql");
let connection;

try {
    connection = mysql.createConnection({
        host: process.env.DBHOST,
        user: process.env.DBUSER,
        password: process.env.DBPASS,
        database: process.env.DBNAME
    });
} catch (error) {
    console.log("Error al conectarse a la base de datos:", error);
}

module.exports = {connection};


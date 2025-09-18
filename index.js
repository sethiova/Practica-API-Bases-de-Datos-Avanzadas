const express = require("express");
const app = express();

app.use(express.json());
app.use(express.urlencoded({extended: true}));

app.use(require("./routes/users"));
app.use(require("./routes/incidencias"));


app.listen(process.env.PORT || 3300, () => {
    console.log(`Servidor corriendo en el puerto ${process.env.PORT || 3300}`);
});

module.exports = app;
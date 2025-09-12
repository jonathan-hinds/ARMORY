const express = require("express");
const app = express();

// Render provides the port as process.env.PORT
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Hello World from Render!");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

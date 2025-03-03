const express = require("express");
const app = express();

// Use the port provided by Render or default to 5000 locally
const PORT = process.env.PORT || 5000;

app.use(express.json());

app.get("/", (req, res) => {
    res.send("Backend is working!");
});

// Bind to 0.0.0.0 to allow Render to expose the server
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running on port ${PORT}`);
});

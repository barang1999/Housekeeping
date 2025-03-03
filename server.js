const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors()); // Fix CORS issues
app.use(express.json()); // Enable JSON parsing

// ✅ Test if Backend is Running
app.get("/", (req, res) => {
    res.send("Backend is working!");
});

// ✅ Signup Route (Temporary User Storage)
let users = [];
app.post("/auth/signup", (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
    }
    users.push({ username, password });
    res.json({ message: "User registered successfully" });
});

// Start the Server
app.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ Server is running on port ${PORT}`);
});

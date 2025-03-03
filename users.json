const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();

// ✅ Setup CORS
const corsOptions = {
    origin: "https://housekeepingmanagement.netlify.app",
    methods: "GET,POST",
    credentials: true
};
app.use(cors(corsOptions));
app.use(express.json());

// ✅ JSON file as a simple database
const USERS_FILE = path.join(__dirname, "users.json");

// Function to read users from the JSON file
const readUsers = () => {
    try {
        if (!fs.existsSync(USERS_FILE)) return [];
        const data = fs.readFileSync(USERS_FILE, "utf-8");
        return JSON.parse(data);
    } catch (error) {
        console.error("Error reading users.json:", error);
        return [];
    }
};

// Function to write users to the JSON file
const writeUsers = (users) => {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
};

// ✅ Signup endpoint (stores users in JSON file)
app.post("/auth/signup", (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: "Missing fields" });
    }

    let users = readUsers();

    // Check if user already exists
    if (users.find(user => user.username === username)) {
        return res.status(400).json({ message: "User already exists" });
    }

    // Store the user
    users.push({ username, password });
    writeUsers(users);
    
    res.status(201).json({ message: "User registered successfully" });
});

// ✅ Login endpoint (validates credentials from JSON file)
app.post("/auth/login", (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: "Missing fields" });
    }

    let users = readUsers();

    // Check if user exists
    const user = users.find(user => user.username === username && user.password === password);
    if (!user) {
        return res.status(401).json({ message: "Invalid credentials. Please try again." });
    }

    res.status(200).json({ message: "Login successful" });
});

// ✅ Keep your existing GET endpoint
app.get("/", (req, res) => {
    res.send("Backend is working!");
});

// ✅ Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

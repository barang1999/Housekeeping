const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();

// ✅ Allow both Localhost and Railway
const corsOptions = {
    origin: ["http://localhost:5500", "https://housekeepingmanagement.netlify.app"],
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
<<<<<<< HEAD
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
        console.log("✅ Users saved successfully:", users);
    } catch (error) {
        console.error("❌ Error saving users.json:", error);
    }
=======
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
>>>>>>> fdb539c (Fixed server issues)
};


// ✅ Signup endpoint (stores users in JSON file)
app.post("/auth/login", (req, res) => {
    const { username, password } = req.body;
    let users = readUsers();

    const user = users.find(user => user.username === username && user.password === password);
    if (!user) {
        return res.status(401).json({ message: "Invalid credentials. Please try again." });
    }

    res.status(200).json({ 
        message: "Login successful", 
        token: "fake-jwt-token"  // 🟢 Add a fake token
    });
});

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

// ✅ Home Route
app.get("/", (req, res) => {
    res.send("Backend is working!");
});

// ✅ Start Server
const PORT = process.env.PORT || 5500;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

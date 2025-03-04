require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();

// ✅ CORS Configuration
app.use(cors({
    origin: ["http://localhost:5500", "http://localhost:5000", "https://housekeepingmanagement.netlify.app"],
    methods: "GET,POST",
    credentials: true
}));
app.use(express.json());

// ✅ Define JSON Files
const USERS_FILE = path.join(__dirname, "users.json");
const LOGS_FILE = path.join(__dirname, "cleaning_logs.json");

// ✅ Utility: Read JSON File
const readFile = (filePath) => {
    try {
        if (!fs.existsSync(filePath)) return [];
        return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch (error) {
        console.error(`❌ Error reading ${filePath}:`, error);
        return [];
    }
};

// ✅ Utility: Write to JSON File
const writeFile = (filePath, data) => {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
        console.log(`✅ Successfully saved data to ${filePath}`);
    } catch (error) {
        console.error(`❌ Error writing ${filePath}:`, error);
    }
};

// ✅ Utility: Get Current Time in Cambodia Time Zone
function getCambodiaTime() {
    return new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Phnom_Penh',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
    }).format(new Date());
}

// ✅ User Signup API
app.post("/auth/signup", (req, res) => {
    const { username, password } = req.body;
    let users = readFile(USERS_FILE);

    if (users.some(user => user.username === username)) {
        console.log(`🔄 User ${username} already exists.`);
        return res.status(302).json({ message: "User already exists. Redirecting to login." });
    }

    // Add new user to JSON
    users.push({ username, password });
    writeFile(USERS_FILE, users);

    console.log(`✅ New user registered: ${username}`);
    res.status(201).json({ message: "User registered successfully. Please log in." });
});

app.get("/auth/users", (req, res) => {
    res.json(readFile(USERS_FILE));
});


// ✅ User Login API
app.post("/auth/login", (req, res) => {
    const { username, password } = req.body;
    let users = readFile(USERS_FILE);

    const user = users.find(user => user.username === username && user.password === password);
    if (!user) {
        return res.status(401).json({ message: "Invalid credentials. Please try again." });
    }

    res.status(200).json({ message: "Login successful", token: `mock-token-${Date.now()}`, username });
});

// ✅ Fetch Cleaning Logs API
app.get("/logs", (req, res) => {
    res.json(readFile(LOGS_FILE));
});

// ✅ Start Cleaning API
app.post("/logs/start", (req, res) => {
    const { roomNumber, username } = req.body;
    let logs = readFile(LOGS_FILE);

    logs.push({
        roomNumber,
        startTime: getCambodiaTime(),
        startedBy: username,
        finishTime: null,
        finishedBy: null
    });

    writeFile(LOGS_FILE, logs);
    res.status(201).json({ message: `Room ${roomNumber} started by ${username} at ${getCambodiaTime()}` });
});

// ✅ Finish Cleaning API
app.post("/logs/finish", (req, res) => {
    const { roomNumber, username } = req.body;
    let logs = readFile(LOGS_FILE);

    const log = logs.find(log => log.roomNumber === roomNumber && log.finishTime === null);
    if (log) {
        log.finishTime = getCambodiaTime();
        log.finishedBy = username;
        writeFile(LOGS_FILE, logs);
        return res.status(200).json({ message: `Room ${roomNumber} finished by ${username} at ${getCambodiaTime()}` });
    }

    res.status(400).json({ message: "Error updating log" });
});

// ✅ Home Route
app.get("/", (req, res) => {
    res.send("Housekeeping Management API is Running 🚀");
});

// ✅ Start Server
const PORT = process.env.PORT || 7070;
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
});

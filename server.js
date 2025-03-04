require("dotenv").config();
console.log("🔍 MONGO_URI from .env:", process.env.MONGO_URI);
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();
app.use(express.json());

// ✅ CORS Configuration
app.use(cors({
    origin: ["http://localhost:5500", "http://localhost:5000", "https://housekeepingmanagement.netlify.app"],
    methods: "GET,POST",
    credentials: true
}));

// ✅ Load MongoDB URI from .env
const mongoURI = process.env.MONGO_URI;

if (!mongoURI) {
    console.error("❌ MongoDB URI is missing! Check .env file.");
    process.exit(1);  // Stop server if no URI
}

// ✅ Connect to MongoDB
mongoose.connect(mongoURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log("✅ MongoDB Connected Successfully"))
.catch(err => console.error("❌ MongoDB connection error:", err));

// ✅ Define User Schema
const userSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true }  // Should use password hashing (e.g., bcrypt)
});

const User = mongoose.model("User", userSchema);

// ✅ Define Cleaning Log Schema
const logSchema = new mongoose.Schema({
    roomNumber: Number,
    startTime: String,
    startedBy: String,
    finishTime: String,
    finishedBy: String
});

const CleaningLog = mongoose.model("CleaningLog", logSchema);

// ✅ User Signup API
app.post("/auth/signup", async (req, res) => {
    const { username, password } = req.body;

    try {
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ message: "User already exists." });
        }

        const newUser = new User({ username, password });
        await newUser.save();
        res.status(201).json({ message: "User registered successfully!" });
    } catch (error) {
        res.status(500).json({ message: "Server error", error });
    }
});

// ✅ Get Users API
app.get("/auth/users", async (req, res) => {
    try {
        const users = await User.find();
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: "Server error", error });
    }
});

// ✅ User Login API
app.post("/auth/login", async (req, res) => {
    const { username, password } = req.body;

    try {
        const user = await User.findOne({ username });
        if (!user || user.password !== password) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        res.status(200).json({ message: "Login successful", token: `mock-token-${Date.now()}`, username });
    } catch (error) {
        res.status(500).json({ message: "Server error", error });
    }
});

// ✅ Start Cleaning API
app.post("/logs/start", async (req, res) => {
    const { roomNumber, username } = req.body;
    const startTime = new Date().toLocaleString("en-US", { timeZone: "Asia/Phnom_Penh" });

    try {
        const newLog = new CleaningLog({ roomNumber, startTime, startedBy: username, finishTime: null, finishedBy: null });
        await newLog.save();
        res.status(201).json({ message: `Room ${roomNumber} started by ${username} at ${startTime}` });
    } catch (error) {
        res.status(500).json({ message: "Server error", error });
    }
});

// ✅ Finish Cleaning API
app.post("/logs/finish", async (req, res) => {
    const { roomNumber, username } = req.body;
    const finishTime = new Date().toLocaleString("en-US", { timeZone: "Asia/Phnom_Penh" });

    try {
        const log = await CleaningLog.findOne({ roomNumber, finishTime: null });
        if (!log) return res.status(400).json({ message: "Log not found" });

        log.finishTime = finishTime;
        log.finishedBy = username;
        await log.save();
        res.status(200).json({ message: `Room ${roomNumber} finished by ${username} at ${finishTime}` });
    } catch (error) {
        res.status(500).json({ message: "Server error", error });
    }
});

// ✅ Get Cleaning Logs API
app.get("/logs", async (req, res) => {
    try {
        const logs = await CleaningLog.find();
        res.json(logs);
    } catch (error) {
        res.status(500).json({ message: "Server error", error });
    }
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

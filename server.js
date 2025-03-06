require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// ✅ Ensure MongoDB URI exists
const mongoURI = process.env.MONGO_URI;
if (!mongoURI) {
    console.error("❌ MONGO_URI is missing. Check your .env file!");
    process.exit(1);
}
console.log("🔍 Connecting to MongoDB...");

// ✅ Initialize Express
const app = express();
app.use(express.json());

// ✅ Proper CORS Configuration
app.use(cors({
    origin: [
        "https://housekeepingmanagement.netlify.app", 
        "http://localhost:10000",
        "http://localhost:3000"
    ],
    methods: ["GET", "POST", "PUT", "DELETE"],    
    allowedHeaders: ["Content-Type", "Authorization"]
}));

// ✅ Create HTTP & WebSocket Server
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "https://housekeepingmanagement.netlify.app",
        methods: ["GET", "POST"]
    }
});

/// ✅ WebSocket Connection Authentication
io.use((socket, next) => {
    let token = socket.handshake.auth?.token || (socket.handshake.headers.authorization ? socket.handshake.headers.authorization.split(" ")[1] : null);

    if (!token) {
        console.warn("❌ WebSocket Authentication Failed: No token provided.");
        return next(new Error("Authentication error: No token"));
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            console.warn("❌ WebSocket Authentication Failed:", err.message);
            return next(new Error("Authentication error: Invalid token"));
        }
        
        socket.user = decoded;
        console.log(`✅ WebSocket Authenticated: ${decoded.username}`);
        next();
    });
});

io.on("connection", (socket) => {
    console.log(`⚡ New WebSocket client connected: ${socket.user.username}`);
    socket.emit("connected", { message: "WebSocket authenticated successfully", user: socket.user });

    socket.on("disconnect", (reason) => {
        console.log(`🔴 WebSocket client disconnected: ${socket.user.username}, Reason: ${reason}`);
    });
});

// ✅ Connect to MongoDB (Updated - No deprecated options)
mongoose.connect(mongoURI)
    .then(() => console.log("✅ MongoDB Connected Successfully"))
    .catch(err => {
        console.error("❌ MongoDB connection error:", err);
        process.exit(1);
    });

// ✅ Define MongoDB Schemas
const userSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true }
});
const User = mongoose.model("User", userSchema);

const logSchema = new mongoose.Schema({
    roomNumber: Number,
    startTime: String,
    startedBy: String,
    finishTime: String,
    finishedBy: String
});
const CleaningLog = mongoose.model("CleaningLog", logSchema);

// ✅ Authentication Routes

// 🔐 Login
app.post("/auth/login", async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: "Missing fields" });

    try {
        const user = await User.findOne({ username });
        if (!user) return res.status(401).json({ message: "Invalid credentials" });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ message: "Invalid credentials" });

        const token = jwt.sign({ username: user.username }, process.env.JWT_SECRET, { expiresIn: "1h" });

        res.status(200).json({ message: "Login successful", token, username });
    } catch (error) {
        res.status(500).json({ message: "Server error", error });
    }
});

// 🔐 User Signup
app.post("/auth/signup", async (req, res) => {
    const { username, password } = req.body;
    try {
        const existingUser = await User.findOne({ username });
        if (existingUser) return res.status(400).json({ message: "User already exists." });

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ username, password: hashedPassword });
        await newUser.save();
        res.status(201).json({ message: "User registered successfully!" });
    } catch (error) {
        console.error("❌ Signup error:", error);
        res.status(500).json({ message: "Server error", error });
    }
});

// ✅ Validate Token Route
app.get("/auth/validate", (req, res) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ valid: false, message: "No token provided" });

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) return res.status(401).json({ valid: false, message: "Invalid token" });
        res.json({ valid: true, user: decoded });
    });
});

// 🔄 Get Room Cleaning Status
app.get("/logs/status", async (req, res) => {
    try {
        const logs = await CleaningLog.find();
        let status = {};

        // ✅ Process logs first
        logs.forEach(log => {
            status[log.roomNumber] = log.finishTime ? "finished" : "in_progress";
        });

        // ✅ Ensure all rooms have a default status (Room 1 to 20)
        const allRooms = [...Array(20).keys()].map(i => i + 1);
        allRooms.forEach(room => {
            if (!status[room]) {
                status[room] = "not_started"; // Default status
            }
        });

        // ✅ Send response after processing all data
        res.json(status);

    } catch (error) {
        console.error("❌ Error fetching room status:", error);
        res.status(500).json({ message: "Server error", error });
    }
});


// 🚀 Start Cleaning
app.post("/logs/start", async (req, res) => {
    console.log("📥 Start Cleaning Request:", req.body);
    let { roomNumber, username } = req.body;
    const startTime = new Date().toLocaleString("en-US", { timeZone: "Asia/Phnom_Penh" });

    if (!roomNumber || !username) {
        console.error("❌ Missing required fields:", req.body);
        return res.status(400).json({ message: "Missing required fields" });
    }

    roomNumber = parseInt(roomNumber, 10); // Convert to number ✅

    try {
        await CleaningLog.updateOne(
            { roomNumber },
            { $set: { startTime, startedBy: username, finishTime: null, finishedBy: null } },
            { upsert: true }
        );

        io.emit("update", { roomNumber, status: "in_progress" });
        res.status(201).json({ message: `Room ${roomNumber} started by ${username} at ${startTime}` });
    } catch (error) {
        console.error("❌ Start Cleaning Error:", error);
        res.status(500).json({ message: "Server error", error });
    }
});

// ✅ Finish Cleaning
app.post("/logs/finish", async (req, res) => {
    console.log("📥 Received Finish Request:", req.body);

    let { roomNumber, username, finishTime, status } = req.body;

    if (!roomNumber || !username || !finishTime || !status) {
        console.error("❌ Missing required fields:", req.body);
        return res.status(400).json({ message: "Missing required fields" });
    }

    roomNumber = parseInt(roomNumber, 10); // Convert to number ✅

    try {
        console.log(`🔍 Checking for unfinished log for Room ${roomNumber}...`);
        const log = await CleaningLog.findOne({ roomNumber, finishTime: null });
        if (!log) {
            console.warn(`⚠️ Log not found or already finished for Room ${roomNumber}`);
            return res.status(400).json({ message: "Log not found or already finished" });
        }

        // ✅ Updating the log with finish details
        log.finishTime = finishTime;
        log.finishedBy = username;
        await log.save();

        console.log(`✅ Room ${roomNumber} finished by ${username} at ${finishTime}`);

        // ✅ Notify other clients via WebSocket
        io.emit("update", { roomNumber, status: "finished" });

        res.status(200).json({ message: `Room ${roomNumber} finished by ${username}` });
    } catch (error) {
        console.error("❌ Finish Cleaning Error:", error);
        res.status(500).json({ message: "Server error", error });
    }
});

// 📄 Get All Cleaning Logs
app.get("/logs", async (req, res) => {
    try {
        const logs = await CleaningLog.find();
        res.json(logs);
    } catch (error) {
        res.status(500).json({ message: "Server error", error });
    }
});

app.post("/logs/clear", async (req, res) => {
    try {
        await CleaningLog.deleteMany({}); // Deletes all logs
        io.emit("clearLogs"); // Notify all clients
        res.status(200).json({ message: "All logs cleared" });
    } catch (error) {
        console.error("❌ Error clearing logs:", error);
        res.status(500).json({ message: "Server error", error });
    }
});


// 🏠 Home Route
app.get("/", (req, res) => {
    res.send("Housekeeping Management API is Running 🚀");
});

// ✅ Start Server
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
});

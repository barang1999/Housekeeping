require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// ✅ Initialize Express
const app = express();
app.use(express.json());

// ✅ CORS Configuration (Fixed Redundancies)
app.use(cors({
    origin: "https://housekeepingmanagement.netlify.app",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true  
}));

// ✅ Create HTTP & WebSocket Server (Fixed Duplicate Server Issue)
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "https://housekeepingmanagement.netlify.app",
        methods: ["GET", "POST"]
    }
});

// ✅ Ensure MongoDB URI Exists
const mongoURI = process.env.MONGO_URI;
if (!mongoURI) {
    console.error("❌ MONGO_URI is missing. Check your .env file!");
    process.exit(1);
}
console.log("🔍 Connecting to MongoDB...");

// ✅ MongoDB Connection with Retry Limit
let retryAttempts = 0;
const MAX_RETRIES = 5;

const connectWithRetry = () => {
    mongoose.connect(mongoURI)
        .then(() => console.log("✅ MongoDB Connected Successfully"))
        .catch(err => {
            if (retryAttempts >= MAX_RETRIES) {
                console.error("❌ Max retries reached. Manual restart required.");
                return;
            }
            retryAttempts++;
            console.error(`❌ MongoDB connection error: ${err}. Retrying ${retryAttempts}/${MAX_RETRIES}...`);
            setTimeout(connectWithRetry, 5000);
        });
};
connectWithRetry();

// ✅ MongoDB Reconnection Handling
mongoose.connection.on("disconnected", () => {
    console.warn("⚠ MongoDB Disconnected. Attempting Reconnect...");
    connectWithRetry();
});

// ✅ Define MongoDB User Schema
const userSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    refreshToken: { type: String }
});
const User = mongoose.model("User", userSchema);

// ✅ WebSocket Authentication Middleware
io.use(async (socket, next) => {
    try {
        let token = socket.handshake.auth?.token || socket.handshake.headers.authorization?.split(" ")[1];
        if (!token) throw new Error("No token provided");

        let decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findOne({ username: decoded.username });

        if (!user) throw new Error("User not found");

        socket.user = decoded;
        console.log(`✅ WebSocket Authenticated: ${decoded.username}`);
        next();
    } catch (err) {
        console.warn(`❌ WebSocket Authentication Failed: ${err.message}`);
        next(new Error("Authentication error"));
    }
});

io.on("connection", (socket) => {
    console.log(`⚡ WebSocket Client Connected: ${socket.user?.username || "Unknown User"}`);
    socket.on("disconnect", (reason) => {
        console.log(`🔴 Client Disconnected: ${socket.user?.username || "Unknown User"} - ${reason}`);
    });
});

// ✅ User Signup (Fixed Duplicate User Check)
app.post("/auth/signup", async (req, res) => {
    const { username, password } = req.body;
    try {
        if (await User.findOne({ username })) {
            return res.status(400).json({ message: "User already exists." });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        await new User({ username, password: hashedPassword }).save();
        res.status(201).json({ message: "User registered successfully!" });
    } catch (error) {
        console.error("❌ Signup Error:", error);
        res.status(500).json({ message: "Server error", error });
    }
});

// ✅ Login Route
app.post("/auth/login", async (req, res) => {
    const { username, password } = req.body;
    try {
        if (!username || !password) {
            return res.status(400).json({ message: "Missing username or password" });
        }

        if (mongoose.connection.readyState !== 1) {
            return res.status(500).json({ message: "Database not connected" });
        }

        const user = await User.findOne({ username });
        if (!user) {
            console.warn(`❌ Login Failed: User not found - ${username}`);
            return res.status(401).json({ message: "Invalid username or password" });
        }

        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            console.warn(`❌ Login Failed: Incorrect password for ${username}`);
            return res.status(401).json({ message: "Invalid username or password" });
        }

        // ✅ Generate JWT token
        const token = jwt.sign({ username: user.username }, process.env.JWT_SECRET, { expiresIn: "1h" });
        const refreshToken = jwt.sign({ username: user.username }, process.env.JWT_REFRESH_SECRET, { expiresIn: "7d" });

        user.refreshToken = refreshToken;
        await user.save();

        console.log(`✅ Login successful for: ${username}`);
        res.json({ message: "Login successful", token, refreshToken, username });
    } catch (error) {
        console.error("❌ Server Error on Login:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// ✅ Refresh Token Handling (Fixed Missing User Check)
app.post("/auth/refresh", async (req, res) => {
    const { refreshToken } = req.body;
    try {
        if (!refreshToken) return res.status(401).json({ message: "No refresh token provided" });

        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
        const user = await User.findOne({ username: decoded.username, refreshToken });

        if (!user) return res.status(403).json({ message: "Invalid refresh token" });

        const newAccessToken = jwt.sign({ username: user.username }, process.env.JWT_SECRET, { expiresIn: "1h" });
        const newRefreshToken = jwt.sign({ username: user.username }, process.env.JWT_REFRESH_SECRET, { expiresIn: "7d" });

        user.refreshToken = newRefreshToken;
        await user.save();

        res.json({ token: newAccessToken, refreshToken: newRefreshToken });
    } catch (error) {
        console.error("❌ Refresh Token Error:", error);
        res.status(403).json({ message: "Invalid refresh token" });
    }
});

// ✅ Logout Route
app.post("/auth/logout", async (req, res) => {
    const { username } = req.body;
    try {
        await User.updateOne({ username }, { $unset: { refreshToken: "" } });
        res.json({ message: "✅ Logged out successfully." });
    } catch (error) {
        console.error("❌ Logout Error:", error);
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

        logs.forEach(log => {
            status[log.roomNumber] = log.finishTime ? "finished" : "in_progress";
        });

        // ✅ Ensure all rooms are included (1 to 20)
        for (let room = 1; room <= 20; room++) {
            if (!status[room]) {
                status[room] = "not_started";
            }
        }

        res.json(status);
    } catch (error) {
        console.error("❌ Error fetching room status:", error);
        res.status(500).json({ message: "Server error", error });
    }
});

const router = express.Router();
const CleaningLog = require("../models/CleaningLog"); // Import the model

// ✅ Toggle DND Mode
router.post("/logs/dnd", async (req, res) => {
    try {
        const { roomNumber, status, updatedBy } = req.body;
        
        if (!roomNumber) {
            return res.status(400).json({ message: "Room number is required." });
        }

        const log = await CleaningLog.findOne({ roomNumber });

        if (!log) {
            return res.status(404).json({ message: "Room not found." });
        }

        // ✅ Update DND status
        log.dndStatus = (status === "dnd");
        await log.save();

        // ✅ Emit WebSocket Event to Notify All Users
        app.set("io", io);
        io.emit("dndUpdate", { roomNumber, status });

        res.json({ message: `DND mode ${status} for Room ${roomNumber}`, room: log });

    } catch (error) {
        console.error("❌ Error updating DND status:", error);
        res.status(500).json({ message: "Internal server error." });
    }
});

module.exports = router;

// 🚀 Start Cleaning

app.post("/logs/start", async (req, res) => {
    try {
        let { roomNumber, username } = req.body;
        if (!roomNumber || isNaN(roomNumber)) {
            return res.status(400).json({ message: "❌ Invalid room number" });
        }

        roomNumber = parseInt(roomNumber, 10);

        // ✅ Check if room is already being cleaned
        const existingLog = await CleaningLog.findOne({ roomNumber, finishTime: null });
        if (existingLog) {
            return res.status(400).json({ message: `⚠ Room ${roomNumber} is already being cleaned.` });
        }

        const startTime = new Date().toLocaleString("en-US", { timeZone: "Asia/Phnom_Penh" });

        await CleaningLog.updateOne(
            { roomNumber },
            { $set: { startTime, startedBy: username, finishTime: null, finishedBy: null } },
            { upsert: true }
        );

        if (io) io.emit("update", { roomNumber, status: "in_progress" });

        res.status(201).json({ message: `✅ Room ${roomNumber} started by ${username} at ${startTime}` });

    } catch (error) {
        console.error("❌ Start Cleaning Error:", error);
        res.status(500).json({ message: "Server error", error });
    }
});

// ✅ Finish Cleaning
app.post("/logs/finish", async (req, res) => {
    console.log("📥 Received Finish Request:", req.body);

    let { roomNumber, username, finishTime, status } = req.body;

    if (!roomNumber || !username) {
        console.error("❌ Missing required fields:", req.body);
        return res.status(400).json({ message: "Missing required fields" });
    }

    roomNumber = parseInt(roomNumber, 10); // Convert to number ✅
    finishTime = finishTime || new Date().toLocaleString("en-US", { timeZone: "Asia/Phnom_Penh" });
    status = status || "finished";

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
        io.emit("update", { roomNumber, status });

        res.status(200).json({ message: `Room ${roomNumber} finished by ${username}` });
    } catch (error) {
        console.error("❌ Finish Cleaning Error:", error);
        res.status(500).json({ message: "Server error", error });
    }
});

const logSchema = new mongoose.Schema({
    roomNumber: { type: Number, required: true },
    startTime: { type: String, default: null },
    startedBy: { type: String, default: null },
    finishTime: { type: String, default: null },
    finishedBy: { type: String, default: null },
    dndStatus: { type: Boolean, default: false }
});

const CleaningLog = mongoose.model("CleaningLog", logSchema);
module.exports = CleaningLog;

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

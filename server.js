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
    origin: "https://housekeepingmanagement.netlify.app",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true  // ✅ Allow cookies & authentication headers
}));

// ✅ Create HTTP & WebSocket Server
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "https://housekeepingmanagement.netlify.app",
        methods: ["GET", "POST"]
    }
});

// ✅ Ensure Express handles preflight requests properly
app.options("*", cors());

// ✅ Middleware to handle headers for CORS manually (optional)
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Credentials", "true");
    next();
});

// ✅ Create HTTP & WebSocket Server
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "https://housekeepingmanagement.netlify.app",
        methods: ["GET", "POST"]
    }
});

// ✅ Define MongoDB Schemas
const userSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    refreshToken: { type: String }
});

const User = mongoose.model("User", userSchema);

/// ✅ WebSocket Connection Authentication (Fix Applied)
io.use(async (socket, next) => {
    let token = socket.handshake.auth?.token || 
                (socket.handshake.headers.authorization ? socket.handshake.headers.authorization.split(" ")[1] : null);

    if (!token) {
        console.warn("❌ WebSocket Authentication Failed: No token provided.");
        return next(new Error("Authentication error: No token provided"));
    }

    try {
        let decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (!decoded || !decoded.username) throw new Error("Invalid token structure");

        const user = await User.findOne({ username: decoded.username }).catch(err => {
            console.error("❌ Error finding user in DB:", err);
            return next(new Error("Database error"));
        });

        if (!user) {
            console.warn("❌ User not found for token. Disconnecting...");
            return next(new Error("User not found"));
        }

        socket.user = decoded;
        console.log(`✅ WebSocket Authenticated: ${decoded.username}`);
        next();
    } catch (err) {
        console.warn("❌ WebSocket Authentication Failed:", err.message);
        return next(new Error("Authentication error: Invalid or expired token"));
    }
});

io.on("connection", (socket) => {
    const username = socket.user?.username || "Unknown User";  // ✅ Prevents crash
    console.log(`⚡ New WebSocket client connected: ${username}`);
    socket.emit("connected", { message: "WebSocket authenticated successfully", user: socket.user });

    socket.on("disconnect", (reason) => {
        console.log(`🔴 WebSocket client disconnected: ${username}, Reason: ${reason}`);
    });
});

// ✅ Connect to MongoDB (Updated - No deprecated options)
const connectWithRetry = () => {
    mongoose.connect(mongoURI)
        .then(() => console.log("✅ MongoDB Connected Successfully"))
        .catch(err => {
            console.error("❌ MongoDB connection error:", err);
            console.log("Retrying in 5 seconds...");
            setTimeout(connectWithRetry, 5000);
        });
};
connectWithRetry();

mongoose.connection.on("disconnected", async () => {
    console.warn("⚠ MongoDB Disconnected. Retrying in 5 seconds...");
    await new Promise(resolve => setTimeout(resolve, 5000));
    try {
        await mongoose.connect(mongoURI);
        console.log("✅ MongoDB Reconnected Successfully.");
    } catch (error) {
        console.error("❌ MongoDB Reconnection Failed:", error);
    }
});


// ✅ Authentication Routes

app.post("/auth/login", async (req, res) => {
    const { username, password } = req.body;

    console.log("🟢 Login request received for:", username);

    const user = await User.findOne({ username });

    if (!user) {
        console.warn("❌ User not found:", username);
        return res.status(401).json({ message: "Invalid username or password" });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
        console.warn("❌ Incorrect password for user:", username);
        return res.status(401).json({ message: "Invalid username or password" });
    }

    // ✅ Generate JWT token
    const token = jwt.sign({ username: user.username }, process.env.JWT_SECRET, { expiresIn: "1h" });
    const refreshToken = jwt.sign({ username: user.username }, process.env.JWT_REFRESH_SECRET, { expiresIn: "7d" });

    user.refreshToken = refreshToken;
    await user.save();

    console.log("✅ Login successful for user:", username);
    res.json({ message: "Login successful", token, refreshToken, username: user.username });
});

let isRefreshing = false;  // ✅ Prevent multiple refresh calls

app.post("/auth/refresh", async (req, res) => {
    if (isRefreshing) {
        return res.status(429).json({ message: "Too many requests. Please wait." });
    }
    isRefreshing = true;

    try {
        const { refreshToken } = req.body;
        if (!refreshToken) {
            isRefreshing = false;
            return res.status(401).json({ message: "No refresh token provided" });
        }

        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
        const user = await User.findOne({ username: decoded.username, refreshToken });

        if (!user) {
            isRefreshing = false;
            return res.status(403).json({ message: "Invalid or expired refresh token" });
        }

        const newAccessToken = jwt.sign({ username: user.username }, process.env.JWT_SECRET, { expiresIn: "1h" });
        const newRefreshToken = jwt.sign({ username: user.username }, process.env.JWT_REFRESH_SECRET, { expiresIn: "7d" });

        user.refreshToken = newRefreshToken;
        await user.save();

        isRefreshing = false;
        res.json({ token: newAccessToken, refreshToken: newRefreshToken });

    } catch (error) {
        isRefreshing = false;
        console.error("❌ Refresh token verification failed:", error.message);
        res.status(403).json({ message: "Invalid or expired refresh token" });
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

app.post("/auth/logout", async (req, res) => {
    try {
        const { username } = req.body;
        if (!username) return res.status(400).json({ message: "Username required for logout." });

        await User.updateOne({ username }, { $unset: { refreshToken: "" } });

        res.json({ message: "✅ Logged out successfully." });
    } catch (error) {
        console.error("❌ Logout error:", error);
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
    roomNumber: Number,
    startTime: String,
    startedBy: String,
    finishTime: String,
    finishedBy: String
});
const CleaningLog = mongoose.model("CleaningLog", logSchema);

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

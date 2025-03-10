require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const RoomDND = require("./RoomDND"); // ✅ Ensure RoomDND is imported

// ✅ Initialize Express
const app = express();
app.use(express.json());
app.use(cors());

// ✅ Load MongoDB URI
const mongoURI = process.env.MONGO_URI;

if (!mongoURI) {
    console.error("❌ MONGO_URI is missing. Check your .env file!");
    process.exit(1);
}

// ✅ Connect to MongoDB using Mongoose (SINGLE Connection)
mongoose.connect(mongoURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log("✅ MongoDB Connected Successfully"))
.catch(err => console.error("❌ MongoDB connection error:", err));

// ✅ Handle MongoDB Disconnection & Reconnect
mongoose.connection.on("disconnected", () => {
    console.warn("⚠️ MongoDB Disconnected. Attempting Reconnect...");
    mongoose.connect(mongoURI, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    }).catch(err => console.error("❌ MongoDB reconnection failed:", err));
});

// ✅ Define User Schema & Model
const userSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    refreshToken: { type: String }
});
const User = mongoose.model("User", userSchema);

// ✅ CORS Configuration
app.use(cors({
    origin: "https://housekeepingmanagement.netlify.app",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true  
}));

// ✅ Create HTTP & WebSocket Server
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "https://housekeepingmanagement.netlify.app",
        methods: ["GET", "POST"]
    }
});

// ✅ WebSocket Authentication Middleware
io.use(async (socket, next) => {
    try {
        let token = socket.handshake.auth?.token || 
                    socket.handshake.headers.authorization?.split(" ")[1];

        if (!token) {
            console.warn("⚠ No token provided for WebSocket authentication.");
            return next(new Error("Authentication error"));
        }

        let decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findOne({ username: decoded.username });

        if (!user) {
            console.warn("⚠ WebSocket authentication failed: User not found");
            return next(new Error("Authentication error"));
        }

        socket.user = decoded;
        console.log(`✅ WebSocket Authenticated: ${decoded.username}`);
        next();
    } catch (err) {
        console.warn(`❌ WebSocket Authentication Failed: ${err.message}`);
        next(new Error("Authentication error"));
    }
});

io.on("connection", (socket) => {
    console.log(`⚡ WebSocket Client Connected: ${socket.id}`);

    // Verify if the client is authenticated
    if (!socket.user) {
        console.warn("❌ Unauthorized WebSocket Connection Attempt");
        socket.disconnect(true);
        return;
    }

    console.log(`🔐 WebSocket Authenticated: ${socket.user.username}`);

    socket.on("requestDNDStatus", async () => {
        const dndLogs = await RoomDND.find({}, "roomNumber dndStatus").lean();
        socket.emit("dndUpdate", { roomNumber: "all", status: "available", dndLogs });
    });
    
    socket.on("dndUpdate", async ({ roomNumber, status }) => {
        if (!roomNumber) {
            console.warn("⚠️ Invalid DND update request");
            return;
        }

        console.log(`📡 Broadcasting DND update for Room ${roomNumber} -> ${status}`);

        // ✅ Update database
        await RoomDND.findOneAndUpdate(
            { roomNumber },
            { $set: { dndStatus: status === "dnd" } },
            { upsert: true }
        );

        // ✅ Fetch **only changed** room instead of all rooms
        const updatedRoom = await RoomDND.findOne({ roomNumber }, "roomNumber dndStatus").lean();

        if (!updatedRoom) {
            console.warn(`⚠️ Room ${roomNumber} not found in database`);
            return;
        }

        // ✅ Ensure `dndLogs` is always an array with at least the updated room
        const dndLogs = [updatedRoom];

        // ✅ Send only the changed room
        io.emit("dndUpdate", { roomNumber, status, dndLogs: [updatedRoom] });

        console.log(`✅ Room ${roomNumber} DND Updated -> Status: ${status}`);
    });

    // ✅ Handle Cleaning Reset
    socket.on("resetCleaning", ({ roomNumber }) => {
        if (!roomNumber) {
            console.warn("⚠️ Invalid Cleaning Reset request");
            return;
        }
        console.log(`🔄 Cleaning Reset Event Received for Room ${roomNumber}`);
        io.emit("resetCleaning", { roomNumber, status: "available" });
    });

    socket.on("disconnect", (reason) => {
        console.warn(`🔴 WebSocket Client Disconnected: ${reason}`);
    });
});

// ✅ Store `io` in Express
app.set("io", io);


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
            if (log.finishTime) {
                status[log.roomNumber] = "finished";
            } else if (log.startTime) {
                status[log.roomNumber] = "in_progress";
            } else {
                status[log.roomNumber] = "not_started";
            }
        });

        res.json(status);
    } catch (error) {
        console.error("❌ Error fetching room status:", error);
        res.status(500).json({ message: "Server error", error });
    }
});

const router = express.Router();

app.post("/logs/dnd", async (req, res) => {
    try {
        const { roomNumber, status } = req.body;

        if (!roomNumber) {
            return res.status(400).json({ message: "Room number is required." });
        }

        const isDND = status === "dnd";

        // ✅ Debugging Log
        console.log(`🔍 Incoming DND Update -> Room: ${roomNumber}, Status: ${status}`);

        // ✅ Ensure RoomDND is properly updated
        const updatedRoom = await RoomDND.findOneAndUpdate(
            { roomNumber },
            { $set: { dndStatus: isDND } },
            { upsert: true, new: true }
        );

        console.log(`✅ Room ${roomNumber} DND mode updated -> ${status}`);

        // ✅ Broadcast WebSocket Event
        io.emit("dndUpdate", { roomNumber, status });

        res.json({ message: `DND mode ${status} for Room ${roomNumber}`, updatedRoom });
    } catch (error) {
        console.error("❌ Error updating DND status:", error);
        res.status(500).json({ message: "Internal server error." });
    }
});

module.exports = router;

app.get("/logs/dnd", async (req, res) => {
    try {
        console.log("🔄 Fetching latest DND statuses...");
        const dndLogs = await RoomDND.find({}, "roomNumber dndStatus").lean();

        if (!dndLogs || dndLogs.length === 0) {
            return res.json([]); // Return empty array if no logs
        }

        console.log("✅ Successfully fetched DND logs:", dndLogs);
        res.json(dndLogs);
    } catch (error) {
        console.error("❌ Error fetching DND statuses:", error);
        res.status(500).json({ message: "Internal server error." });
    }
});


// ✅ Reset Cleaning Status When DND is Turned Off
app.post("/logs/reset-cleaning", async (req, res) => {
    try {
        let { roomNumber } = req.body;

        if (!roomNumber || isNaN(roomNumber)) {
            return res.status(400).json({ message: "Room number must be a valid number." });
        }

        roomNumber = parseInt(roomNumber, 10); // Convert to a number

        console.log(`🔄 Resetting cleaning status for Room ${roomNumber}...`);

        // ✅ Fetch log without modifying DND mode
        const existingLog = await CleaningLog.findOne({ roomNumber });

        if (!existingLog) {
            console.warn(`⚠️ Room ${roomNumber} not found in logs. Cannot reset.`);
            return res.status(400).json({ message: `Room ${roomNumber} not found in logs.` });
        }

        // ✅ Only reset cleaning status (Do NOT change DND mode)
        await CleaningLog.updateOne(
            { _id: existingLog._id },
            {
                $set: {
                    startTime: null,
                    finishTime: null,
                    startedBy: null,
                    finishedBy: null,
                    status: "available"
                }
            }
        );

        console.log(`✅ Cleaning status reset successfully for Room ${roomNumber}.`);

        io.emit("resetCleaning", { roomNumber, status: "available" });

        res.json({ message: `✅ Cleaning status reset for Room ${roomNumber}` });

    } catch (error) {
        console.error("❌ Error resetting cleaning status:", error);
        res.status(500).json({ message: "Internal server error", error: error.message });
    }
});


// ✅ Graceful Shutdown: Close DB Connection on Exit
process.on("SIGINT", async () => {
    if (db) {
        console.log("🔴 Closing MongoDB Client Connection...");
        await db.close();
    }
    console.log("🔴 Closing Mongoose Connection...");
    await mongoose.connection.close();
    process.exit(0);
});


// 🚀 Start Cleaning

app.post("/logs/start", async (req, res) => {
    try {
        let { roomNumber, username } = req.body;
        if (!roomNumber || isNaN(roomNumber) || !username ) {
            return res.status(400).json({ message: "❌ Invalid room number" });
        }

        roomNumber = parseInt(roomNumber, 10);

        const existingLog = await CleaningLog.findOne({ roomNumber, finishTime: null });
        if (existingLog) {
            return res.status(400).json({ message: `⚠ Room ${roomNumber} is already being cleaned.` });
        }

        const startTime = new Date().toLocaleString("en-US", { timeZone: "Asia/Phnom_Penh" });

        const log = await CleaningLog.findOneAndUpdate(
            { roomNumber },
            { $set: { startTime, startedBy: username, finishTime: null, finishedBy: null, status: "in_progress" } },
            { upsert: true, new: true }
        );
        
        if (!log) {
            return res.status(500).json({ message: "Database update failed." });
        }

       // ✅ Emit event only after successful DB update
        io.emit("roomUpdate", { roomNumber, status: "in_progress", previousStatus: "available" });

        res.status(201).json({ message: `✅ Room ${roomNumber} started by ${username} at ${startTime}` });

    } catch (error) {
        console.error("❌ Start Cleaning Error:", error);
        res.status(500).json({ message: "Server error", error });
    }
});

// ✅ Finish Cleaning - FIXED
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
        
        // ✅ Fetch log to get previousStatus before updating
        const log = await CleaningLog.findOne({ roomNumber, finishTime: null });
        
        if (!log) {
            console.warn(`⚠️ Log not found or already finished for Room ${roomNumber}`);
            return res.status(400).json({ message: "Log not found or already finished" });
        }

        // ✅ Capture previous status before updating
        let previousStatus = log.startTime ? "in_progress" : "available";

        // ✅ Update Cleaning Log in Database
        const updatedLog = await CleaningLog.findOneAndUpdate(
            { roomNumber, finishTime: null },
            {
                $set: {
                    finishTime,
                    finishedBy: username,
                    status: "finished"
                }
            },
            { new: true }
        );

        if (!updatedLog) {
            console.error("❌ Database update failed.");
            return res.status(500).json({ message: "Failed to update cleaning status." });
        }

        console.log(`✅ Room ${roomNumber} finished by ${username} at ${finishTime}`);

        // ✅ Notify all WebSocket clients
        io.emit("roomUpdate", { roomNumber, status: "finished", previousStatus });

        res.status(200).json({ message: `Room ${roomNumber} finished by ${username}` });

    } catch (error) {
        console.error("❌ Finish Cleaning Error:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
});
const logSchema = new mongoose.Schema({
    roomNumber: { type: Number, required: true }, // ✅ Ensure roomNumber is a Number
    startTime: { type: String, default: null },
    startedBy: { type: String, default: null },
    finishTime: { type: String, default: null },
    finishedBy: { type: String, default: null },
    dndStatus: { type: Boolean, default: false }, // ✅ DND Mode
    status: { type: String, default: "available" }
});

// ✅ Ensure model is only defined once
const CleaningLog = mongoose.models.CleaningLog || mongoose.model("CleaningLog", logSchema);

module.exports = CleaningLog;

async function fixRoomNumbers() {
    try {
        console.log("🔄 Fixing room number formats in database...");
        const logs = await CleaningLog.find();
        let updatedCount = 0;

        for (let log of logs) {
            if (typeof log.roomNumber !== "number" || isNaN(log.roomNumber)) {
                log.roomNumber = parseInt(log.roomNumber, 10);

                if (!isNaN(log.roomNumber)) { // Ensure it's a valid number
                    await log.save();
                    updatedCount++;
                    console.log(`✅ Updated Room: ${log.roomNumber}`);
                } else {
                    console.warn(`⚠️ Skipping invalid room number: ${log.roomNumber}`);
                }
            }
        }

        console.log(`✅ Fixed ${updatedCount} room numbers successfully.`);
    } catch (error) {
        console.error("❌ Error fixing room numbers:", error);
    }
}

// ✅ Run this function AFTER connecting to MongoDB
mongoose.connection.once("open", async () => {
    console.log("✅ Database connected. Running room number fix...");
    await fixRoomNumbers();
});

app.get("/logs", async (req, res) => {
    try {
        const logs = await CleaningLog.find();

        // ✅ Print logs to check stored room number format
        console.log("🔍 Logs from Database:", logs.map(log => ({ roomNumber: log.roomNumber, status: log.status })));

        // ✅ Ensure all room numbers are returned as numbers
        const fixedLogs = logs.map(log => ({
            ...log.toObject(),
            roomNumber: Number(log.roomNumber) // ✅ Force Number
        }));

        res.json(fixedLogs);
    } catch (error) {
        res.status(500).json({ message: "Server error", error });
    }
});

app.post("/logs/clear", async (req, res) => {
    try {
        console.log("🧹 Clearing all cleaning logs and DND statuses...");

        // ✅ Clear Cleaning Logs
        await CleaningLog.deleteMany({});

        // ✅ Reset DND Status for All Rooms
        await RoomDND.updateMany({}, { $set: { dndStatus: false } });

        console.log("✅ All logs and DND statuses reset.");

        // ✅ Fetch latest DND statuses
        const dndLogs = await RoomDND.find({}, "roomNumber dndStatus").lean();

        // ✅ Broadcast WebSocket Event
        io.emit("clearLogs");
        io.emit("dndUpdate", { roomNumber: "all", status: "available", dndLogs });

        res.json({ message: "All cleaning logs and DND statuses cleared.", dndLogs });
    } catch (error) {
        console.error("❌ Error clearing logs:", error);
        res.status(500).json({ message: "Internal server error." });
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

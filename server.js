require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const axios = require("axios");
const telegramRoutes = require("./telegram.js");

const RoomDND = require("./RoomDND"); // ✅ Ensure RoomDND is imported
const allowedOrigins = ["https://housekeepingmanagement.netlify.app"]; // Add your frontend domain

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID; // Replace with your Telegram chat ID




// ✅ Initialize Express
const app = express();
app.use(express.json());
app.use(cors());
app.use("/api", telegramRoutes); // ✅ Add this line

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

const prioritySchema = new mongoose.Schema({
    roomNumber: { type: String, required: true, unique: true },
    priority: { type: String, default: "default" }
});
const RoomPriority = mongoose.model("RoomPriority", prioritySchema);


// ✅ CORS Configuration
app.use(cors({
    origin: "https://housekeepingmanagement.netlify.app",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,  
    allowedHeaders: ["Content-Type", "Authorization"],
}));

app.options("*", cors()); // Allow preflight requests

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

    dndLogs.forEach(dnd => {
        socket.emit("dndUpdate", {
            roomNumber: dnd.roomNumber,
            status: dnd.dndStatus ? "dnd" : "available"
        });
    });

    console.log("✅ Sent DND status updates for individual rooms.");
});

socket.on("requestPriorityStatus", async () => {
    try {
        const priorities = await RoomPriority.find({}, "roomNumber priority").lean();
        
        if (!priorities || priorities.length === 0) {
            console.warn("⚠️ No priorities found in database. Sending empty list.");
            socket.emit("priorityStatus", []);
            return;
        }

        // ✅ Ensure roomNumber is always sent as a string
        const formattedPriorities = priorities.map(p => ({
            roomNumber: String(p.roomNumber), // Force roomNumber to string
            priority: p.priority
        }));

        socket.emit("priorityStatus", formattedPriorities);
        console.log("✅ Sent priority statuses to client:", formattedPriorities);
    } catch (error) {
        console.error("❌ Error sending priority statuses:", error);
    }
});


socket.on("priorityUpdate", async ({ roomNumber, priority }) => {
    try {
        console.log(`📡 Received priorityUpdate -> Room: ${roomNumber}, Priority: ${priority}`);

        await RoomPriority.findOneAndUpdate(
            { roomNumber: String(roomNumber) }, // ✅ Ensure it's stored as a string
            { priority },
            { upsert: true, new: true }
        );

        // ✅ Ensure all clients receive the event
        io.emit("priorityUpdate", { roomNumber: String(roomNumber), priority });

        console.log(`✅ Priority update sent to all clients for Room ${roomNumber}`);
    } catch (error) {
        console.error("❌ Error updating priority:", error);
    }
});

    
socket.on("dndUpdate", async ({ roomNumber, status }) => {
    try {
        if (!roomNumber) {
            console.warn("⚠️ Invalid DND update request. Skipping...");
            return;
        }

        console.log(`📡 Processing DND update for Room ${roomNumber} -> ${status}`);

        // ✅ Update the DND status in the database
        const updatedRoom = await RoomDND.findOneAndUpdate(
            { roomNumber },
            { $set: { dndStatus: status === "dnd" } },
            { upsert: true, new: true }
        );

        if (!updatedRoom) {
            console.warn(`⚠️ Room ${roomNumber} not found in database. Skipping update.`);
            return;
        }

        // ✅ Emit WebSocket event only for this specific room
        io.emit("dndUpdate", {
            roomNumber: updatedRoom.roomNumber,
            status: updatedRoom.dndStatus ? "dnd" : "available"
        });

        console.log(`✅ Successfully processed DND update for Room ${roomNumber}`);

    } catch (error) {
        console.error("❌ Error processing DND update:", error);
    }
});

    // ✅ Handle Cleaning Reset
    socket.on("resetCleaning", async ({ roomNumber }) => {
    if (!roomNumber) {
        console.warn("⚠️ Invalid Cleaning Reset request");
        return;
    }

    console.log(`🔄 Checking if Room ${roomNumber} exists...`);
    const roomExists = await CleaningLog.findOne({ roomNumber });

    if (!roomExists) {
        console.warn(`⚠️ Room ${roomNumber} does not exist in the database.`);
        return;
    }

    console.log(`✅ Resetting Cleaning Status for Room ${roomNumber}`);
    io.emit("resetCleaning", { roomNumber, status: "available" });
});

    socket.on("disconnect", (reason) => {
        console.warn(`🔴 WebSocket Client Disconnected: ${reason}`);
        socket.removeAllListeners(); // ✅ Removes all event listeners
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

        console.log("📌 Backend Sending Room Statuses:", status);
        res.json(status);
    } catch (error) {
        console.error("❌ Error fetching room status:", error);
        res.status(500).json({ message: "Server error", error });
    }
});

app.get("/logs/priority", async (req, res) => {
    try {
        const priorities = await RoomPriority.find({}, "roomNumber priority").lean();

        if (!priorities || priorities.length === 0) {
            console.warn("⚠️ No priorities found in database. Returning default values.");
            return res.json([]);
        }

        // ✅ Ensure all roomNumbers are strings
        const formattedPriorities = priorities.map(p => ({
            roomNumber: String(p.roomNumber), 
            priority: p.priority
        }));

        res.json(formattedPriorities);
        console.log("✅ Returning priority data:", formattedPriorities);
    } catch (error) {
        console.error("❌ Error fetching priorities:", error);
        res.status(500).json({ message: "Server error", error });
    }
});

app.post("/logs/priority", async (req, res) => {
    try {
        const { roomNumber, priority } = req.body;
        if (!roomNumber || !priority) {
            return res.status(400).json({ message: "Room number and priority are required." });
        }
        await RoomPriority.findOneAndUpdate(
            { roomNumber },
            { priority },
            { upsert: true, new: true }
        );
        io.emit("priorityUpdate", { roomNumber, priority });
        res.json({ message: "Priority updated successfully" });
    } catch (error) {
        res.status(500).json({ message: "Server error", error });
    }
});

app.post("/logs/dnd", async (req, res) => {
    try {
        const { roomNumber, status } = req.body;

        if (!roomNumber) {
            return res.status(400).json({ message: "Room number is required." });
        }

        console.log(`🔍 Incoming DND Update -> Room: ${roomNumber}, Status: ${status}`);

        const updatedRoom = await RoomDND.findOneAndUpdate(
            { roomNumber },
            { $set: { dndStatus: status === "dnd" } },
            { upsert: true, new: true }
        );

        if (!updatedRoom) {
            throw new Error(`Update failed for Room ${roomNumber}`);
        }

        // ✅ Emit only the affected room
        io.emit("dndUpdate", { roomNumber, status });

        console.log(`✅ Room ${roomNumber} DND mode updated -> ${status}`);
        res.json({ message: `DND mode ${status} for Room ${roomNumber}`, updatedRoom });
    } catch (error) {
        console.error("❌ Server Error updating DND status:", error);
        res.status(500).json({ message: "Internal server error", error: error.message });
    }
});


app.get("/logs/dnd", async (req, res) => {
    try {
        console.log("🔄 Fetching latest DND statuses...");
        const dndLogs = await RoomDND.find({}, "roomNumber dndStatus").lean();

        if (!dndLogs || dndLogs.length === 0) {
            return res.json([]); // ✅ Always return an array
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

async function sendMessageToTelegram(message) {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    try {
        await axios.post(url, {
            chat_id: TELEGRAM_CHAT_ID,
            text: message
        });
        console.log("✅ Telegram message sent:", message);
    } catch (error) {
        console.error("❌ Error sending Telegram message:", error);
    }
}

// ✅ API Route to Send Telegram Messages
app.post("/send-telegram", async (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: "Message is required" });

    try {
        const response = await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            chat_id: TELEGRAM_CHAT_ID,
            text: message,
        });

        if (response.data.ok) {
            return res.json({ success: true, message: "Message sent to Telegram" });
        } else {
            return res.status(500).json({ error: "Failed to send message to Telegram" });
        }
    } catch (error) {
        console.error("Telegram API Error:", error);
        return res.status(500).json({ error: "Telegram API request failed" });
    }
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
        console.log("🧹 Clearing all cleaning logs, DND statuses, and priorities...");

        // ✅ Clear Cleaning Logs
        await CleaningLog.deleteMany({});

        // ✅ Reset DND Status for All Rooms
        await RoomDND.updateMany({}, { $set: { dndStatus: false } });

        console.log("✅ All logs, DND statuses, and priority selections reset.");

        // ✅ Fetch latest DND statuses
        const dndLogs = await RoomDND.find({}, "roomNumber dndStatus").lean();

        // ✅ Broadcast WebSocket Events
        io.emit("clearLogs");
        io.emit("dndUpdate", { roomNumber: "all", status: "available", dndLogs });

        // ✅ Reset priority dropdowns on all clients
        io.emit("priorityUpdate", { roomNumber: "all", priority: "default" });

        res.json({ message: "All cleaning logs, DND statuses, and priority selections cleared.", dndLogs });
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
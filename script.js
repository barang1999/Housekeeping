const apiUrl = "https://housekeeping-production.up.railway.app";
const token = localStorage.getItem("token");

let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;
window.socket = null;

document.addEventListener("DOMContentLoaded", async () => {
    console.log("🔄 Initializing housekeeping system...");

    await ensureValidToken();
    ensureWebSocketConnection();

    console.log("⏳ Fetching logs...");
    await loadLogs();

    console.log("✅ Logs loaded. Restoring cleaning status...");
    await restoreCleaningStatus();

    console.log("🎯 Cleaning status restored successfully.");

    checkAuth();
    loadRooms();

    const token = localStorage.getItem("token");
    const username = localStorage.getItem("username");

    if (token && username) {
        console.log("✅ Token and username found. Attempting authentication...");
        const validToken = await ensureValidToken();
        
        if (validToken) {
            console.log("✅ Token is valid. Redirecting to dashboard...");
            setTimeout(() => {
                showDashboard(username);
            }, 500);
        } else {
            console.warn("❌ Invalid or expired token. Showing login form.");
            logout();
        }
    } else {
        console.log("❌ No token found. Showing login form.");
        document.getElementById("auth-section").style.display = "block";
        document.getElementById("dashboard").style.display = "none";
    }
});


/** ✅ Improved WebSocket Connection with Proper Handling */
async function connectWebSocket() {
    let token = await ensureValidToken();
    if (!token) {
        console.warn("❌ WebSocket connection aborted: No valid token.");
        return;
    }

    if (window.socket) {
        window.socket.disconnect();
    }

    window.socket = io(apiUrl, {
        auth: { token },
        reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
        timeout: 5000
    });

    window.socket.on("connect", () => {
        console.log("✅ WebSocket connected successfully.");
        reconnectAttempts = 0;
    });

    window.socket.on("connect_error", async (err) => {
        console.warn("❌ WebSocket connection error:", err.message);
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttempts++;
            await new Promise(res => setTimeout(res, 2000)); // Wait before retrying
            
            const refreshedToken = await refreshToken();
            if (refreshedToken) {
                console.log("🔄 Using refreshed token for WebSocket reconnection...");
                window.socket.auth = { token: refreshedToken };
                window.socket.connect();
            } else {
                console.error("🔴 Max reconnect attempts reached. WebSocket disabled.");
                window.socket = null;
                logout();
            }
        }
    });

    window.socket.on("disconnect", (reason) => {
        console.warn("🔴 WebSocket disconnected:", reason);
        if (reason !== "io client disconnect") {
            console.log("🔄 Attempting WebSocket reconnect...");
            setTimeout(connectWebSocket, 5000);
        }
    });
}

    /if (!window.socket.hasListeners("roomUpdate")) {
    window.socket.on("roomUpdate", async ({ roomNumber, status, previousStatus }) => {
        console.log(`📡 WebSocket: Room ${roomNumber} status updated to ${status}`);
        
        updateRoomUI(roomNumber, status, previousStatus || "available");
        await loadLogs();
        updateButtonStatus(roomNumber, status);
    });
}

}

/** ✅ Ensure WebSocket Connection is Available Before Emitting Events */
function safeEmit(event, data = {}) {
    if (!window.socket || !window.socket.connected) {
        console.warn("⛔ WebSocket is not connected. Attempting reconnect...");
        connectWebSocket();
        return;
    }
    console.log(`📡 Emitting event: ${event}`, data);
    window.socket.emit(event, data);
}


/** ✅ Ensure WebSocket is Properly Connected Before Usage */
function ensureWebSocketConnection() {
    if (!window.socket || !window.socket.connected) {
        console.warn("⛔ WebSocket is not connected. Attempting reconnect...");
        
        connectWebSocket();
        
        setTimeout(() => {
            if (!window.socket || !window.socket.connected) {
                console.error("⛔ WebSocket reconnection failed.");
            } else {
                console.log("✅ WebSocket reconnected successfully.");
            }
        }, 2000);
    }
}

// ✅ Ensure buttons update after logs are loaded
async function updateButtonsFromLogs() {
    console.log("🔄 Updating button status from logs...");

    const logs = await fetchWithErrorHandling(`${apiUrl}/logs`);
    if (!logs || !Array.isArray(logs)) {
        console.warn("⚠️ No valid logs found. Skipping button updates.");
        return;
    }

    logs.forEach(log => {
        const roomNumber = log.roomNumber.toString().padStart(3, '0');
        const status = log.status || "pending";

        updateButtonStatus(roomNumber, status);
    });

    console.log("✅ Buttons updated based on logs.");
}


async function fetchWithErrorHandling(url, options = {}) {
    try {
        console.log(`🔍 Fetching: ${url}`);
        const res = await fetch(url, options);

        if (!res.ok) {
            console.error(`❌ Request failed with status ${res.status}`);
            return null; // Return null instead of crashing
        }

        const data = await res.json();
        console.log("✅ API Response Data:", data);
        return data;
    } catch (error) {
        console.error("❌ Network Error:", error.message);
        return null;
    }
}

// ✅ Improved Login Function
async function login(event) {
    event.preventDefault(); // Prevent page refresh

    const username = document.getElementById("login-username").value;
    const password = document.getElementById("login-password").value;

    try {
        const response = await fetch("https://housekeeping-production.up.railway.app/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }),
        });

        const data = await response.json();

        if (response.ok) {
            console.log("✅ Login successful:", data);
            localStorage.setItem("token", data.token);
            localStorage.setItem("username", data.username);

            // Debugging: Check if this function runs
            console.log("showDashboard is being called with username:", data.username);
            
            setTimeout(() => {
                showDashboard(data.username); // Ensure UI updates correctly
            }, 500); // Small delay to allow UI update
        } else {
            alert("❌ Login failed: " + data.message);
        }
    } catch (error) {
        console.error("❌ Error logging in:", error);
        alert("An error occurred. Please try again.");
    }
}


async function checkAuth() {
    let token = localStorage.getItem("token");
    if (!token) {
        console.warn("No token found. Trying to refresh...");
        token = await refreshToken();
        if (!token) {
            logout();
        }
        return;
    }

    try {
        const payload = JSON.parse(atob(token.split('.')[1]));

        if (payload.exp * 1000 < Date.now()) {
            console.warn("Token expired. Attempting refresh...");
            token = await refreshToken();
            if (!token) {
                logout();
            } else {
                localStorage.setItem("token", token); // Store new token
            }
        }
    } catch {
        console.error("Invalid token detected. Logging out.");
        logout();
    }
}



 async function signUp(event) {
    event.preventDefault(); // Prevent form refresh

    const username = document.getElementById("signup-username").value;
    const password = document.getElementById("signup-password").value;

    try {
        const response = await fetch("https://housekeeping-production.up.railway.app/auth/signup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }),
        });

        const data = await response.json();

        if (response.ok) {
            alert("✅ Signup successful! Please log in.");
            document.getElementById("signup-form").classList.add("hidden"); 
        } else {
            alert("❌ Signup failed: " + data.message);
        }
    } catch (error) {
        console.error("❌ Signup error:", error);
        alert("An error occurred. Please try again.");
    }
}

   
function toggleAuth() {
    const signupForm = document.getElementById("signup-form");
    signupForm.classList.toggle("hidden");
    signupForm.reset(); // Clears input fields
}


async function loadRooms() {
    const floors = {
       "ground-floor": ["001", "002", "003", "004", "005", "006", "007", "011", "012", "013", "014", "015", "016", "017"],
        "second-floor": ["101", "102", "103", "104", "105", "106", "107", "108", "109", "110", "111", "112", "113", "114", "115", "116", "117"],
        "third-floor": ["201", "202", "203", "204", "205", "208", "209", "210", "211", "212", "213", "214", "215", "216", "217"]
    };

    Object.keys(floors).forEach(floor => {
    const floorDiv = document.getElementById(floor);
    if (!floorDiv) return; // Skip missing floors

    floorDiv.innerHTML = "";
    floors[floor].forEach(room => {
        const roomDiv = document.createElement("div");
        roomDiv.classList.add("room");
        roomDiv.innerHTML = `
            <span>Room ${room}</span>
            <button id="start-${room}" onclick="startCleaning('${room}')">Start Cleaning</button>
            <button id="finish-${room}" onclick="finishCleaning('${room}')" disabled>Finish</button>
            <button id="dnd-${room}" class="dnd-btn" onclick="toggleDoNotDisturb('${room}')">DND</button>
        `;
        floorDiv.appendChild(roomDiv);
    });
});

    await restoreCleaningStatus();
}

function showDashboard(username) {
    console.log("Inside showDashboard function. Username:", username);

    const dashboard = document.getElementById("dashboard");
    const authSection = document.getElementById("auth-section");
    const usernameDisplay = document.getElementById("user-name");

    if (!dashboard || !authSection || !usernameDisplay) {
        console.error("❌ Dashboard, Auth section, or Username display not found in DOM.");
        return;
    }

    // Hide login section
    authSection.style.display = "none";

    // Show dashboard properly
    dashboard.classList.remove("hidden");
    dashboard.style.display = "block"; // ✅ Ensure it's visible

    // Set username display
    usernameDisplay.textContent = username;

    // Load rooms first, then ensure the ground floor is shown
    loadRooms();

    setTimeout(() => {
        console.log("✅ Activating ground floor...");
        toggleFloor("ground-floor"); // Ensure it's visible after rooms load
    }, 1000);
}

async function refreshToken() {
    const refreshToken = localStorage.getItem("refreshToken");

    if (!refreshToken) {
        console.warn("⚠ No refresh token found. User needs to log in.");
        return null;
    }

    try {
        console.log("🔄 Attempting to refresh token...");
        const res = await fetch(`${apiUrl}/auth/refresh`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refreshToken })
        });

        if (!res.ok) {
            console.error(`❌ Refresh failed with status ${res.status}`);
            return null;
        }

        const data = await res.json();
        if (!data.token || !data.refreshToken) {
            console.error("❌ Refresh failed. No new tokens received.");
            return null;
        }

        // ✅ Store new tokens properly inside the try block
        localStorage.setItem("token", data.token);
        localStorage.setItem("refreshToken", data.refreshToken);

        console.log("✅ Tokens refreshed successfully:", {
            token: localStorage.getItem("token"),
            refreshToken: localStorage.getItem("refreshToken")
        });

        return data.token;
    } catch (error) {
        console.error("❌ Error refreshing token:", error);
        return null;
    }
}

async function ensureValidToken() {
    let token = localStorage.getItem("token");

    if (!token) {
        console.warn("⚠ No token found. Attempting to refresh...");
        token = await refreshToken();
        if (!token) {
            console.error("❌ Token refresh failed. User must log in.");
            return null;
        }
        localStorage.setItem("token", token); // ✅ Store new token
    }

    try {
        const payload = JSON.parse(atob(token.split('.')[1]));

        if (payload.exp * 1000 < Date.now()) {
            console.warn("⚠ Token expired. Attempting to refresh...");
            token = await refreshToken();
            if (!token) {
                console.error("❌ Token refresh unsuccessful. User must log in.");
                return null;
            }
            localStorage.setItem("token", token); // ✅ Store new token
        }

        localStorage.setItem("token", token); // ✅ Store the new token immediately
        console.log("✅ Token is valid.");
        return token;
    } catch (error) {
        console.error("❌ Invalid token structure. Logging out...");
        logout();
        return null;
    }
}


function getToken() {
    const token = localStorage.getItem("token");
    return token ? token : null; // Ensures no undefined errors
}

function storeTokens(accessToken, refreshToken) {
    if (!accessToken || !refreshToken) {
        console.error("❌ Missing tokens! Cannot store.");
        return;
    }

    console.log("✅ Attempting to store tokens in localStorage...");
    
    localStorage.setItem("token", accessToken);
    localStorage.setItem("refreshToken", refreshToken);

    console.log("✅ Tokens stored successfully:", {
        token: localStorage.getItem("token"),
        refreshToken: localStorage.getItem("refreshToken")
    });
}




function formatRoomNumber(roomNumber) {
            return roomNumber.toString().padStart(3, '0');
        }
// ✅ Fix restoreCleaningStatus()
function toggleFloor(floorId) {
    // Hide all floors
    document.querySelectorAll(".rooms").forEach(roomDiv => {
        roomDiv.style.display = "none";
    });

    // Show only the selected floor
    const floorDiv = document.getElementById(floorId);
    if (floorDiv) {
        floorDiv.style.display = "block"; // ✅ Ensure it's visible
        console.log(`✅ Showing rooms for: ${floorId}`);
    } else {
        console.error(`❌ No room list found for ${floorId}`);
    }
}

    function formatCambodiaTime() {
        return new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Phnom_Penh',
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
        }).format(new Date());
    }

async function restoreCleaningStatus() {
    try {
        console.log("🔄 Fetching cleaning logs...");
        const logs = await fetchWithErrorHandling(`${apiUrl}/logs`);

        if (!logs || !Array.isArray(logs)) {
            console.warn("⚠️ No valid logs found. Skipping status restoration.");
            return;
        }

        logs.forEach(log => {
            const roomNumber = log.roomNumber.toString().padStart(3, '0');  
            const status = log.finishTime ? "finished" : log.startTime ? "in_progress" : "available";
            const dndStatus = log.dndStatus ? "dnd" : "available"; // ✅ Retrieve DND status

            updateButtonStatus(roomNumber, status, dndStatus);
        });

        console.log("✅ All buttons updated after page load.");
    } catch (error) {
        console.error("❌ Error fetching logs:", error);
    }
}


function updateRoomUI(roomNumber, status, previousStatus = null) {
    const startButton = document.querySelector(`#start-${roomNumber}`);
    const finishButton = document.querySelector(`#finish-${roomNumber}`);

    if (!startButton || !finishButton) {
        console.warn(`❌ Buttons missing for Room ${roomNumber}`);
        return;
    }

    // Reset button styles before applying new ones
    startButton.style.backgroundColor = "grey";
    finishButton.style.backgroundColor = "grey";

    if (status === "available") {
        if (previousStatus === "in_progress") {
            startButton.disabled = true;
            finishButton.disabled = false;
            finishButton.style.backgroundColor = "#008CFF"; // Enable finish button if room was being cleaned
        } else {
            startButton.disabled = false;
            startButton.style.backgroundColor = "#008CFF"; // Normal start state
            finishButton.disabled = true;
        }
    } else if (status === "dnd") {
        startButton.disabled = true;
        finishButton.disabled = true;
    } else if (status === "in_progress") {
        startButton.disabled = true;
        finishButton.disabled = false;
        finishButton.style.backgroundColor = "#008CFF";
    } else if (status === "finished") {
        startButton.disabled = true;
        finishButton.disabled = true;
        finishButton.style.backgroundColor = "green";
    } else {
        console.warn(`⚠️ Unknown status for Room ${roomNumber}:`, status);
    }
}


async function resetCleaningStatus(roomNumber) {
    const formattedRoom = roomNumber.toString().padStart(3, '0');
    console.log(`🔄 Resetting cleaning status for Room ${formattedRoom}...`);

    try {
        const res = await fetch(`${apiUrl}/logs/reset-cleaning`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roomNumber })
        });

        const data = await res.json();

        if (!res.ok) {
            console.error("❌ Failed to reset cleaning status:", data);
            alert(`❌ Reset Cleaning Failed: ${data.message}`);
            return;
        }

        console.log(`✅ Cleaning status reset successfully for Room ${formattedRoom}.`);
        
        // ✅ Immediately update UI so the Start Cleaning button is clickable
        updateButtonStatus(roomNumber, "available", "available"); 
        
        // ✅ Ensure fresh logs are loaded
        await loadLogs(); 
    } catch (error) {
        console.error("❌ Error resetting cleaning status:", error);
    }
}

async function toggleDoNotDisturb(roomNumber) {
    const formattedRoom = roomNumber.toString().padStart(3, '0');
    const dndButton = document.getElementById(`dnd-${formattedRoom}`);

    if (!dndButton) {
        console.error(`❌ DND button not found for Room ${formattedRoom}`);
        return;
    }

    const isDNDActive = dndButton.classList.contains("active-dnd");
    const newStatus = isDNDActive ? "available" : "dnd";

    if (newStatus === "available") {
        console.log(`🔄 Resetting cleaning status for Room ${formattedRoom}`);
        try {
            const resetRes = await fetch(`${apiUrl}/logs/reset-cleaning`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ roomNumber })
            });

            const resetData = await resetRes.json();
            if (!resetRes.ok) {
                console.error("❌ Failed to reset cleaning status:", resetData);
                return;
            }
            console.log(`✅ Cleaning status reset for Room ${formattedRoom}`);
        } catch (error) {
            console.error("❌ Error resetting cleaning status:", error);
        }
    }

    try {
        const res = await fetch(`${apiUrl}/logs/dnd`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roomNumber, status: newStatus })
        });

        const data = await res.json();
        if (!res.ok) {
            console.error("❌ Failed to Update DND Status:", data);
            alert(`❌ Failed: ${data.message}`);
            return;
        }

        console.log(`✅ Room ${formattedRoom} DND status updated.`);
        safeEmit("dndUpdate", { roomNumber, status: newStatus });

        // ✅ Instead of manually modifying UI, call updateRoomUI
        updateRoomUI(formattedRoom, newStatus);

        // ✅ Ensure logs reflect new DND status
        await loadLogs();
    } catch (error) {
        console.error("❌ Error updating DND status:", error);
    }
}


async function startCleaning(roomNumber) {
    const formattedRoom = roomNumber.toString().padStart(3, '0');
    const startButton = document.getElementById(`start-${formattedRoom}`);
    const finishButton = document.getElementById(`finish-${formattedRoom}`);
    const dndButton = document.getElementById(`dnd-${formattedRoom}`);

    if (!startButton || !finishButton || !dndButton) {
        console.error(`❌ Buttons not found for Room ${formattedRoom}`);
        return;
    }

    const username = localStorage.getItem("username"); // ✅ Ensure username is retrieved
    if (!username) {
        console.error("❌ No username found in localStorage. Cannot start cleaning.");
        alert("You must be logged in to start cleaning.");
        return;
    }

    // ✅ Fetch latest logs before sending request
    const logs = await fetchWithErrorHandling(`${apiUrl}/logs`);
    const roomLog = logs.find(log => log.roomNumber.toString().padStart(3, '0') === formattedRoom);
    if (!roomLog) {
    console.warn(`⚠️ No log entry found for Room ${formattedRoom}`);
    }
    if (roomLog && roomLog.startTime && !roomLog.finishTime) {
        alert(`⚠ Room ${formattedRoom} is already being cleaned.`);
        return;
    }

    // Disable Start Cleaning and Enable Finish Cleaning
    startButton.disabled = true;
    startButton.style.backgroundColor = "grey";
    finishButton.disabled = false;
    finishButton.style.backgroundColor = "#008CFF";

    // ✅ Send API request to update backend
    try {
        const res = await fetch(`${apiUrl}/logs/start`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roomNumber, username })
        });

        const data = await res.json();
        if (!res.ok) {
            console.error("❌ Failed to Start Cleaning:", data);
            alert(`❌ Failed: ${data.message}`);
            return;
        }

        console.log(`✅ Room ${formattedRoom} cleaning started.`);
        safeEmit("update", { roomNumber, status: "in_progress" });

    } catch (error) {
        console.error("❌ Error starting cleaning:", error);
    }
}

async function finishCleaning(roomNumber) {
    const formattedRoom = roomNumber.toString().padStart(3, '0');
    const finishButton = document.getElementById(`finish-${formattedRoom}`);
    const username = localStorage.getItem("username"); 
    if (!username) {
        console.error("❌ No username found in localStorage. Cannot finish cleaning.");
        alert("You must be logged in to finish cleaning.");
        return;
    }
    
    if (!finishButton) {
        console.error(`❌ Finish button not found for Room ${formattedRoom}`);
        return;
    }

    // Ensure roomNumber is converted properly
    const numericRoomNumber = parseInt(roomNumber, 10);
    if (isNaN(numericRoomNumber)) {
        console.error("❌ Invalid room number:", roomNumber);
        alert("❌ Room number is invalid.");
        return;
    }


    // Disable Finish Button and Change Color to Green
    finishButton.disabled = true;
    finishButton.style.backgroundColor = "green";

    // ✅ Send API request to update backend
    try {
        const res = await fetch(`${apiUrl}/logs/finish`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roomNumber: numericRoomNumber,username, status: "finished" })
        });

        const data = await res.json();
        if (!res.ok) {
            console.error("❌ Failed to Finish Cleaning:", data);
            alert(`❌ Failed: ${data.message}`);
            return;
        }
        updateButtonStatus(numericRoomNumber, "finished");
        console.log(`✅ Room ${formattedRoom} cleaning finished.`);
        safeEmit("update", { roomNumber, status: "finished" });
        loadLogs();

    } catch (error) {
        console.error("❌ Error finishing cleaning:", error);
    }
}

function updateButtonStatus(roomNumber, status, dndStatus = "available") {
    let formattedRoom = roomNumber.toString().padStart(3, '0');
    const startButton = document.getElementById(`start-${formattedRoom}`);
    const finishButton = document.getElementById(`finish-${formattedRoom}`);
    const dndButton = document.getElementById(`dnd-${formattedRoom}`);

    if (!startButton || !finishButton || !dndButton) {
        console.warn(`❌ Buttons not found for Room ${formattedRoom}`);
        return;
    }

    if (dndStatus === "dnd") {
        startButton.disabled = true;
        finishButton.disabled = true;
        dndButton.style.backgroundColor = "red";
        dndButton.classList.add("active-dnd");
    } else {
        dndButton.style.backgroundColor = "#008CFF";
        dndButton.classList.remove("active-dnd");

        if (status === "in_progress") {
            startButton.disabled = true;
            finishButton.disabled = false;
            finishButton.style.backgroundColor = "#008CFF";
        } else if (status === "finished") {
            startButton.disabled = true;
            finishButton.disabled = true;
            finishButton.style.backgroundColor = "green";
        } else {
            startButton.disabled = false;
            finishButton.disabled = true;
            finishButton.style.backgroundColor = "grey";
        }
    }
}

// Ensure updateButtonStatus is being called after fetching logs
async function loadLogs() {
    console.log("🔄 Fetching cleaning logs...");
    try {
        const logs = await fetchWithErrorHandling(`${apiUrl}/logs`);
        console.log("✅ API Cleaning Logs Response:", JSON.stringify(logs, null, 2));

        if (!logs || !Array.isArray(logs)) {
            console.warn("⚠️ No valid logs found. Setting empty table.");
            document.querySelector("#logTable tbody").innerHTML = "<tr><td colspan='5'>No logs found.</td></tr>";
            return;
        }

        const logTable = document.querySelector("#logTable tbody");
        logTable.innerHTML = ""; // Clear existing logs

        let cleaningStatus = {};

        // ✅ Sort logs: "In Progress" first, then latest logs first
        logs.sort((a, b) => {
            const statusA = a.status === "in_progress" ? 1 : 0;
            const statusB = b.status === "in_progress" ? 1 : 0;
            const timeA = a.startTime ? new Date(a.startTime).getTime() : 0;
            const timeB = b.startTime ? new Date(b.startTime).getTime() : 0;
            
            // Prioritize "In Progress", then sort by latest time
            return statusB - statusA || timeB - timeA;
        });

        logs.forEach(log => {
            console.log("📌 Log Entry:", log); // Debug individual log entries

            let roomNumber = log.roomNumber ? log.roomNumber.toString().padStart(3, '0') : "N/A";
            let startTime = log.startTime ? new Date(log.startTime).toLocaleString('en-US', { timeZone: 'Asia/Phnom_Penh' }) : "N/A";
            let startedBy = log.startedBy || "-";
            let finishTime = log.finishTime ? new Date(log.finishTime).toLocaleString('en-US', { timeZone: 'Asia/Phnom_Penh' }) : "In Progress...";
            let finishedBy = log.finishedBy || "-";
            let status = log.finishTime ? "finished" : "in_progress";
            let dndStatus = log.dndStatus ? "dnd" : "available"; // ✅ Read DND status from DB

            // ✅ Only update DND status if it has actually changed
            const dndButton = document.getElementById(`dnd-${roomNumber}`);
            if (dndButton) {
                const isDNDActive = dndButton.classList.contains("active-dnd");

                if (isDNDActive && dndStatus === "available") {
                    console.log(`🔍 Skipping DND update for Room ${roomNumber}, already available.`);
                } else if (!isDNDActive && dndStatus === "dnd") {
                    console.log(`🚨 Applying DND mode for Room ${roomNumber}`);
                    updateDNDStatus(roomNumber, "dnd");
                }
            }

            // ✅ Store cleaning status
            cleaningStatus[roomNumber] = {
                started: status === "in_progress",
                finished: status === "finished",
                dnd: dndStatus === "dnd"
            };

            let row = document.createElement("tr");
            row.innerHTML = `
                <td>${roomNumber}</td>
                <td>${startTime}</td>
                <td>${startedBy}</td>
                <td>${finishTime}</td>
                <td>${finishedBy}</td>
            `;
            logTable.appendChild(row);
        });

        // ✅ If no logs are found, display a default message
        if (!logTable.innerHTML.trim()) { 
            logTable.innerHTML = "<tr><td colspan='5'>No logs found.</td></tr>"; 
        } 

    } catch (error) {
        console.error("❌ Error loading logs:", error);
    }
}


async function updateDNDStatus(roomNumber, status) {
    console.log(`Updating DND status for Room ${roomNumber} to: ${status}`);

    let formattedRoom = roomNumber.toString().padStart(3, '0');
    const dndButton = document.getElementById(`dnd-${formattedRoom}`);
    const startButton = document.getElementById(`start-${formattedRoom}`);
    const finishButton = document.getElementById(`finish-${formattedRoom}`);

    if (!dndButton || !startButton || !finishButton) {
        console.warn(`⚠️ Buttons not found for Room ${formattedRoom}.`);
        return;
    }

    // ✅ Only update if the status is actually changing
    if (dndButton.classList.contains("active-dnd") && status === "available") {
        console.log(`✅ No change for Room ${formattedRoom}, skipping DND update.`);
        return;
    }

    if (status === "dnd") {
        console.log(`🚨 Setting DND mode for Room ${formattedRoom}`);
        dndButton.classList.add("active-dnd");
        dndButton.style.backgroundColor = "red";
        startButton.disabled = true;
        finishButton.disabled = true;
    } else {
        console.log(`✅ Room ${formattedRoom} is available`);
        dndButton.classList.remove("active-dnd");
        dndButton.style.backgroundColor = "#008CFF";
    }

    // ✅ Instead of fetching logs separately, refresh all logs
    await loadLogs();
}

function logout() {
    console.log("🔴 Logging out...");
    if (window.socket) {
        window.socket.disconnect();
    }

    localStorage.clear();
    sessionStorage.clear();
    alert("✅ You have been logged out.");

    document.getElementById("dashboard").classList.add("hidden");
    document.getElementById("auth-section").classList.remove("hidden");
    document.getElementById("auth-section").style.display = "block";
    document.getElementById("dashboard").style.display = "none";
}

// ✅ Function to Clear Logs and Reset All Buttons including DND
async function clearLogs() {
    console.log("🧹 Clearing all logs and resetting room statuses...");
    document.querySelector("#logTable tbody").innerHTML = "";

    // ✅ Reset all button states
    document.querySelectorAll(".room button").forEach(button => {
        if (button.id.startsWith("start-")) {
            button.style.backgroundColor = "#008CFF";
            button.disabled = false;
        } else if (button.id.startsWith("finish-")) {
            button.style.backgroundColor = "grey";
            button.disabled = true;
        } else if (button.id.startsWith("dnd-")) {
            button.style.backgroundColor = "#008CFF";
            button.classList.remove("active-dnd");
        }
    });

    localStorage.clear(); // ✅ Clears all storage related to housekeeping

    // ✅ Emit WebSocket event to sync across all connected clients
    safeEmit("clearLogs");

    // ✅ API request to clear logs from the database
    try {
        const res = await fetch(`${apiUrl}/logs/clear`, { method: "POST" });
        if (res.ok) {
            console.log("✅ Logs cleared successfully on server.");
            await loadLogs(); // ✅ Reload logs to ensure UI consistency
        } else {
            console.error("❌ Error clearing logs on server.", await res.json());
        }
    } catch (error) {
        console.error("❌ Error clearing logs:", error);
    }
}

       function exportLogs() {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF();
    pdf.text("Cleaning Logs - Today's Records", 10, 10);

    const rows = [];
    
    // Get today's date in "YYYY-MM-DD" format
    const today = new Date().toISOString().split('T')[0]; // Correctly formats to "YYYY-MM-DD"

    document.querySelectorAll("#logTable tbody tr").forEach(row => {
        const rowData = Array.from(row.children).map(cell => cell.innerText);
        rowData[0] = formatRoomNumber(rowData[0].trim()); // Ensure room number is formatted as 3 digits
        
        // Extract the timestamp
        let logStartTime = rowData[1].trim(); // Example: "2024-03-04 10:30 AM"

        // Convert to proper Date format if possible
        let logDate = new Date(logStartTime).toISOString().split('T')[0];

        console.log(`Checking Log: ${logDate} vs Today: ${today}`); // Debugging Output

        if (logDate === today) {
            rows.push(rowData);
        }
    });

    if (rows.length === 0) {
        alert("No logs found for today.");
        return;
    }

    pdf.autoTable({
        head: [["Room", "Start Time", "Started By", "Finish Time", "Finished By"]],
        body: rows,
    });

    pdf.save("cleaning_logs_today.pdf");
}

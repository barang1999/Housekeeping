const apiUrl = "https://housekeeping-production.up.railway.app";
const token = localStorage.getItem("token");

let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;
window.socket = null;

document.addEventListener("DOMContentLoaded", async () => {
    const validToken = await ensureValidToken();
    if (validToken) connectWebSocket();
    checkAuth();
    loadRooms();
});


async function connectWebSocket() {
    let token = await ensureValidToken();
    if (!token) {
        console.warn("❌ WebSocket connection aborted: No valid token.");
        return;
    }

    if (window.socket) {
        window.socket.disconnect(); // Ensure clean disconnection before reconnecting
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
            await new Promise(res => setTimeout(res, 2000));
            const newToken = await refreshToken();
            if (newToken) {
                window.socket.auth = { token: newToken };
                window.socket.connect();
            } else {
                console.error("🔴 Max reconnect attempts reached. Disabling WebSocket.");
                window.socket = null;
                logout();
            }
        }
    });

    window.socket.on("disconnect", (reason) => {
        console.warn("🔴 WebSocket disconnected:", reason);
        setTimeout(connectWebSocket, 5000); // Try reconnecting after disconnect
    });

    window.socket.on("update", ({ roomNumber, status }) => updateButtonStatus(roomNumber, status));
}

function safeEmit(event, data = {}) {
    ensureWebSocketConnection(); // Ensure WebSocket is connected before emitting
    if (window.socket && window.socket.connected) {
        window.socket.emit(event, data);
    } else {
        console.warn(`WebSocket is not connected. Cannot emit ${event}`);
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    console.log("🔄 Initializing housekeeping system...");

    await ensureValidToken();
    ensureWebSocketConnection();
    
    // ✅ Immediately fetch logs and update buttons
    await loadLogs();
    
    // ✅ Ensure buttons reflect the latest status from logs
    updateButtonsFromLogs();
});

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


function ensureWebSocketConnection() {
    if (!window.socket || !window.socket.connected) {
        console.warn("⛔ WebSocket is not connected. Attempting reconnect...");
        
        // Attempt reconnection
        connectWebSocket();
        
        // Wait 2 seconds and check again
        setTimeout(() => {
            if (!window.socket || !window.socket.connected) {
                console.error("⛔ WebSocket reconnection failed.");
            } else {
                console.log("✅ WebSocket reconnected successfully.");
            }
        }, 2000);
    }
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


document.addEventListener("DOMContentLoaded", async function () {
    console.log("DOM fully loaded");

    const token = localStorage.getItem("token");
    const username = localStorage.getItem("username");

    if (token && username) {
        console.log("✅ Token and username found. Attempting authentication...");
        const validToken = await ensureValidToken();
        
        if (validToken) {
            console.log("✅ Token is valid. Redirecting to dashboard...");
            setTimeout(() => {
                showDashboard(username);
            }, 500); // Small delay to ensure UI updates correctly
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
            console.warn("⚠️ No valid logs found. Setting empty array.");
            return;
        }

        logs.forEach(log => {
            // ✅ Fix: Ensure correct field name and check for missing status
            const roomNumber = log.roomNumber;  // Handle incorrect field name
            const status = log.status || "pending";  // Default status if missing

            if (!roomNumber) {
                console.warn("⚠️ Skipping log entry with missing room number:", log);
                return;
            }

            updateButtonStatus(roomNumber, status);
        });
    } catch (error) {
        console.error("❌ Error fetching logs:", error);
    }
}

function toggleDoNotDisturb(roomNumber) {
    const dndButton = document.getElementById(`dnd-${roomNumber}`);
    const startButton = document.getElementById(`start-${roomNumber}`);
    const finishButton = document.getElementById(`finish-${roomNumber}`);

    if (!dndButton || !startButton || !finishButton) return;

    const isDNDActive = dndButton.classList.contains("active-dnd");

    if (isDNDActive) {
        // ✅ Remove DND mode (reenable cleaning buttons)
        dndButton.classList.remove("active-dnd");
        dndButton.style.backgroundColor = "blue";
        startButton.disabled = false;
        finishButton.disabled = true;
    } else {
        // ✅ Activate DND mode (disable cleaning buttons)
        dndButton.classList.add("active-dnd");
        dndButton.style.backgroundColor = "red";
        startButton.disabled = true;
        finishButton.disabled = true;
    }
}

async function startCleaning(roomNumber) {
    try {
        const numericRoomNumber = parseInt(roomNumber, 10);
        const username = localStorage.getItem("username"); // Ensure username is retrieved

        if (!username) {
            console.error("❌ No username found in localStorage. Cannot start cleaning.");
            alert("You must be logged in to start cleaning.");
            return;
        }

        console.log("🟢 Sending Start Cleaning Request:", {
            roomNumber: numericRoomNumber,
            username: username,
            status: "in_progress"
        });

        const res = await fetch(`${apiUrl}/logs/start`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roomNumber: numericRoomNumber, username, status: "in_progress" })
        });

        const data = await res.json();
        console.log("✅ API Response for Start Cleaning:", data);

        if (!res.ok) {
            console.error("❌ Failed Start Cleaning:", data);
            alert(`❌ Failed to start cleaning: ${data.message || "Please try again."}`);
            return;
        }

        if (data.message.includes("started")) {
            updateButtonStatus(numericRoomNumber, "in_progress");
            safeEmit("update", { roomNumber: numericRoomNumber, status: "in_progress" });
            loadLogs(); // ✅ Ensure UI reflects latest status
        }
    } catch (error) {
        console.error("❌ Error starting cleaning:", error);
        alert("❌ Failed to start cleaning. Please try again.");
    }
}

async function finishCleaning(roomNumber) {
    try {
        const numericRoomNumber = parseInt(roomNumber, 10);
        const username = localStorage.getItem("username");

        console.log("🟢 Sending Finish Cleaning Request: ", {
            roomNumber: numericRoomNumber,
            username: username,
            status: "finished"
        });

        const res = await fetch(`${apiUrl}/logs/finish`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roomNumber: numericRoomNumber, username, status: "finished" })
        });

        const data = await res.json();
        console.log("✅ API Response for Finish Cleaning:", data);

        if (!res.ok) {
            console.error("❌ Failed Finish Cleaning: ", data);
            alert(`❌ Failed to finish cleaning: ${data.message || "Please try again."}`);
            return;
        }

        if (data.message.includes("finished")) {
            const finishButton = document.getElementById(`finish-${numericRoomNumber}`);
            if (finishButton) {
                finishButton.disabled = true;
                finishButton.style.backgroundColor = "green";
            }
            updateButtonStatus(numericRoomNumber, "finished");
            safeEmit("update", { roomNumber: numericRoomNumber, status: "finished" });
            loadLogs();
        }
    } catch (error) {
        console.error("❌ Error finishing cleaning:", error);
        alert("❌ Failed to finish cleaning. Please try again.");
    }
}

function updateDNDStatus(roomNumber, status) {
    console.log(`Updating DND status for Room ${roomNumber} to: ${status}`);

    // Ensure room number is correctly formatted
    roomNumber = roomNumber.toString().padStart(3, '0');

    // Try to find the DND button
    const dndButton = document.getElementById(`dnd-${roomNumber}`);

    // If button is not found, log warning and return
    if (!dndButton) {
        console.warn(`⚠️ DND button not found for Room ${roomNumber}. Trying again after 1 second...`);
        
        // Retry after 1 second to check if the button is loaded later
        setTimeout(() => updateDNDStatus(roomNumber, status), 1000);
        return;
    }

    // Apply styles based on status
    if (status === "dnd") {
        dndButton.classList.add("active-dnd");
        dndButton.style.backgroundColor = "red";
    } else {
        dndButton.classList.remove("active-dnd");
        dndButton.style.backgroundColor = "blue";
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
            return;
        }

        const logTable = document.querySelector("#logTable tbody");
        logTable.innerHTML = ""; // Clear existing logs

         let cleaningStatus = {};

        // ✅ Sort logs: "In Progress" first, then latest logs first
        logs.sort((a, b) => {
            const statusA = a.status === "in_progress" ? 1 : 0;
            const statusB = b.status === "in_progress" ? 1 : 0;
            const timeA = new Date(a.startTime).getTime();
            const timeB = new Date(b.startTime).getTime();
            
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
            updateDNDStatus(log.roomNumber, log.dndStatus ? "dnd" : "available");

            // Store cleaning status
            cleaningStatus[roomNumber] = {
                started: log.status === "in_progress",
                finished: log.status === "finished",
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

            // ✅ Ensure buttons update based on logs
            updateButtonStatus(roomNumber, status);
        });

        if (!logTable.innerHTML.trim()) {
            logTable.innerHTML = "<tr><td colspan='5'>No logs found.</td></tr>";
        }
    } catch (error) {
        console.error("❌ Error loading logs:", error);
    }
}

function updateButtonStatus(roomNumber, status) {
    let formattedRoom = roomNumber.toString().padStart(3, '0'); // Ensure consistent format
    const startButton = document.getElementById(`start-${formattedRoom}`);
    const finishButton = document.getElementById(`finish-${formattedRoom}`);

    if (!startButton || !finishButton) {
        console.warn(`❌ Buttons not found for Room ${formattedRoom}`);
        return;
    }

    if (status === "in_progress") {
        startButton.style.backgroundColor = "grey";  // Change start button to grey
        startButton.disabled = true;                 // Disable start button
        finishButton.style.backgroundColor = "blue"; // Enable finish button
        finishButton.disabled = false;
    } else if (status === "finished") {
        finishButton.style.backgroundColor = "green"; // Mark finished button as green
        finishButton.disabled = true;
    }
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



 // ✅ Function to Clear Logs and Reset Buttons
function clearLogs() {
    console.log("🧹 Clearing logs...");
    document.querySelector("#logTable tbody").innerHTML = "";

    localStorage.clear(); // ✅ Clears all storage related to housekeeping

    document.querySelectorAll(".room button").forEach(button => {
        button.disabled = button.id.startsWith("finish-");
    });

    safeEmit("clearLogs");

    fetch(`${apiUrl}/logs/clear`, { method: "POST" })
        .then(() => console.log("✅ Logs cleared on server"))
        .catch(error => console.error("❌ Error clearing logs:", error));
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
       

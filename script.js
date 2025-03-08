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
    if (window.socket && window.socket.connected) {
        window.socket.emit(event, data);
    } else {
        console.warn(`WebSocket is not connected. Cannot emit ${event}`);
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
        if (!floorDiv) return;
        floorDiv.innerHTML = "";
        floors[floor].forEach(room => {
            const roomDiv = document.createElement("div");
            roomDiv.classList.add("room");
            roomDiv.innerHTML = `
                <span>Room ${room}</span>
                <button id="start-${room}" onclick="startCleaning('${room}')">Start Cleaning</button>
                <button id="finish-${room}" onclick="finishCleaning('${room}')" disabled>Finish</button>
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

    // ✅ Hide login section
    authSection.style.display = "none";

    // ✅ Show dashboard
    dashboard.classList.remove("hidden");
    dashboard.style.display = "block";

    // ✅ Set username display
    usernameDisplay.textContent = username;

    // ✅ Load rooms first, then ensure the ground floor is shown
    loadRooms();

    setTimeout(() => {
        console.log("✅ Activating ground floor...");
        toggleFloor("ground-floor"); // Ensure it's visible after rooms load
    }, 1000);
}

document.addEventListener("DOMContentLoaded", function () {
    console.log("DOM fully loaded");
    
    const token = localStorage.getItem("token");
    const username = localStorage.getItem("username");

    if (token && username) {
        console.log("✅ Token and username found. Logging in automatically.");
        setTimeout(() => {
            showDashboard(username);
        }, 500); // Small delay to ensure proper UI rendering
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

function updateButtonStatus(roomNumber, status) {
    const startButton = document.getElementById(`start-${roomNumber}`);
    const finishButton = document.getElementById(`finish-${roomNumber}`);
    if (!startButton || !finishButton) return;
    
    startButton.disabled = status !== "pending";
    finishButton.disabled = status !== "in_progress";
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
        floorDiv.style.display = "block";
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

async function startCleaning(roomNumber) {
    try {
        const res = await fetch(`${apiUrl}/logs/start`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roomNumber, username: localStorage.getItem("username"), status: "in_progress" })
        });

        if (!res.ok) {
            throw new Error(`Request failed with status ${res.status}`);
        }

        const data = await res.json();
        if (data.message.includes("started")) {
            updateButtonStatus(roomNumber, "in_progress");
            safeEmit("update", { roomNumber, status: "in_progress" });
        }
    } catch (error) {
        console.error("Error starting cleaning:", error);
        alert("❌ Failed to start cleaning. Please try again.");
    }
}

async function finishCleaning(roomNumber) {
    try {
        const res = await fetch(`${apiUrl}/logs/finish`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roomNumber, username: localStorage.getItem("username"), status: "finished" })
        });

        if (!res.ok) {
            throw new Error(`Request failed with status ${res.status}`);
        }

        const data = await res.json();
        if (data.message.includes("finished")) {
            updateButtonStatus(roomNumber, "finished");
        }
    } catch (error) {
        console.error("Error finishing cleaning:", error);
        alert("❌ Failed to finish cleaning. Please try again.");
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
}


// ✅ Ensure `logs` is defined before using it
function loadLogs() {
    fetch(`${apiUrl}/logs`)
        .then(response => response.json())
        .then(logs => {
            if (!logs || !Array.isArray(logs)) {
                console.warn("⚠️ No logs found or logs is not an array.");
                return;
            }

            const logTable = document.querySelector("#logTable tbody");
            logTable.innerHTML = ""; // Clear existing logs

            const today = new Date().toISOString().split('T')[0];
            let cleaningStatus = {};

            logs.forEach(log => {
                let roomNumber = log.roomNumber;
                cleaningStatus[roomNumber] = {
                    started: log.status === "in_progress",
                    finished: log.status === "finished",
                };

                let logDate = new Date(log.startTime).toISOString().split('T')[0];
                if (logDate === today) {
                    const row = document.createElement("tr");
                    row.innerHTML = `
                        <td>${log.roomNumber}</td>
                        <td>${log.startTime || "N/A"}</td>
                        <td>${log.startedBy || "-"}</td>
                        <td>${log.finishTime ? log.finishTime : "In Progress..."}</td>
                        <td>${log.finishedBy || "-"}</td>
                    `;
                    logTable.appendChild(row);
                }
            });

            localStorage.setItem("cleaningStatus", JSON.stringify(cleaningStatus));

            if (!logTable.innerHTML.trim()) {
                logTable.innerHTML = "<tr><td colspan='5'>No logs found for today.</td></tr>";
            }
        })
        .catch(error => console.error("❌ Error fetching logs:", error));
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
       

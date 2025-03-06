const apiUrl = "https://housekeeping-production.up.railway.app"; // API calls
const token = localStorage.getItem("token");

const token = localStorage.getItem("token"); // Retrieve token

if (!token) {
    console.warn("⚠️ No auth token found. Redirecting to login.");
    showLogin();
} else {
    console.log("✅ Using token for WebSocket:", token);

    const socket = io(apiUrl, {
        auth: { token }, // Send token for authentication
        reconnectionAttempts: 5,
        timeout: 5000
    });

    socket.on("connect", () => {
        console.log("✅ WebSocket connected");
    });

    socket.on("connect_error", (err) => {
        console.error("❌ WebSocket connection error:", err);
    });

    socket.on("disconnect", (reason) => {
        console.warn("⚠️ WebSocket disconnected:", reason);
    });
}

    // ✅ Live Status Updates from Server
socket.on("update", (data) => {
    console.log("🔄 Live Update Received:", data);
    updateButtonStatus(data.roomNumber, data.status);
});
// ✅ Listen for events safely (prevents duplication)
document.addEventListener("DOMContentLoaded", () => {
    if (!socket.hasListeners("clearLogs")) {
        socket.on("clearLogs", () => {
            console.log("🧹 Logs cleared remotely, resetting buttons...");
            resetButtonStatus();
        });
    }
});

// ✅ Log all WebSocket messages
socket.onAny((event, data) => {
    console.log(`📩 WebSocket Event Received: ${event}`, data);
});

        // ✅ Ensure no duplicate event listeners
socket.on("clearLogs", () => {
    console.log("🧹 Logs cleared remotely, resetting buttons...");
    resetButtonStatus();
});
        // ✅ Function to send safe WebSocket events
function safeEmit(event, data) {
    if (!socket || !socket.connected) {
        console.warn("⚠️ WebSocket is not connected yet. Retrying...");
        return;
    }
    
    const token = localStorage.getItem("token"); // Ensure token is included in event emissions
    socket.emit(event, { ...data, token });
}

async function ensureValidToken() {
    let token = localStorage.getItem("token");
    if (!token) {
        console.warn("⚠️ No token found. Redirecting to login.");
        showLogin();
        return null;
    }

    const payload = JSON.parse(atob(token.split('.')[1]));
    const expTime = payload.exp * 1000; // Convert to milliseconds
    const currentTime = Date.now();

    if (expTime < currentTime) {
        console.warn("❌ JWT Token Expired. Attempting to refresh...");

        return await refreshToken(); // Refresh token if expired
    }
    return token;
}

async function refreshToken() {
    const refreshToken = localStorage.getItem("refreshToken");
    if (!refreshToken) {
        console.warn("⚠️ No refresh token. User must log in again.");
        logout();
        return null;
    }

    try {
        const response = await fetch(`${apiUrl}/auth/refresh`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: refreshToken })
        });

        if (!response.ok) {
            console.warn("❌ Failed to refresh token.");
            logout();
            return null;
        }

        const data = await response.json();
        localStorage.setItem("token", data.token);
        return data.token;
    } catch (error) {
        console.error("❌ Error refreshing token:", error);
        logout();
        return null;
    }
}

  
// ✅ Function to update buttons on all devices
function updateButtonStatus(roomNumber, status) {
    const startButton = document.getElementById(`start-${roomNumber}`);
    const finishButton = document.getElementById(`finish-${roomNumber}`);

    if (!startButton || !finishButton) {
        console.warn(`⚠️ Buttons for Room ${roomNumber} not found.`);
        return;
    }

    if (status === "in_progress") {
        startButton.disabled = true;
        finishButton.disabled = false;
    } else if (status === "finished") {
        startButton.disabled = true;
        finishButton.disabled = true;
    } else {
        startButton.disabled = false;
        finishButton.disabled = true;
    }

    let cleaningStatus = JSON.parse(localStorage.getItem("cleaningStatus")) || {};
    cleaningStatus[roomNumber] = { started: status === "in_progress", finished: status === "finished" };
    localStorage.setItem("cleaningStatus", JSON.stringify(cleaningStatus));
}


// ✅ Log in
window.login = function() {  
    const username = document.getElementById("login-username").value.trim();
    const password = document.getElementById("login-password").value.trim();

    if (!username || !password) {
        alert("⚠️ Please enter both username and password.");
        return;
    }

    fetch(`${apiUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
    })
    .then(response => response.json())
    .then(data => {
        if (data?.token) { 
            console.log("🟢 JWT Token Received:", data.token);
            localStorage.setItem("token", data.token);
            localStorage.setItem("username", username);
            showDashboard();
        } else {
            console.error("❌ Login Failed:", data);
            alert(data.message || "Invalid credentials.");
        }
    })
    .catch(error => {
        console.error("❌ Login Error:", error);
        alert("⚠️ Failed to log in. Please check your internet connection.");
    });
};



         function signUp() {
    const username = document.getElementById("signup-username").value;
    const password = document.getElementById("signup-password").value;

    fetch(`${apiUrl}/auth/signup`, { // ✅ Fixed API URL
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
    })
    .then(response => response.json())
    .then(data => {
        alert(data.message);
        if (data.message.includes("Redirecting to login")) {
            showLogin();
        }
    })
    .catch(error => console.log("Error:", error));
}
       window.toggleAuth = function() {
    const signupForm = document.getElementById("signup-form");
    if (signupForm) {
        signupForm.classList.toggle("hidden");
    } else {
        console.error("❌ Error: Signup form element not found!");
    }
};


function showLogin() {
    document.getElementById("auth-section").classList.remove("hidden");
    document.getElementById("dashboard").classList.add("hidden");
}

   function showDashboard() {
    document.getElementById("auth-section").classList.add("hidden");
    document.getElementById("dashboard").classList.remove("hidden");

    // ✅ Ensure username is retrieved from localStorage so it persists after refresh
    const username = localStorage.getItem("username") || "User";
    document.getElementById("user-name").textContent = username;

    loadRooms();
    loadLogs();
}


    function logout() {
    console.log("🔴 Logging out...");
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    location.reload(); // Refresh page to reset state
}
        


    function loadRooms() {
    const floors = {
        "ground-floor": ["001", "002", "003", "004", "005", "006", "007", "011", "012", "013", "014", "015", "016", "017"],
        "second-floor": ["101", "102", "103", "104", "105", "106", "107", "108", "109", "110", "111", "112", "113", "114", "115", "116", "117"],
        "third-floor": ["201", "202", "203", "204", "205", "208", "209", "210", "211", "212", "213", "214", "215", "216", "217"]
    };

    Object.keys(floors).forEach(floor => {
        const floorDiv = document.getElementById(floor);
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

    // Ensure status is restored **after** rooms are loaded
    setTimeout(restoreCleaningStatus, 100);
}
    function toggleFloor(floorId) {
        document.querySelectorAll('.rooms').forEach(roomDiv => roomDiv.style.display = 'none');
        document.getElementById(floorId).style.display = 'block';
    }

    function formatCambodiaTime() {
        return new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Phnom_Penh',
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
        }).format(new Date());
    }

// ✅ Start Cleaning Function
 function startCleaning(roomNumber) {
            const username = localStorage.getItem("username");
            const startTime = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Phnom_Penh' });

            fetch(`${apiUrl}/logs/start`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ roomNumber, username, startTime, status: "in_progress" })
            })
            .then(response => response.json())
            .then(data => {
                if (data.message.includes("started")) {
                    document.getElementById(`start-${roomNumber}`).disabled = true;
                    document.getElementById(`finish-${roomNumber}`).disabled = false;
                    socket.emit("update", { roomNumber, status: "in_progress" });
                } else {
                    alert("Failed to start cleaning.");
                }
            })
            .catch(error => {
                console.error("❌ Error starting cleaning:", error);
                alert("Failed to start cleaning.");
            });
        }

// ✅ Finish Cleaning Function
 function finishCleaning(roomNumber) {
            const username = localStorage.getItem("username");
            const finishTime = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Phnom_Penh' });

            fetch(`${apiUrl}/logs/finish`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ roomNumber, username, finishTime, status: "finished" })
            })
            .then(response => response.json())
            .then(data => {
                if (data.message.includes("finished")) {
                    document.getElementById(`finish-${roomNumber}`).disabled = true;
                } else {
                    alert("Failed to finish cleaning.");
                }
            })
            .catch(error => {
                console.error("❌ Error finishing cleaning:", error);
                alert("Failed to finish cleaning.");
            });
        }

 // ✅ Fix Duplicate Event Listeners
document.addEventListener("DOMContentLoaded", () => {
    socket.on("clearLogs", () => {
        console.log("🔄 Logs cleared remotely, resetting buttons...");
        localStorage.removeItem("cleaningStatus");

        document.querySelectorAll(".room button").forEach(button => {
            if (button.id.startsWith("start-")) {
                button.disabled = false;
            }
            if (button.id.startsWith("finish-")) {
                button.disabled = true;
            }
        });
    });
});

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

    // ✅ Update localStorage so it persists after refresh
    
let cleaningStatus = JSON.parse(localStorage.getItem("cleaningStatus")) || {};
logs.forEach(log => {
    let roomNumber = log.roomNumber; // Ensure roomNumber is defined
    cleaningStatus[roomNumber] = {
        started: (log.status === "in_progress"),
        finished: (log.status === "finished"),
    };
});
localStorage.setItem("cleaningStatus", JSON.stringify(cleaningStatus));

  function checkAuth() {
    const token = localStorage.getItem("token");
    
    if (!token) {
        console.warn("⚠️ No auth token found. Redirecting to login.");
        showLogin();
        return;
    }

    // Decode token and check expiration
    const payload = JSON.parse(atob(token.split('.')[1])); // Decode JWT
    const expTime = payload.exp * 1000; // Convert to milliseconds
    const currentTime = Date.now();

    if (expTime < currentTime) {
        console.warn("❌ JWT Token Expired. Logging out...");
        logout();
        return;
    }

    fetch(`${apiUrl}/auth/validate`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` }
    })
    .then(res => res.json())
    .then(data => {
        if (data.valid) {
            console.log("✅ Valid token. User is still logged in.");
            showDashboard();
        } else {
            console.warn("❌ Invalid auth token. Logging out.");
            logout();
        }
    })
    .catch(err => {
        console.error("❌ Error validating auth:", err);
        logout();
    });
}

function formatRoomNumber(roomNumber) {
            return roomNumber.toString().padStart(3, '0');
        }
// ✅ Fix restoreCleaningStatus()
function restoreCleaningStatus() {
    fetch(`${apiUrl}/logs`)
        .then(response => response.json())
        .then(logs => {
            if (!logs || logs.length === 0) {
                console.warn("⚠️ No logs found to restore.");
                return;
            }

            logs.forEach(log => {
                const startButton = document.getElementById(`start-${log.roomNumber}`);
                const finishButton = document.getElementById(`finish-${log.roomNumber}`);

                if (startButton && finishButton) {
                    if (log.status === "in_progress") {
                        startButton.disabled = true;
                        finishButton.disabled = false;
                    } else if (log.status === "finished") {
                        startButton.disabled = true;
                        finishButton.disabled = true;
                    }
                }
            });
        })
        .catch(error => console.error("❌ Error fetching logs:", error));
}


// Apply statuses to buttons after fetching logs
function applyCleaningStatus(cleaningStatus) {
    Object.keys(cleaningStatus).forEach(roomNumber => {
        const startButton = document.getElementById(`start-${roomNumber}`);
        const finishButton = document.getElementById(`finish-${roomNumber}`);

        if (cleaningStatus[roomNumber].started) {
            if (startButton) startButton.disabled = true;
            if (finishButton) finishButton.disabled = !cleaningStatus[roomNumber].finished;
        }
    });
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

// ✅ Handle `clearLogs` event from WebSocket
socket.on("clearLogs", () => {
    console.log("🔄 Logs cleared remotely, resetting buttons...");

    // ✅ Reset localStorage
    localStorage.removeItem("cleaningStatus");

    // ✅ Reset buttons to normal state
    document.querySelectorAll(".room button").forEach(button => {
        if (button.id.startsWith("start-")) {
            button.disabled = false;
        }
        if (button.id.startsWith("finish-")) {
            button.disabled = true;
        }
    });
});
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
       

const apiUrl = "https://housekeeping-production.up.railway.app";
const token = localStorage.getItem("token");

window.socket = null;

document.addEventListener("DOMContentLoaded", async () => {
    const validToken = await ensureValidToken();
    if (validToken) connectWebSocket();
    checkAuth();
    loadRooms();
});

async function ensureValidToken() {
    let token = localStorage.getItem("token");
    if (!token) {
        token = await refreshToken();
        if (!token) {
            logout();
            return null;
        }
    }
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.exp * 1000 < Date.now()) {
            token = await refreshToken();
            if (!token) {
                logout();
                return null;
            }
            localStorage.setItem("token", token); // ✅ Ensure new token is saved
        }
        return token;
    } catch {
        logout();
        return null;
    }
}


async function refreshToken() {
    const refreshToken = localStorage.getItem("refreshToken");
    if (!refreshToken) return null;

    try {
        const res = await fetch(`${apiUrl}/auth/refresh`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: refreshToken })
        });

        if (!res.ok) throw new Error(`HTTP error! Status: ${res.status}`);

        const data = await res.json();
        if (!data.token) throw new Error("Invalid token received.");

        localStorage.setItem("token", data.token);
        return data.token;
    } catch (error) {
        console.error("Error refreshing token:", error);
        return null;
    }
}


let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

async function connectWebSocket() {
    let token = await ensureValidToken();
    if (!token) return;

    window.socket = io(apiUrl, {
        auth: { token },
        reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
        timeout: 5000
    });

    window.socket.on("connect", () => {
        console.log("WebSocket connected");
        reconnectAttempts = 0; // ✅ Reset attempts on successful connection
    });

    window.socket.on("connect_error", async (err) => {
        console.warn("WebSocket connection error:", err.message);
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttempts++;
            const newToken = await refreshToken();
            if (newToken) {
                connectWebSocket();
            } else {
                logout();
            }
        } else {
            console.error("Maximum WebSocket reconnect attempts reached.");
            logout();
        }
    });

    window.socket.on("disconnect", (reason) => console.warn("WebSocket disconnected:", reason));
    window.socket.on("update", ({ roomNumber, status }) => updateButtonStatus(roomNumber, status));
}
function safeEmit(event, data = {}) {
    if (window.socket && window.socket.connected) {
        window.socket.emit(event, data);
    } else {
        console.warn(`WebSocket is not connected. Cannot emit ${event}`);
    }
}
function updateButtonStatus(roomNumber, status) {
    const startButton = document.getElementById(`start-${roomNumber}`);
    const finishButton = document.getElementById(`finish-${roomNumber}`);
    if (!startButton || !finishButton) return;
    
    startButton.disabled = status !== "pending";
    finishButton.disabled = status !== "in_progress";
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
function formatRoomNumber(roomNumber) {
            return roomNumber.toString().padStart(3, '0');
        }
// ✅ Fix restoreCleaningStatus()
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

async function restoreCleaningStatus() {
    try {
        const res = await fetch(`${apiUrl}/logs`);
        const logs = await res.json();
        logs.forEach(log => updateButtonStatus(log.roomNumber, log.status));
    } catch (error) {
        console.error("Error fetching logs:", error);
    }
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

async function startCleaning(roomNumber) {
    const username = localStorage.getItem("username");
    try {
        const res = await fetch(`${apiUrl}/logs/start`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roomNumber, username, status: "in_progress" })
        });
        const data = await res.json();
        if (data.message.includes("started")) {
            updateButtonStatus(roomNumber, "in_progress");
            window.socket.emit("update", { roomNumber, status: "in_progress" });
        }
    } catch (error) {
        console.error("Error starting cleaning:", error);
    }
}

async function finishCleaning(roomNumber) {
    const username = localStorage.getItem("username");
    try {
        const res = await fetch(`${apiUrl}/logs/finish`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roomNumber, username, status: "finished" })
        });
        const data = await res.json();
        if (data.message.includes("finished")) updateButtonStatus(roomNumber, "finished");
    } catch (error) {
        console.error("Error finishing cleaning:", error);
    }
}

function logout() {
    localStorage.clear();
    if (window.socket) window.socket.disconnect();
    location.reload();
}

function checkAuth() {
    const token = localStorage.getItem("token");
    if (!token) return logout();
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.exp * 1000 < Date.now()) return logout();
        fetch(`${apiUrl}/auth/validate`, {
            method: "GET",
            headers: { Authorization: `Bearer ${token}` }
        }).then(res => res.json()).then(data => {
            if (!data.valid) logout();
        }).catch(() => logout());
    } catch {
        logout();
    }
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
       

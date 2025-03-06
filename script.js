const apiUrl = "https://housekeeping-production.up.railway.app"; // API calls
    const socket = io(apiUrl); // Initialize WebSocket connection

 // ✅ WebSocket Event Handlers (Only Added Once)
    socket.on("connect", () => {
    console.log("✅ WebSocket connected");
    socket.emit("client-ready", { message: "Client is ready" });
});

socket.on("connect_error", (err) => {
    console.error("❌ WebSocket connection error:", err);
});

socket.on("disconnect", (reason) => {
    console.warn("⚠️ WebSocket disconnected:", reason);
    setTimeout(() => {
        if (!socket.connected) {
            console.log("🔄 Attempting to reconnect...");
            socket.connect();
        }
    }, 5000); // ✅ Prevents excessive reconnection attempts
});

socket.on("connected", (data) => {
    console.log("🟢 Server Says:", data.message);
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
    socket.emit(event, data);
}
        document.addEventListener("DOMContentLoaded", function() {
    console.log("✅ JavaScript is loaded!");

    window.login = function() {  
        console.log("✅ Login function is now defined!");
    };

    window.toggleAuth = function() {
        console.log("✅ toggleAuth function is now defined!");
    };
});

// ✅ Fix API Requests
window.login = function(event) {  
    if (event) event.preventDefault(); // Prevents page reload
    
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
            localStorage.setItem("authToken", data.token);
            localStorage.setItem("username", username);
            alert("✅ Login successful!");
            showDashboard(); // Ensure this function is working
        } else {
            alert("❌ Invalid username or password.");
        }
    })
    .catch(error => {
        console.error("❌ Login Error:", error);
        alert("⚠️ Failed to log in.");
    });
};

window.toggleAuth = function() {
    const signupForm = document.getElementById("signup-form");
    if (signupForm) {
        signupForm.classList.toggle("hidden");
    } else {
        console.error("❌ Error: Signup form element not found!");
    }
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
     

function showLogin() {
    document.getElementById("auth-section").classList.remove("hidden");
    document.getElementById("dashboard").classList.add("hidden");
}

  function showDashboard() {
    console.log("🚀 showDashboard() was called!");
    
    const authSection = document.getElementById("auth-section");
    const dashboard = document.getElementById("dashboard");

    if (!authSection || !dashboard) {
        console.error("❌ Error: Missing dashboard/auth-section elements!");
        return;
    }

    authSection.classList.add("hidden");
    dashboard.classList.remove("hidden");

    const username = localStorage.getItem("username") || "User";
    const userNameElement = document.getElementById("user-name");

    if (userNameElement) {
        userNameElement.textContent = username;
    } else {
        console.warn("⚠️ User name element not found!");
    }

    loadRooms();
    loadLogs();
} // ✅ Closing bracket correctly placed here



    function logout() {
    console.log("🔴 Logging out...");
    localStorage.removeItem("authToken");
    localStorage.removeItem("username");
    showLogin();
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

   function formatTime(timestamp) {
    if (!timestamp) return "N/A";
    return new Date(timestamp).toLocaleString("en-US", { 
        timeZone: "Asia/Phnom_Penh",
        hour12: true 
    });
}function loadLogs() {
    fetch(`${apiUrl}/logs`)
        .then(response => response.json())
        .then(logs => {
            if (!Array.isArray(logs)) {
                console.warn("⚠️ Logs response is not an array.");
                return;
            }
            const logTable = document.querySelector("#logTable tbody");
            logTable.innerHTML = ""; // Clear existing logs
            let cleaningStatus = JSON.parse(localStorage.getItem("cleaningStatus")) || {};
            let updatesMade = false;
            
            const today = new Date().toISOString().split('T')[0];

            // ✅ Sort logs: First, show unfinished logs, then sort by finishTime (ascending)
            logs.sort((a, b) => {
                if (!a.finishTime && b.finishTime) return -1; // Unfinished logs come first
                if (a.finishTime && !b.finishTime) return 1;
                return new Date(b.startTime) - new Date(a.startTime); // Sort by latest startTime
            });
            
            logs.forEach(log => {
                if (!log.roomNumber) return;
                
                let roomNumber = String(log.roomNumber).trim(); // Ensure roomNumber is always a valid string
                let status = log.status || "not_started"; // ✅ Default to "not_started" if missing
                
                if (cleaningStatus[roomNumber] !== status) {
                    cleaningStatus[roomNumber] = status;
                    updateButtonStatus(roomNumber, status);
                    updatesMade = true;
                }

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

            if (updatesMade) {
                localStorage.setItem("cleaningStatus", JSON.stringify(cleaningStatus));
                console.log("✅ Cleaning status updated.");
            }

            // ✅ Moved closing bracket to the correct position
            if (logTable.innerHTML === "") {
                logTable.innerHTML = "<tr><td colspan='5'>No logs found for today.</td></tr>";
            }
        }) // <-- Correct closing bracket placement
        .catch(error => console.error("❌ Error fetching logs:", error));
} // <-- Function closes properly


// ✅ Restore Button States on Page Load
window.addEventListener("load", () => {
    restoreCleaningStatus();
});
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

    
// ✅ Ensure localStorage persists after refresh
let cleaningStatus = JSON.parse(localStorage.getItem("cleaningStatus")) || {};
if (typeof cleaningStatus !== "object" || cleaningStatus === null) {
    cleaningStatus = {}; // Ensure it's an object
}
   function checkAuth() {
            if (localStorage.getItem("authToken")) {
                showDashboard();
            } else {
                showLogin();
            }
        }
function formatRoomNumber(roomNumber) {
            return roomNumber.toString().padStart(3, '0');
        }
// ✅ Fix restoreCleaningStatus()
function restoreCleaningStatus() {

    let cleaningStatus = JSON.parse(localStorage.getItem("cleaningStatus")) || {};

    // ✅ First, apply saved state to buttons for a faster UI update
    Object.keys(cleaningStatus).forEach(roomNumber => {
        const startButton = document.getElementById(`start-${roomNumber}`);
        const finishButton = document.getElementById(`finish-${roomNumber}`);

        if (!startButton || !finishButton) {
            console.warn(`⚠️ Buttons for Room ${roomNumber} not found.`);
            return;
        }

        if (cleaningStatus[roomNumber] === "in_progress") {
            startButton.disabled = true;
            finishButton.disabled = false;
        } else if (cleaningStatus[roomNumber] === "finished") {
            startButton.disabled = true;
            finishButton.disabled = true;
        }
    });
    
    fetch(`${apiUrl}/logs`)
        .then(response => response.json())
        .then(logs => {
            if (!logs || logs.length === 0) {
                console.warn("⚠️ No logs found to restore.");
                return;
            }

            logs.forEach(log => {
                const roomNumber = log.roomNumber;
                const startButton = document.getElementById(`start-${log.roomNumber}`);
                const finishButton = document.getElementById(`finish-${log.roomNumber}`);
                
                 if (!startButton || !finishButton) return;
                
                if (log.status === "in_progress") {
                    startButton.disabled = true;
                    finishButton.disabled = false;
                    cleaningStatus[roomNumber] = "in_progress";
                } else if (log.status === "finished") {
                    startButton.disabled = true;
                    finishButton.disabled = true;
                    cleaningStatus[roomNumber] = "finished";
                }
            });
            // ✅ Store the latest status in localStorage
            localStorage.setItem("cleaningStatus", JSON.stringify(cleaningStatus));
        })
        .catch(error => console.error("❌ Error fetching logs:", error));
}
 
window.addEventListener("load", () => {
    restoreCleaningStatus();
});
// ✅ Live Update from Server
socket.on("update", (data) => {
    console.log("🔄 Live Update Received:", data);
    updateButtonStatus(data.roomNumber, data.status);
    loadLogs();  // Refresh logs instantly
});
        function checkAuth() {
    if (localStorage.getItem("authToken")) {
        showDashboard();
    } else {
        showLogin();
    }
}

        // ✅ Function to attempt reconnection
function attemptReconnect() {
    const reconnectInterval = setInterval(() => {
        if (!socket.connected) {
            console.log("🔄 Attempting to reconnect...");
            socket.connect();
        } else {
            clearInterval(reconnectInterval); // Stop retrying once reconnected
        }
    }, 5000);
}
        // ✅ Function to update buttons on all devices
function updateButtonStatus(roomNumber, status) {
    if (!status) {
        console.warn(`⚠️ Status for Room ${roomNumber} is undefined.`);
        return; // Prevents applying an invalid status
    }
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
    }

    // ✅ Store in localStorage for persistence
    let cleaningStatus = JSON.parse(localStorage.getItem("cleaningStatus")) || {};
    cleaningStatus[roomNumber] = status;
    localStorage.setItem("cleaningStatus", JSON.stringify(cleaningStatus));
    console.log(`✅ Updated status for Room ${roomNumber}: ${status}`);
} // <-- This closing bracket should be here, not earlier!

function updateCleaningStatus(logs) {
    if (!Array.isArray(logs)) {
        console.warn("⚠️ Logs data is not an array:", logs);
        return;
    }

    let cleaningStatus = JSON.parse(localStorage.getItem("cleaningStatus")) || {};
    if (typeof cleaningStatus !== "object" || cleaningStatus === null) {
        cleaningStatus = {}; // Ensure it's an object
    }

    logs.forEach(log => {
        let roomNumber = log.roomNumber ? String(log.roomNumber).trim() : null;

        if (!roomNumber) {
            console.warn("⚠️ Skipping log: roomNumber is missing or invalid!", log);
            return;
        }

        const validStatuses = ["in_progress", "finished"];
        if (!validStatuses.includes(log.status)) {
            console.warn(`⚠️ Skipping invalid status for Room ${roomNumber}:`, log.status);
            return;
        }

        cleaningStatus[roomNumber] = {
            started: log.status === "in_progress",
            finished: log.status === "finished",
        };
    });

    localStorage.setItem("cleaningStatus", JSON.stringify(cleaningStatus));
}

// ✅ Call this function after fetching logs
fetch(`${apiUrl}/logs`)
    .then(response => response.json())
    .then(data => updateCleaningStatus(data))
    .catch(error => console.error("❌ Error fetching logs:", error));


        function resetButtonStatus() {
    console.log("🔄 Resetting button statuses...");

    // Clear local storage
    localStorage.removeItem("cleaningStatus");

    // Reset all buttons
    document.querySelectorAll(".room button").forEach(button => {
        if (button.id.startsWith("start-")) {
            button.disabled = false;
        }
        if (button.id.startsWith("finish-")) {
            button.disabled = true;
        }
    });
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
                    let cleaningStatus = JSON.parse(localStorage.getItem("cleaningStatus")) || {};
                    cleaningStatus[roomNumber] = "in_progress";
                    localStorage.setItem("cleaningStatus", JSON.stringify(cleaningStatus));
                    updateButtonStatus(roomNumber, "in_progress");
                    
                    // ✅ Broadcast update to all connected devices
                    socket.emit("update", { roomNumber, status: "in_progress" });
                    
                    loadLogs(); // ✅ Reload logs immediately
                    
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
                    // ✅ Update local storage immediately
                    let cleaningStatus = JSON.parse(localStorage.getItem("cleaningStatus")) || {};
                    cleaningStatus[roomNumber] = "finished";
                    localStorage.setItem("cleaningStatus", JSON.stringify(cleaningStatus));
                     // ✅ Disable finish button to indicate completion
                    updateButtonStatus(roomNumber, "finished");
                
                    // ✅ Broadcast update to all connected devices
                    socket.emit("update", { roomNumber, status: "finished" });

                    loadLogs(); // ✅ Reload logs immediately
                } else {
                    alert("Failed to finish cleaning.");
                }
            })
            .catch(error => {
                console.error("❌ Error finishing cleaning:", error);
                alert("Failed to finish cleaning.");
            });
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
    if (!confirm("Are you sure you want to clear all logs? This action cannot be undone.")) {
        return; // Prevents accidental clearing
    }

    console.log("🧹 Clearing logs...");
    document.querySelector("#logTable tbody").innerHTML = "";

    localStorage.removeItem("cleaningStatus"); // ✅ Reset local storage

    document.querySelectorAll(".room button").forEach(button => {
        if (button.id.startsWith("start-")) {
            button.disabled = false;
        }
        if (button.id.startsWith("finish-")) {
            button.disabled = true;
        }
    });

    // ✅ Broadcast reset event to all devices
    socket.emit("clearLogs");

    fetch(`${apiUrl}/logs/clear`, { method: "POST" })
        .then(() => {
            console.log("✅ Logs cleared on server");
            loadLogs(); // ✅ Refresh logs immediately
        })
        .catch(error => console.error("❌ Error clearing logs:", error));
}

// ✅ Listen for Clear Logs Event from Other Devices
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

    loadLogs(); // ✅ Refresh logs across all devices
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
          window.addEventListener("load", () => {
    const token = localStorage.getItem("authToken");

    if (token) {
        fetch(`${apiUrl}/auth/validate`, {  // Ensure this endpoint correctly validates the token
            method: "GET",
            headers: { Authorization: `Bearer ${token}` }
        })
        .then(res => {
            if (!res.ok) throw new Error(`HTTP error! Status: ${res.status}`);
            return res.json();
        })
        .then(data => {
            if (data.valid) {
                console.log("✅ User is still logged in");
                showDashboard(); // ✅ Automatically show dashboard if authenticated
            } else {
                console.log("❌ Invalid token, logging out...");
                logout(); // Logout user if token is invalid
            }
        })
        .catch(err => {
            console.error("❌ Auth validation failed:", err);
            logout();
        });
    } else {
        showLogin(); // Ensure login form is displayed if there's no token
    }
});


       

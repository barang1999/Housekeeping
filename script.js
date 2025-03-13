const apiUrl = "https://housekeeping-production.up.railway.app";

let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;
window.socket = null;

document.addEventListener("DOMContentLoaded", async () => {
    console.log("🔄 Initializing housekeeping system...");

    await ensureValidToken();
    await loadDNDStatus();  // ✅ Load DND status first
    await loadLogs(); // ✅ Fetch logs before restoring buttons
    await restoreCleaningStatus(); // ✅ Ensure buttons are updated after logs are loaded
    await connectWebSocket(); // ✅ Connect WebSocket first for real-time updates
     
    // ✅ Ensure socket is available before emitting
    if (window.socket) {
        window.socket.emit("requestPriorityStatus");
    } else {
        console.warn("⚠️ WebSocket is not initialized. Retrying...");
        setTimeout(() => {
            if (window.socket) {
                window.socket.emit("requestPriorityStatus");
            } else {
                console.error("❌ WebSocket still not initialized. Check connection setup.");
            }
        }, 1000);
    }

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

/** ✅ WebSocket Connection & Event Handling */
async function connectWebSocket() {
    if (window.socket) {
        window.socket.removeAllListeners();
        window.socket.disconnect();
    }

    let token = await ensureValidToken();
    if (!token) {
        console.warn("❌ WebSocket connection aborted: No valid token.");
        return;
    }

    window.socket = io(apiUrl, {
        auth: { token },
        reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
        timeout: 5000
    });

    window.socket.on("connect", () => {
        console.log("✅ WebSocket connected successfully.");
        reconnectAttempts = 0;  // Reset attempts on successful connection
        safeEmit("requestDNDStatus"); // Ensure DND data loads
        safeEmit("requestButtonStatus"); // Ensure button statuses load
        safeEmit("requestPriorityStatus"); // ✅ Request priority data
    });

   // ✅ Handle incoming priority status updates
    window.socket.on("priorityStatus", (priorities) => {
        console.log("📡 Received Room Priority Data:", priorities);
        priorities.forEach(({ roomNumber, priority }) => {
            updateSelectedPriorityDisplay(String(roomNumber), priority);
        });
    });

    // ✅ Handle real-time priority updates safely
    window.socket.on("priorityUpdate", ({ roomNumber, priority }) => {
        if (!roomNumber || !priority) {
            console.warn("⚠️ Received invalid priorityUpdate event:", { roomNumber, priority });
            return;
        }

        console.log(`📡 Real-time Priority Update: Room ${roomNumber} -> ${priority}`);
        updateSelectedPriorityDisplay(String(roomNumber), priority);
    });


    
   window.socket.on("roomUpdate", async ({ roomNumber, status }) => {
    try {
        console.log(`🛎 Received Room Update: Room ${roomNumber} -> Status: ${status}`);
        updateButtonStatus(roomNumber, status);
        await loadLogs();
    } catch (error) {
        console.error("❌ Error processing room update:", error);
    }
});
    
      window.socket.on("dndUpdate", (data) => {
    if (!data || !data.roomNumber) {
        console.warn("⚠️ Invalid DND update received:", data);
        return;
    }

    console.log(`🚨 DND Update Received: Room ${data.roomNumber} -> Status: ${data.status}`);

    // ✅ Update localStorage immediately to restore faster after refresh
    localStorage.setItem(`dnd-${data.roomNumber}`, data.status);

    // ✅ Update UI immediately
    updateDNDStatus(data.roomNumber, data.status);
});
}

function reconnectWebSocket() {
    if (reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
        console.warn("❌ Max WebSocket reconnect attempts reached.");
        return;
    }

    reconnectAttempts++; // Increase count BEFORE attempting to reconnect
    setTimeout(() => {
        if (!window.socket || !window.socket.connected) {
            console.log(`🔄 Attempting WebSocket reconnect (${reconnectAttempts})...`);
            connectWebSocket(); // Try reconnecting
        }
    }, Math.min(5000 * reconnectAttempts, 30000));
}


/** ✅ Ensure WebSocket is Available Before Emitting */
let emitRetries = 0;
const MAX_EMIT_RETRIES = 5;

function safeEmit(event, data = {}) {
    if (!window.socket || !window.socket.connected) {
        console.warn(`⛔ WebSocket is not connected. Attempting reconnect before emitting ${event}...`);

        // Attempt to reconnect WebSocket before emitting
        reconnectWebSocket();

        if (emitRetries < MAX_EMIT_RETRIES) {
            setTimeout(() => safeEmit(event, data), 1000);
            emitRetries++;
        } else {
            console.error("❌ Max emit retry limit reached. Skipping event:", event);
        }
        return;
    }

    emitRetries = 0; // Reset retry count on successful emit
    window.socket.emit(event, data);
}


/** ✅ Ensure WebSocket is Properly Connected Before Usage */
function ensureWebSocketConnection() {
    let retryInterval = 1000;
    let reconnectAttempts = 0;
    const maxAttempts = 5; // Set max retry limit

    if (!window.socket || !window.socket.connected) {
        console.warn("⛔ WebSocket disconnected. Attempting reconnect...");
        const reconnect = setInterval(() => {
            if (window.socket && window.socket.connected) {
                console.log("✅ WebSocket reconnected.");
                clearInterval(reconnect);
            } else if (reconnectAttempts >= maxAttempts) {
                console.error("❌ Max WebSocket reconnect attempts reached.");
                clearInterval(reconnect);
            } else {
                console.warn(`🔄 Retrying WebSocket connection in ${retryInterval / 1000} seconds...`);
                retryInterval *= 2; // Exponential backoff
                connectWebSocket();
                reconnectAttempts++;
            }
        }, retryInterval);
    }
}


// ✅ Ensure buttons & priority dropdowns update after logs are loaded
async function updateButtonsFromLogs() {
    console.log("🔄 Updating button status and priority from logs...");

    const logs = await fetchWithErrorHandling(`${apiUrl}/logs`);
    if (!logs || !Array.isArray(logs)) {
        console.warn("⚠️ No valid logs found. Skipping button updates.");
        return;
    }

    logs.forEach(log => {
        let roomNumber = formatRoomNumber(log.roomNumber); // Ensure correct format
        const status = log.status || "pending";
        const dndStatus = log.dndStatus || "available";
        const priority = log.priority || "default"; // ✅ Ensure priority status is fetched

        updateButtonStatus(roomNumber, status, dndStatus);
        updatePriorityDropdown(roomNumber, priority); // ✅ Update priority dropdowns
    });

    console.log("✅ Buttons and priority dropdowns updated based on logs.");
}



async function fetchWithErrorHandling(url, options = {}) {
    try {
        console.log(`🔍 Fetching: ${url}`);
        const res = await fetch(url, options);
        const data = await res.json();

        if (!res.ok) {
            console.error(`❌ Request failed with status ${res.status}:`, data);
            return null;
        }

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
function togglePriorityDropdown(roomNumber) {
    const dropdown = document.getElementById(`priority-${roomNumber}`);
    if (!dropdown) return;

    const button = document.getElementById(`selected-priority-${roomNumber}`);

    // Ensure dropdown is properly centered
    const buttonRect = button.getBoundingClientRect();
    dropdown.style.top = `${buttonRect.bottom + window.scrollY}px`;
    dropdown.style.left = `${buttonRect.left + buttonRect.width / 2}px`;
    
    // Close all dropdowns before opening
    document.querySelectorAll(".priority-dropdown").forEach(drop => {
        if (drop !== dropdown) drop.classList.remove("show");
    });

    // Toggle the current dropdown
    dropdown.classList.toggle("show");
}

// Close dropdown when clicking outside
document.addEventListener("click", (event) => {
    if (!event.target.closest(".priority-container") && !event.target.classList.contains("priority-toggle")) {
        document.querySelectorAll(".priority-dropdown").forEach(dropdown => {
            dropdown.classList.remove("show");
        });
    }
});


function toggleDropdown() {
    document.querySelector(".priority-dropdown").classList.toggle("show");
}

function selectOption(element) {
    const button = document.querySelector(".priority-select");
    button.innerHTML = element.innerHTML; // Update button text with selected option
    document.querySelector(".priority-dropdown").classList.remove("show"); // Close dropdown
}

// Remove border and make background transparent for dropdown
const dropdowns = document.querySelectorAll(".priority-dropdown");
document.querySelectorAll(".priority-dropdown").forEach(dropdown => {
    dropdown.classList.add("minimal-dropdown"); // Instead of applying styles inline
});

async function loadRooms() {
    console.log("🔄 Loading rooms...");

    const floors = {
        "ground-floor": ["001", "002", "003", "004", "005", "006", "007", "011", "012", "013", "014", "015", "016", "017"],
        "second-floor": ["101", "102", "103", "104", "105", "106", "107", "108", "109", "110", "111", "112", "113", "114", "115", "116", "117"],
        "third-floor": ["201", "202", "203", "204", "205", "208", "209", "210", "211", "212", "213", "214", "215", "216", "217"]
    };

    // ✅ Fetch room priorities before rendering rooms
    let priorities = [];
    try {
        const response = await fetch(`${apiUrl}/logs/priority`);
        priorities = await response.json();
        console.log("✅ Room Priorities Fetched:", priorities);
    } catch (error) {
        console.error("❌ Error fetching room priorities:", error);
    }

    Object.keys(floors).forEach(floor => {
        const floorDiv = document.getElementById(floor);
        if (!floorDiv) {
            console.warn(`⚠️ Floor ${floor} element not found. Skipping.`);
            return;
        }

        floorDiv.innerHTML = ""; // Clear previous content

        floors[floor].forEach(room => {
            const roomDiv = document.createElement("div");
            roomDiv.classList.add("room");

            // ✅ FIXED TEMPLATE STRING ERROR
            roomDiv.innerHTML = `
                <span>Room ${room}</span>
                  <div class="priority-container">
                    <button class="priority-toggle" id="selected-priority-${room}" onclick="togglePriorityDropdown('${room}')">⚪</button>
                    <div class="priority-dropdown" id="priority-${room}">
                        <div class="priority-option" onclick="updatePriority('${room}', 'default')"><span class="white">⚪</span></div>
                        <div class="priority-option" onclick="updatePriority('${room}', 'sunrise')"><span class="red">🔴</span></div>
                        <div class="priority-option" onclick="updatePriority('${room}', 'early-arrival')"><span class="yellow">🟡</span></div>
                        <div class="priority-option" onclick="updatePriority('${room}', 'vacancy')"><span class="black">⚫</span></div>
                    </div>
                </div>
                <button id="start-${room}" onclick="startCleaning('${room}')">Cleaning</button>
                <button id="finish-${room}" onclick="finishCleaning('${room}')" disabled>Done</button>
                <button id="dnd-${room}" class="dnd-btn" onclick="toggleDoNotDisturb('${room}')">🚫</button>
            `;

            floorDiv.appendChild(roomDiv);

            // ✅ FIX: Ensure `priorities` is an array before calling `.find()`
            if (Array.isArray(priorities)) {
                const savedPriority = priorities.find(p => p.roomNumber === room)?.priority || "default";
                highlightSelectedPriority(room, savedPriority);
            } else {
                console.warn(`⚠️ Priorities data is not in expected format.`);
            }
        });
    });

    await restoreCleaningStatus();
    console.log("✅ Rooms loaded successfully with priorities.");
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

function updatePriorityDropdown(roomNumber, priority) {
    console.log(`🎯 Updating priority dropdown for Room ${roomNumber}: ${priority}`);

    const dropdownButton = document.querySelector(`#priority-${roomNumber}`);
    if (dropdownButton) {
        // Set the dropdown button display based on priority status
        const priorityIcons = {
            "high": "🔴",    // Red circle
            "medium": "🟠",  // Orange circle
            "low": "🟡",     // Yellow circle
            "default": "⚪"  // White circle (reset)
        };

        dropdownButton.innerHTML = priorityIcons[priority] || "⚪"; // Default to white
    } else {
        console.warn(`⚠️ Priority dropdown not found for Room ${roomNumber}`);
    }
}

function updatePriority(roomNumber, status) {
    const button = document.getElementById(`selected-priority-${roomNumber}`);
    if (!button) return;

    button.dataset.priority = status; // Store the status in a data attribute
    button.className = `priority-toggle ${status}`; // Apply a CSS class instead
    document.getElementById(`priority-${roomNumber}`).classList.remove("show"); // Close dropdown
}

/** ✅ Update Room Priority and Emit WebSocket Event */
function updatePriority(roomNumber, priority) {
    console.log(`🛎 Emitting WebSocket event: priorityUpdate for Room ${roomNumber} -> ${priority}`);

    // ✅ Save priority selection in localStorage
    localStorage.setItem(`priority-${roomNumber}`, priority);

    // ✅ Ensure WebSocket Connection before emitting
    if (!window.socket || !window.socket.connected) {
        console.warn(`⛔ WebSocket not connected. Reconnecting before emitting priority update...`);
        reconnectWebSocket();
    }

    // ✅ Emit WebSocket Event SAFELY
    safeEmit("priorityUpdate", { roomNumber, priority });

    // ✅ Update UI immediately
    updateSelectedPriorityDisplay(roomNumber, priority);

    // ✅ Hide dropdown after selection
    document.getElementById(`priority-${roomNumber}`).classList.remove("show");
}

// ✅ Function to Update Displayed Priority Button
function updateSelectedPriorityDisplay(roomNumber, priority) {
    console.log(`🔄 Restoring dropdown for Room ${roomNumber} -> Priority: ${priority}`);

    // Get the priority button (display button)
    const button = document.getElementById(`selected-priority-${roomNumber}`);
    
    // Get the dropdown list
    const dropdown = document.getElementById(`priority-${roomNumber}`);
    
    if (!button || !dropdown) {
        console.error(`❌ Missing priority elements for Room ${roomNumber}`);
        return;
    }

    // ✅ Define priority icons for display
    const priorityIcons = {
        "default": "⚪",
        "sunrise": "🔴",
        "early-arrival": "🟡",
        "vacancy": "⚫"
    };

    // ✅ Update button display with selected priority icon
    button.innerHTML = priorityIcons[priority] || "⚪";

    // ✅ Reset all dropdown options first (remove selection styles)
    dropdown.querySelectorAll(".priority-option").forEach(option => {
        option.classList.remove("selected");  // Remove any previous selection
    });

    // ✅ Highlight the correct selection in the dropdown
    const selectedOption = dropdown.querySelector(`.priority-option[data-value="${priority}"]`);
    if (selectedOption) {
        selectedOption.classList.add("selected"); // Mark as selected
    }
}

function highlightSelectedPriority(roomNumber, priority) {
    const priorityContainer = document.getElementById(`priority-${roomNumber}`);
    if (!priorityContainer) {
        console.warn(`⚠️ Priority dropdown not found for Room ${roomNumber}`);
        return;
    }

    // ✅ Reset previous selections using class-based approach
    const priorityOptions = priorityContainer.querySelectorAll(".priority-option");
    priorityOptions.forEach(option => option.classList.remove("selected"));

    // ✅ Apply selection class to the correct priority option
    const selectedOption = priorityContainer.querySelector(`.priority-option[data-value="${priority}"]`);
    if (selectedOption) {
        selectedOption.classList.add("selected");
    }
}


// ✅ Load Saved Priority on Page Load
document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".priority-toggle").forEach(button => {
        const roomNumber = button.id.replace("selected-priority-", "");
        const savedPriority = localStorage.getItem(`priority-${roomNumber}`) || "default";
        updateSelectedPriorityDisplay(roomNumber, savedPriority);
    });
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

async function fetchRoomStatuses() {
    try {
        console.log("🔄 Fetching room statuses...");
        
        // Fetch cleaning statuses
        const response = await fetch("https://housekeeping-production.up.railway.app/logs/status", {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${localStorage.getItem("token")}`
            }
        });

        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        const statuses = await response.json();

        console.log("✅ Room Statuses Fetched:", statuses);

        // Fetch room priorities
        const priorityResponse = await fetch("https://housekeeping-production.up.railway.app/logs/priority", {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${localStorage.getItem("token")}`
            }
        });

        if (!priorityResponse.ok) throw new Error(`HTTP error! Status: ${priorityResponse.status}`);
        const priorities = await priorityResponse.json();
        
        console.log("✅ Room Priorities Fetched:", priorities);

        // Loop through each room and update buttons & priority dropdowns
        Object.entries(statuses).forEach(([roomNumber, status]) => {
            updateButtonStatus(roomNumber, status);
            
            // ✅ Ensure `roomNumber` is treated as a string before matching
            const roomPriority = priorities.find(p => String(p.roomNumber) === String(roomNumber))?.priority || "default";

            console.log(`🔄 Restoring priority for Room ${roomNumber}: ${roomPriority}`);

            // Update the priority dropdown selection
            updateSelectedPriorityDisplay(roomNumber, roomPriority);
        });

    } catch (error) {
        console.error("❌ Error fetching room statuses or priorities:", error);
        alert("Failed to fetch room data. Check console for details.");
    }
}

// Call on page load
window.addEventListener("DOMContentLoaded", async () => {
    await fetchRoomStatuses();
});

// ✅ Ensuring correct room number format across the system
function formatRoomNumber(roomNumber) {
    return String(roomNumber).padStart(3, "0");
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

/** ✅ Load DND Status */
async function loadDNDStatus() {
    console.log("🔄 Restoring DND status for all rooms...");

    // ✅ Restore from localStorage first (ensures instant UI updates)
    document.querySelectorAll(".room").forEach(roomDiv => {
        const roomNumber = roomDiv.querySelector("span").innerText.replace("Room ", "").trim();
        let dndStatus = localStorage.getItem(`dnd-${roomNumber}`) || "available";
        updateDNDStatus(roomNumber, dndStatus);
    });

    // ✅ Fetch latest DND data from the server and update UI if needed
    const dndLogs = await fetchWithErrorHandling(`${apiUrl}/logs/dnd`);
    if (!Array.isArray(dndLogs) || dndLogs.length === 0) {
        console.warn("⚠️ No valid DND logs found.");
        return;
    }

    dndLogs.forEach(dnd => {
        const formattedRoom = formatRoomNumber(dnd.roomNumber);
        const dndStatus = dnd.dndStatus ? "dnd" : "available";

        updateDNDStatus(formattedRoom, dndStatus);

        // ✅ Ensure DND state persists in LocalStorage
        localStorage.setItem(`dnd-${formattedRoom}`, dndStatus);
    });

    console.log("✅ DND status restored from server.");
}

// ✅ Call this function on page load **before** WebSocket connections
document.addEventListener("DOMContentLoaded", async () => {
    await loadDNDStatus(); 
});

async function restoreCleaningStatus() {
    try {
        console.log("🔄 Restoring cleaning and DND status...");

        // 1️⃣ **Immediately restore from localStorage before API calls**
        document.querySelectorAll(".room").forEach(roomDiv => {
            const roomNumber = roomDiv.querySelector("span").innerText.replace("Room ", "").trim();
            let status = localStorage.getItem(`status-${roomNumber}`) || "available";
            let dndStatus = localStorage.getItem(`dnd-${roomNumber}`) || "available";

            updateButtonStatus(roomNumber, status, dndStatus);
        });

        // 2️⃣ **Fetch latest logs from the server**
        const [logs, dndLogs] = await Promise.all([
            fetchWithErrorHandling(`${apiUrl}/logs`),
            fetchWithErrorHandling(`${apiUrl}/logs/dnd`)
        ]);

        if (!logs || !Array.isArray(logs)) {
            console.warn("⚠ No cleaning logs found.");
            return;
        }

        // Convert DND logs into a lookup map
        const dndStatusMap = new Map(
            (Array.isArray(dndLogs) ? dndLogs : []).map(dnd => [formatRoomNumber(dnd.roomNumber), dnd.dndStatus])
        );

        logs.forEach(log => {
            let roomNumber = formatRoomNumber(log.roomNumber);
            let status = log.finishTime ? "finished" : log.startTime ? "in_progress" : "available";
            let dndStatus = dndStatusMap.get(roomNumber) ? "dnd" : "available";

            console.log(`🎯 Restoring Room ${roomNumber} -> Status: ${status}, DND: ${dndStatus}`);
            
            // ✅ Update buttons properly
            updateButtonStatus(roomNumber, status, dndStatus);

            // ✅ Store status locally for faster restoration on next refresh
            localStorage.setItem(`status-${roomNumber}`, status);
            localStorage.setItem(`dnd-${roomNumber}`, dndStatus);
        });

        console.log("✅ Cleaning and DND status restored successfully.");

    } catch (error) {
        console.error("❌ Error restoring cleaning status:", error);
    }
}


async function resetCleaningStatus(roomNumber) {
    const numericRoomNumber = parseInt(roomNumber, 10); // ✅ Ensure it's a Number

    if (isNaN(numericRoomNumber)) {
        console.error("❌ Invalid room number:", roomNumber);
        alert("❌ Room number is invalid.");
        return;
    }

    console.log(`🔄 Verifying Room ${numericRoomNumber} exists in logs before resetting...`);

    try {
        const logs = await fetchWithErrorHandling(`${apiUrl}/logs`);
        const roomLog = logs.find(log => log.roomNumber === numericRoomNumber); // ✅ Compare as number

        if (!roomLog) {
            console.warn(`⚠️ No log entry found for Room ${numericRoomNumber}`);
            alert(`❌ Reset Cleaning Failed: Room ${numericRoomNumber} not found in logs.`);
            return;
        }

        console.log(`✅ Room ${numericRoomNumber} found. Sending reset request...`);

        const res = await fetch(`${apiUrl}/logs/reset-cleaning`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roomNumber: numericRoomNumber }) // ✅ Send as number
        });

        const data = await res.json();
        console.log("🔍 API Response:", data);

        if (!res.ok) {
            console.error("❌ Failed to reset cleaning status:", data);
            alert(`❌ Reset Cleaning Failed: ${data.message}`);
            return;
        }

        console.log(`✅ Cleaning status reset successfully for Room ${numericRoomNumber}.`);

        updateButtonStatus(numericRoomNumber, "available", "available");

        await loadLogs();
    } catch (error) {
        console.error("❌ Error resetting cleaning status:", error);
    }
}

async function toggleDoNotDisturb(roomNumber) {
    const formattedRoom = formatRoomNumber(roomNumber);
    const dndButton = document.getElementById(`dnd-${formattedRoom}`);
    const startButton = document.getElementById(`start-${formattedRoom}`);
    const finishButton = document.getElementById(`finish-${formattedRoom}`);

    if (!dndButton) {
        console.error(`❌ DND button missing for Room ${formattedRoom}`);
        return;
    }

    const isDNDActive = dndButton.classList.contains("active-dnd");
    const newStatus = isDNDActive ? "available" : "dnd";

    // ✅ Ensure username is properly retrieved
    const username = localStorage.getItem("username");
    if (!username) {
        console.error("❌ No username found in localStorage. Cannot update DND.");
        alert("You must be logged in to update DND mode.");
        return;
    }

    try {
        console.log(`🔄 Sending DND update for Room ${formattedRoom} -> ${newStatus}`);

        const response = await fetch(`${apiUrl}/logs/dnd`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                roomNumber: formattedRoom,  // Ensure correct format
                status: newStatus,
                updatedBy: username // ✅ Include username for logging
            }),
        });

        // ✅ Check for API errors
        if (!response.ok) {
            const errorData = await response.json();
            console.error(`❌ Failed to update DND status: ${response.status}`, errorData);
            alert(`Error: ${errorData.message || "Failed to update DND status."}`);
            return;
        }

        console.log(`✅ DND status updated successfully for Room ${formattedRoom}`);

        // ✅ Send notification to Telegram
        const message = newStatus === "dnd"
            ? `🚫 Room ${formattedRoom} មិនត្រូវការសម្អាត ${username}`
            : `✅ Room ${formattedRoom} អាចចូលសម្អាតបាន`;
        sendTelegramMessage(message);

        // ✅ Emit WebSocket Event
        safeEmit("dndUpdate", { roomNumber: formattedRoom, status: newStatus });

        // ✅ Save DND status to LocalStorage
        localStorage.setItem(`dnd-${formattedRoom}`, newStatus);

        // ✅ Update UI
        updateDNDStatus(formattedRoom, newStatus);

        // ✅ Disable Start Cleaning when DND is active
        if (newStatus === "dnd") {
            startButton?.setAttribute("disabled", "true");
            startButton?.style.setProperty("background-color", "grey");
            finishButton?.setAttribute("disabled", "true");
            finishButton?.style.setProperty("background-color", "grey");
            dndButton.classList.add("active-dnd");
            dndButton.style.backgroundColor = "red";
        } else {
            startButton?.removeAttribute("disabled");
            startButton?.style.setProperty("background-color", "#008CFF");
            finishButton?.setAttribute("disabled", "true");
            finishButton?.style.setProperty("background-color", "grey");
            dndButton.classList.remove("active-dnd");
            dndButton.style.backgroundColor = "#008CFF00";
        }

    } catch (error) {
        console.error("❌ Error updating DND status:", error);
        alert("An error occurred while updating DND mode.");
    }
}


async function sendTelegramMessage(message) {
    try {
        const res = await fetch(`${apiUrl}/api/send-telegram`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message })
        });

        const data = await res.json();
        if (!res.ok) {
            console.error("❌ Failed to send Telegram message:", data);
            return;
        }

        console.log("✅ Telegram message sent:", message);
    } catch (error) {
        console.error("❌ Error sending Telegram message:", error);
    }
}


async function startCleaning(roomNumber) {
    let formattedRoom = formatRoomNumber(roomNumber);
    let numericRoomNumber = Number(roomNumber);
    const startButton = document.getElementById(`start-${formattedRoom}`);
    const finishButton = document.getElementById(`finish-${formattedRoom}`);
    const dndButton = document.getElementById(`dnd-${formattedRoom}`);

    if (!startButton || !finishButton || !dndButton) {
        console.error(`❌ Buttons not found for Room ${formattedRoom}`);
        return;
    }

    if (startButton.disabled) return; // Prevent multiple clicks

    // ✅ Show custom confirmation popup
    const confirmStart = await Swal.fire({
        title: `ចាប់ផ្ដើមសម្អាតបន្ទប់ ${roomNumber}?`,
        text: "អ្នកនឹងសម្អាតបន្ទប់នេះ?",
        icon: "question",
        showCancelButton: true,
        confirmButtonColor: "#3085d6",
        cancelButtonColor: "#d33",
        confirmButtonText: "Yes",
        cancelButtonText: "No"
    });

      if (!confirmStart.isConfirmed) {
        console.log(`🚫 Cleaning not started for Room ${roomNumber}`);
        return; // Exit function if user clicks "Cancel"
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

    // ✅ Send API request to update backend
    try {
        const res = await fetch(`${apiUrl}/logs/start`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roomNumber: formatRoomNumber(roomNumber), username })
        });
        
        // ✅ Update UI ONLY after successful API response
        const data = await res.json();
        if (!res.ok) {
            console.error("❌ Failed to Start Cleaning:", data);
            alert(`❌ Failed: ${data.message}`);
            return;
        }

        // ✅ Success message
        Swal.fire("Success!", `Room ${formattedRoom} cleaning started!`, "success");

        // Disable Start Cleaning and Enable Finish Cleaning
        startButton.disabled = true;
        startButton.style.backgroundColor = "grey";
        finishButton.disabled = false;
        finishButton.style.backgroundColor = "#008CFF";
        console.log(`✅ Room ${formattedRoom} cleaning started.`);

        // ✅ Send notification to Telegram
        sendTelegramMessage(`🧹 Room ${formattedRoom} ចាប់ផ្ដើមសម្អាតដោយ ${username}`);
        
        safeEmit("roomUpdate", { roomNumber, status: "in_progress" });

         // ✅ Update UI Immediately
        updateButtonStatus(formatRoomNumber(roomNumber), "in_progress");

        // ✅ Ensure fresh logs are loaded
        await loadLogs();

    } catch (error) {
        console.error("❌ Error starting cleaning:", error);
        startButton.disabled = false; // Re-enable button on failure
        Swal.fire("Error", "An unexpected error occurred while starting cleaning.", "error");
    }
}

async function finishCleaning(roomNumber) {
    const formattedRoom = formatRoomNumber(roomNumber);
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

    // ✅ Send API request to update backend
    try {
        const res = await fetch(`${apiUrl}/logs/finish`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({  roomNumber: formatRoomNumber(roomNumber),username, status: "finished" })
        });

        const data = await res.json();
        if (!res.ok) {
            console.error("❌ Failed to Finish Cleaning:", data);
            alert(`❌ Failed: ${data.message}`);
            return;
        }

         // Disable Finish Button and Change Color to Green
        finishButton.disabled = true;
        finishButton.style.backgroundColor = "green";

        // ✅ Send notification to Telegram
        sendTelegramMessage(`✅ Room ${formattedRoom} ត្រូវបានសម្អាតរួចរាល់ដោយ ${username}`);

       // ✅ Emit WebSocket Event for Real-Time Updates
        safeEmit("roomUpdate", { roomNumber, status: "finished" });

        // ✅ Update UI Immediately
        updateButtonStatus(formatRoomNumber(roomNumber), "finished");

        // ✅ Ensure fresh logs are loaded
        await loadLogs();

    } catch (error) {
        console.error("❌ Error finishing cleaning:", error);
    }
}

function updateButtonStatus(roomNumber, status, dndStatus = "available") {
    let formattedRoom = formatRoomNumber(roomNumber);
    const startButton = document.getElementById(`start-${formattedRoom}`);
    const finishButton = document.getElementById(`finish-${formattedRoom}`);
    const dndButton = document.getElementById(`dnd-${formattedRoom}`);

    if (!startButton || !finishButton || !dndButton) {
        console.warn(`⚠️ Buttons for Room ${formattedRoom} not found in DOM`);
        return;
    }

    console.log(`🎯 Updating Room ${formattedRoom} -> Status: ${status}, DND: ${dndStatus}`);

    // ✅ Update Start and Finish buttons based on cleaning status
    if (status === "finished") {
        startButton.disabled = true;
        startButton.style.backgroundColor = "grey";
        finishButton.disabled = true;
        finishButton.style.backgroundColor = "green";
    } else if (status === "in_progress") {
        startButton.disabled = true;
        startButton.style.backgroundColor = "grey";
        finishButton.disabled = false;
        finishButton.style.backgroundColor = "#008CFF";
    } else {
        startButton.disabled = false;
        startButton.style.backgroundColor = "#008CFF";
        finishButton.disabled = true;
        finishButton.style.backgroundColor = "grey";
    }

    // ✅ Ensure DND mode is handled separately
    if (dndStatus === "dnd") {
        console.log(`🚨 Room ${formattedRoom} is in DND mode - Disabling Start Cleaning`);
        startButton.disabled = true;
        startButton.style.backgroundColor = "grey";
        dndButton.classList.add("active-dnd");
        dndButton.style.backgroundColor = "red";
    } else {
        console.log(`✅ Room ${formattedRoom} is available - Enabling Start Cleaning`);
        dndButton.classList.remove("active-dnd");
        dndButton.style.backgroundColor = "#008CFF00";

        // Only enable start button if cleaning is not in progress or finished
        if (status === "available") {
            startButton.disabled = false;
            startButton.style.backgroundColor = "#008CFF";
        }
    }
}


// Ensure updateButtonStatus is being called after fetching logs
async function loadLogs() {
    console.log("🔄 Fetching cleaning logs...");
    try {
        const logs = await fetchWithErrorHandling(`${apiUrl}/logs`);
        const dndLogs = await fetchWithErrorHandling(`${apiUrl}/logs/dnd`);
        console.log("✅ API Cleaning Logs Response:", JSON.stringify(logs, null, 2));

        if (!logs || !Array.isArray(logs)) {
            console.warn("⚠️ No valid logs found. Setting empty table.");
            document.querySelector("#logTable tbody").innerHTML = "<tr><td colspan='5'>No logs found.</td></tr>";
            return;
        }

         // ✅ Ensure `dndLogs` is properly initialized as an array
        const dndStatusMap = new Map(
            (Array.isArray(dndLogs) ? dndLogs : []).map(dnd => [dnd.roomNumber, dnd.dndStatus])
        );

        const logTable = document.querySelector("#logTable tbody");
        logTable.innerHTML = ""; // Clear existing logs

        let cleaningStatus = {};

        // ✅ Sort logs: "In Progress" first, then latest logs first
        logs.sort((a, b) => {
            if (a.status === "in_progress" && b.status !== "in_progress") return -1;
            if (b.status === "in_progress" && a.status !== "in_progress") return 1;
            return new Date(b.startTime || 0) - new Date(a.startTime || 0);
        });

        logs.forEach(log => {
            console.log("📌 Log Entry:", log); // Debug individual log entries

            let roomNumber = String(log.roomNumber).padStart(3, "0"); // ✅ Ensure consistent 3-digit format
            let startTime = log.startTime ? new Date(log.startTime).toLocaleString('en-US', { timeZone: 'Asia/Phnom_Penh' }) : "N/A";
            let startedBy = log.startedBy || "-";
            let finishTime = log.finishTime ? new Date(log.finishTime).toLocaleString('en-US', { timeZone: 'Asia/Phnom_Penh' }) : "In Progress...";
            let finishedBy = log.finishedBy || "-";
            let status = log.finishTime ? "finished" : "in_progress";
            let dndStatus = dndStatusMap.get(log.roomNumber) ? "dnd" : "available";
            // ✅ Calculate Duration
            let duration = "-";
            if (log.startTime && log.finishTime) {
                let durationMs = new Date(log.finishTime) - new Date(log.startTime);
                let minutes = Math.floor(durationMs / (1000 * 60));
                duration = minutes > 0 ? `${minutes} min` : "< 1 min";
            }

            // ✅ Update button status but do NOT override DND mode
            updateButtonStatus(roomNumber, status, dndStatus);

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
                <td>${duration}</td>  <!-- ✅ Add Duration Column -->
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

function updateDNDStatus(roomNumber, status) {
    const formattedRoom = formatRoomNumber(roomNumber);
    const dndButton = document.getElementById(`dnd-${formattedRoom}`);
    const startButton = document.getElementById(`start-${formattedRoom}`);
    const finishButton = document.getElementById(`finish-${formattedRoom}`);

    if (!dndButton) {
        console.warn(`⚠️ DND button missing for Room ${formattedRoom}.`);
        return;
    }

    if (status === "dnd") {
        console.log(`🚨 Room ${formattedRoom} is in DND mode - Disabling Start Cleaning`);
        dndButton.classList.add("active-dnd");
        dndButton.style.backgroundColor = "red";

        // ✅ Disable and grey out Start Cleaning button
        if (startButton) {
            startButton.disabled = true;
            startButton.style.backgroundColor = "grey";
        }
        
        // ✅ Disable Finish button (optional, to prevent incomplete cleaning)
        if (finishButton) {
            finishButton.disabled = true;
            finishButton.style.backgroundColor = "grey";
        }

    } else {
        console.log(`✅ Room ${formattedRoom} is available - Enabling Start Cleaning`);
        dndButton.classList.remove("active-dnd");
        dndButton.style.backgroundColor = "#008CFF00";

        // ✅ Re-enable Start Cleaning button
        if (startButton) {
            startButton.disabled = false;
            startButton.style.backgroundColor = "#008CFF";
        }

        // ✅ Keep Finish button disabled (unless room is in progress)
        if (finishButton) {
            finishButton.disabled = true;
            finishButton.style.backgroundColor = "grey";
        }
    }
}

function logout() {
    console.log("🔴 Logging out...");
    if (window.socket) {
        window.socket.disconnect();
        window.socket = null;
    }

    localStorage.clear();
    sessionStorage.clear();
    alert("✅ You have been logged out.");
}

async function clearLogs() {
    console.log("🧹 Clearing all logs and resetting room statuses...");

    try {
        // ✅ Send request to clear logs on the server first
        const res = await fetch(`${apiUrl}/logs/clear`, { method: "POST" });

        if (!res.ok) {
            const errorData = await res.json();
            console.error("❌ Error clearing logs on server:", errorData);
            alert(`❌ Failed to clear logs: ${errorData.message}`);
            return;
        }

        console.log("✅ Logs cleared successfully on the server.");

        // ✅ Reset UI only after API confirmation
        document.querySelector("#logTable tbody").innerHTML = "";

        // ✅ Reset all button states including DND
        document.querySelectorAll(".room button").forEach(button => {
            if (button.id.startsWith("start-")) {
                button.style.backgroundColor = "#008CFF";
                button.disabled = false;
            } else if (button.id.startsWith("finish-")) {
                button.style.backgroundColor = "grey";
                button.disabled = true;
            } else if (button.id.startsWith("dnd-")) {
                button.style.backgroundColor = "#008CFF00";
                button.classList.remove("active-dnd");
            }
        });

        // ✅ Reset all priority dropdown buttons
        document.querySelectorAll(".priority-toggle").forEach(button => {
            button.innerHTML = "⚪"; // Default white circle
        });

        // ✅ Reset all priority dropdowns in LocalStorage
        document.querySelectorAll(".priority-dropdown").forEach(dropdown => {
            dropdown.classList.remove("show"); // Close dropdowns
        });

        // ✅ Clear relevant keys from LocalStorage
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith("priority-") || key.startsWith("status-") || key.startsWith("dnd-")) {
                localStorage.removeItem(key);
            }
        });

        console.log("✅ Local storage logs and statuses cleared.");

        // ✅ Ensure WebSocket is connected before emitting
        if (window.socket && window.socket.connected) {
            console.log("📡 Emitting WebSocket event: clearLogs");
            window.socket.emit("clearLogs");

            console.log("📡 Emitting WebSocket event: updatePriorityStatus");
            window.socket.emit("updatePriorityStatus", { status: "reset" });
        } else {
            console.warn("⚠️ WebSocket is not connected. Attempting to reconnect...");
            reconnectWebSocket();
        }

        // ✅ Reload logs after clearing to ensure UI consistency
        await loadLogs();

    } catch (error) {
        console.error("❌ Error clearing logs:", error);
        alert("An unexpected error occurred while clearing logs.");
    }
}

    
function exportLogs() {
    if (!window.jspdf) {
        console.error("❌ jsPDF library is not loaded.");
        return;
    }

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF();
    pdf.text("Cleaning Logs - Today's Records", 10, 10);

    let logs = [];

    // Get today's date in "YYYY-MM-DD" format
    const today = new Date().toISOString().split('T')[0];

    document.querySelectorAll("#logTable tbody tr").forEach(row => {
        let rowData = Array.from(row.children).map(cell => cell.innerText);
        let roomNumber = formatRoomNumber(rowData[0].trim()); // Ensure correct format

        // Extract and validate date
        let logStartTime = rowData[1].trim();
        let logDate = "";
        if (!isNaN(Date.parse(logStartTime))) {
            logDate = new Date(logStartTime).toLocaleDateString('en-CA', { timeZone: 'Asia/Phnom_Penh' });
        }

        console.log(`Checking Log: ${logDate} vs Today: ${today}`);

        if (logDate === today) {
            rowData[0] = roomNumber; // Ensure room numbers are formatted correctly
            logs.push(rowData);
        }
    });

    if (logs.length === 0) {
        alert("No logs found for today.");
        return;
    }

    // ✅ Sort logs by Room Number (ascending order: 001, 002, 003...)
    logs.sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10));

    pdf.autoTable({
        head: [["Room", "Start Time", "Started By", "Finish Time", "Finished By", "Duration"]], // ✅ Includes Duration
        body: logs,
    });

    pdf.save("cleaning_logs_today.pdf");

}

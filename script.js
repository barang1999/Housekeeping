    const apiUrl = "https://housekeeping-production.up.railway.app";

    let reconnectAttempts = 0;
    let inspectionLogs = []; // Declare it at the top
    let onlineUsernames = [];
    const MAX_RECONNECT_ATTEMPTS = 3;
    window.socket = null;

document.addEventListener("DOMContentLoaded", async () => {
  Swal.fire({
    title: "Loading...",
    allowOutsideClick: false,
    didOpen: () => {
      Swal.showLoading();
    }
  });

  console.log("🔄 Initializing housekeeping system...");

  try {
    // === Restore Inspection Logs from LocalStorage ===
    const savedLogs = JSON.parse(localStorage.getItem("inspectionLogs"));
    if (savedLogs) {
      inspectionLogs = savedLogs;
      restoreAllInspectionButtons();
      console.log("✅ Restored inspection logs from localStorage.");
    }

    // ✅ Restore Priority Buttons From LocalStorage
    document.querySelectorAll(".priority-toggle").forEach(button => {
      const roomNumber = button.id.replace("selected-priority-", "");
      const savedPriority = localStorage.getItem(`priority-${roomNumber}`);
      const allowTime = localStorage.getItem(`allowTime-${roomNumber}`);
    
      if (savedPriority === 'allow' && allowTime) {
        button.innerHTML = `🔵 ${allowTime}`;
      } else {
        updateSelectedPriorityDisplay(roomNumber, savedPriority || "default");
      }
    });

    // 🛗 Floor Lock Hold Events
    document.querySelectorAll(".floor-tab").forEach(tab => {
      let holdTimeout;
      const startHold = () => {
        holdTimeout = setTimeout(() => {
          const floorId = tab.dataset.floor;
          toggleFloorLock(floorId);
        }, 1000);
      };
      const cancelHold = () => clearTimeout(holdTimeout);
      tab.addEventListener("mousedown", startHold);
      tab.addEventListener("mouseup", cancelHold);
      tab.addEventListener("mouseleave", cancelHold);
      tab.addEventListener("touchstart", startHold);
      tab.addEventListener("touchend", cancelHold);
      tab.addEventListener("touchcancel", cancelHold);
    });

    // 🔐 Auth and Token Checks
    await ensureValidToken();
    await checkAuth();

    // 📥 Fetch initial housekeeping data
    await loadDNDStatus();
    await loadLogs();
    await restoreCleaningStatus();
    await restorePriorities();

    // 🔌 WebSocket Connection
    await connectWebSocket();

    if (window.socket) {
      window.socket.emit("requestPriorityStatus");
    } else {
      console.warn("⚠️ WebSocket not ready. Retrying...");
      setTimeout(() => {
        if (window.socket) {
          window.socket.emit("requestPriorityStatus");
        } else {
          console.error("❌ WebSocket still failed.");
        }
      }, 1000);
    }

    console.log("🎯 Cleaning status restored successfully.");

    // 🧠 Fetch Room Status
    await fetchRoomStatuses();

    // 👤 Handle Login or Show Login Form
    const token = localStorage.getItem("token");
    const username = localStorage.getItem("username");

    if (token && username) {
      console.log("✅ Token and username found. Authenticating...");
      const validToken = await ensureValidToken();

      if (validToken) {
        console.log("✅ Token valid. Showing dashboard...");
        setTimeout(() => showDashboard(username), 500);
      } else {
        console.warn("❌ Invalid token. Logging out...");
        logout();
      }
    } else {
      console.log("❌ No token found. Showing login form...");
      document.getElementById("auth-section").style.display = "block";
      document.getElementById("dashboard").style.display = "none";
    }

    // 🔒 Restore Floor Lock UI
    updateFloorTabIcons();

  } catch (err) {
    console.error("🚨 Initialization error:", err);
    Swal.fire("Error", "Something went wrong during initialization.", "error");
  } finally {
    Swal.close(); // ✅ Hide loading spinner
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
            reconnection: true,  // ✅ Allow automatic reconnection
            reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
            timeout: 5000
        });

        // ON CONNECT:
        window.socket.on("connect", async () => {
            console.log("✅ WebSocket connected successfully.");

            // === 1️⃣ Load room buttons AFTER connection ===
            await loadRooms();

            // === 2️⃣ Emit Inspection logs request ===
            emitInspectionRequest();

            // === 3️⃣ Emit DND & Priority requests ===
            safeEmit("requestDNDStatus");
            safeEmit("requestButtonStatus");
            safeEmit("requestPriorityStatus");

            // === 4️⃣ Emit checkedRooms ===
            emitCheckedRoomsToAllDevices();

            // 🟢 ADD THIS LINE:
            window.socket.emit("requestCheckedRooms");

             // ✅ ADD this AFTER everything:
             restoreAllInspectionButtons();  // 🟢 Make sure borders reapply
        });


        window.socket.on("updateOnlineUsers", (usernames) => {
          console.log("🟢 Online users:", usernames);
          onlineUsernames = usernames;
          showAllUsers(); // This will re-render the modal with updated indicators
        });
    
        window.socket.on("checkedRoomsStatus", (checkedRooms) => {
                checkedRooms.forEach(roomNumber => {
                    drawCheckButton(roomNumber, "#4CAF50", 1.0, false);

                    // Update localStorage
                    let stored = JSON.parse(localStorage.getItem("checkedRooms")) || [];
                    if (!stored.includes(roomNumber)) {
                        stored.push(roomNumber);
                        localStorage.setItem("checkedRooms", JSON.stringify(stored));
                    }
                });
            });

        window.socket.on("roomChecked", ({ roomNumber, status }) => {
        if (status === "checked") {
            drawCheckButton(roomNumber, "#4CAF50", 1.0, false);

            // ✅ Update checkedRooms localStorage
            let checkedRooms = JSON.parse(localStorage.getItem("checkedRooms")) || [];
            if (!checkedRooms.includes(roomNumber)) {
                checkedRooms.push(roomNumber);
                localStorage.setItem("checkedRooms", JSON.stringify(checkedRooms));
            }

            console.log(`✅ Real-time checked restored: Room ${roomNumber}`);
        }
    });

        window.socket.on("inspectionUpdate", ({ roomNumber, item, status }) => {
        updateInspectionLogAndUI(roomNumber, item, status);
    });

           window.socket.on("inspectionLogs", (logs) => {
                console.log("📡 Received inspection logs:", logs);
                inspectionLogs = logs;
                // ✅ Save into localStorage
                 localStorage.setItem("inspectionLogs", JSON.stringify(logs));
                restoreAllInspectionButtons();
            });


            socket.on("inspectionLogsStatus", (logs) => {
                console.log("✅ Received Inspection Logs:", logs);

                // Restore inspection buttons from logs
                logs.forEach(log => {
                    restoreInspectionButton(log.roomNumber, log.items);
                });

                // Optionally save to localStorage
                localStorage.setItem("inspectionLogs", JSON.stringify(logs));
            });


            window.socket.emit("requestInspectionLogs"); // To refill inspectionLogs


            window.socket.on("inspectionLogsCleared", () => {
                console.log("🧹 Inspection logs cleared by server, resetting inspection buttons...");

                // Clear localStorage
                localStorage.removeItem("inspectionLogs");

                // Reset inspectionLogs array (for safety)
                inspectionLogs = [];

                // Reset ALL inspection buttons' visuals
                document.querySelectorAll(".inspection-btn").forEach(button => {
                    button.classList.remove('active');
                });

                // Optional: Also reset the overall room inspection status buttons
                document.querySelectorAll(".inspection-button").forEach(button => {
                    button.classList.remove('clean', 'not-clean', 'active');
                });

                console.log("✅ Inspection buttons visually reset.");
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

        window.socket.on("allowCleaningUpdate", ({ roomNumber, time }) => {
        // Update UI
        const button = document.getElementById(`selected-priority-${roomNumber}`);
        button.innerHTML = `🔵 ${time}`;
    
        // Save in localStorage
        localStorage.setItem(`priority-${roomNumber}`, 'allow');
        localStorage.setItem(`allowTime-${roomNumber}`, time);
    
        console.log(`🟦 Sync: Room ${roomNumber} allowed at ${time}`);
    });


        window.socket.on("resetCheckedRooms", () => {
            console.log("🧹 Received checked rooms reset broadcast.");

            // Clear localStorage checkedRooms
            localStorage.removeItem("checkedRooms");

            // Reset all checked buttons to grey
            document.querySelectorAll(".room button").forEach(button => {
                if (button.id.startsWith("checked-")) {
                    let roomNum = button.id.replace("checked-", "");
                    drawCheckButton(roomNum, "grey", 1.0, false);
                }
            });

            console.log("✅ All checked buttons reset to grey.");
        });

         window.socket.on("forceClearCheckedRooms", () => {
                console.log("🔄 Force clearing checkedRooms received...");
                localStorage.removeItem("checkedRooms");

                document.querySelectorAll(".room button").forEach(button => {
                    if (button.id.startsWith("checked-")) {
                        let roomNum = button.id.replace("checked-", "");
                        drawCheckButton(roomNum, "grey", 1.0, false);
                    }
                });
                console.log("✅ All checked buttons reset to grey (force clear).");
            });

    
       window.socket.on("roomUpdate", async ({ roomNumber, status }) => {
        try {
            console.log(`🛎 Received Room Update: Room ${roomNumber} -> Status: ${status}`);

            // Update cleaning buttons
            updateButtonStatus(roomNumber, status);

            // Handle checked status
            let checkedRooms = JSON.parse(localStorage.getItem("checkedRooms")) || [];
            if (status === "checked") {
                if (!checkedRooms.includes(roomNumber)) {
                    checkedRooms.push(roomNumber);
                    localStorage.setItem("checkedRooms", JSON.stringify(checkedRooms));
                    console.log(`✅ Added Room ${roomNumber} to checkedRooms.`);
                }
                drawCheckButton(roomNumber, "#4CAF50", 1.0, false);
            } else {
                // Room is no longer checked → remove it
                if (checkedRooms.includes(roomNumber)) {
                    checkedRooms = checkedRooms.filter(r => r !== roomNumber);
                    localStorage.setItem("checkedRooms", JSON.stringify(checkedRooms));
                    console.log(`❌ Removed Room ${roomNumber} from checkedRooms.`);
                }
            }

            await loadLogs(); // Keep log display consistent

        } catch (error) {
            console.error("❌ Error processing room update:", error);
        }
    });


        window.socket.on("resetCleaning", ({ roomNumber, status }) => {
        console.log(`🔄 Reset Cleaning Received: Room ${roomNumber} -> ${status}`);

        const startButton = document.getElementById(`start-${roomNumber}`);
        const finishButton = document.getElementById(`finish-${roomNumber}`);
        const checkedButton = document.getElementById(`checked-${roomNumber}`);

        if (startButton) {
            startButton.disabled = false;
            startButton.style.backgroundColor = "#008CFF"; // Blue
        }
        if (finishButton) {
            finishButton.disabled = true;
            finishButton.style.backgroundColor = "transparent";
        }
        if (checkedButton) {
            drawCheckButton(roomNumber, "grey", 1.0, false); // Reset checked button
        }

        // ✅ NEW: Clear status from localStorage
        localStorage.removeItem(`status-${roomNumber}`);
        console.log(`🧹 LocalStorage status-${roomNumber} cleared.`);
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
function updateHeaderProfile({ username, profileImage }) {
  const profilePic = document.getElementById("user-profile-header");
  const usernameText = document.getElementById("user-name-header");

  if (profilePic) {
    profilePic.src = profileImage?.startsWith("data:image/")
      ? profileImage
      : profileImage
        ? `${profileImage}`  // ✅ Removed ?t=Date.now()
        : "default-avatar.png";
  }

  if (usernameText) {
    usernameText.textContent = username || "User";
  }
}




    // ✅ Improved Login Function
    async function login(event) {
        event.preventDefault(); // Prevent page refresh

        const username = document.getElementById("login-username").value;
        const password = document.getElementById("login-password").value;

         if (!username || !password) {
            Swal.fire({
                icon: "warning",
                title: "ពត៏មានមិនត្រឹមត្រូវ",
                text: "សូមបញ្ចូលឈ្មោះនិងលេខកូដសម្ងាត់ឲ្យបានត្រឹមត្រូវ.",
                confirmButtonText: "OK"
            });
            return;
        }

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

                    // 🔽 FETCH FULL PROFILE to update header
                    const profileRes = await fetch("https://housekeeping-production.up.railway.app/user/profile", {
                        method: "GET",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${data.token}`
                        }
                    });

                    const profileData = await profileRes.json();
                    console.log(profileData); // 🔍 Check here!

                   const fullImageURL = profileData.profileImage?.startsWith("data:image/")
                  ? profileData.profileImage
                  : profileData.profileImage
                    ? `${apiUrl}/uploads/${profileData.profileImage}`
                    : "default-avatar.png";


                    updateHeaderProfile({
                        username: profileData.username,
                        profileImage: fullImageURL  // ✅ Use this!
                    });

                    Swal.fire({
                        icon: "ជោគជ័យ",
                        title: "ការតភ្ជាប់បានជោគជ័យ",
                    text: `ស្វាគមន៍, ${data.username}!`,
                    timer: 2000,
                    showConfirmButton: false
                });

                // Debugging: Check if this function runs
                console.log("showDashboard is being called with username:", data.username);
            
                setTimeout(async () => {
                // 🟢 FULL RESTORE FLOW after login
                await showDashboard(data.username);
                 // 🟢 Load all rooms (buttons & dropdowns)
                await loadRooms();

                await restoreCleaningStatus();         // ✅ Update status buttons
                await loadDNDStatus();                 // ✅ DND
                await loadLogs();                      // ✅ Table + priorities
                await restorePriorities();             // ✅ Priority dropdown (blue, red, etc.)
                await fetchRoomStatuses();             // ✅ Optional extra
                emitCheckedRoomsToAllDevices();        // ✅ Checked status restore
            }, 500);
            } else {
                Swal.fire({
                    icon: "error",
                    title: "ការតភ្ជាប់ បរាជ័យ",
                    text: "ឈ្មោះនិងលេខសម្ងាត់មិនត្រឹមត្រូវ",
                    confirmButtonText: "ព្យាយាមម្ដងទៀត"
                });
            }
        } catch (error) {
            console.error("❌ Error logging in:", error);
            alert("An error occurred. Please try again.");
            Swal.fire({
                icon: "error",
                title: "មិនដំណើរការ",
                text: "សូមអភ័យទោស មានបញ្ចាបច្ចេកទេសតិចតួច សូមព្យាយាមម្ដងទៀត",
                confirmButtonText: "OK"
            });
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

    // ✅ Helper Function for drawing checked button canvas
    function drawCheckButton(roomNumber, color = "grey", opacity = 1.0, enabled = false) {
        const checkedButton = document.getElementById(`checked-${roomNumber}`);
        if (!checkedButton) return;
        const canvas = checkedButton.querySelector("canvas");
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.globalAlpha = opacity;
        ctx.beginPath();
        ctx.arc(12, 12, 10, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();

        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(8, 12);
        ctx.lineTo(11, 15);
        ctx.lineTo(16, 9);
        ctx.stroke();
        ctx.globalAlpha = 1.0;

        // Disable/Enable Button & Remove Background
        checkedButton.disabled = !enabled;
        checkedButton.style.backgroundColor = "transparent";
    }

    async function loadRooms() {
        console.log("🔄 Loading rooms...");

        const floors = {
            "ground-floor": ["001", "002", "003", "004", "005", "006", "007", "011", "012", "013", "014", "015", "016", "017"],
            "second-floor": ["101", "102", "103", "104", "105", "106", "107", "108", "109", "110", "111", "112", "113", "114", "115", "116", "117"],
            "third-floor": ["201", "202", "203", "204", "205", "208", "209", "210", "211", "212", "213", "214", "215", "216", "217"]
        };

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

                roomDiv.innerHTML = `
                    <span> ${room}</span>
                    <div class="priority-container">
                        <button class="priority-toggle" id="selected-priority-${room}" onclick="togglePriorityDropdown('${room}')">⚪</button>
                        <div class="priority-dropdown" id="priority-${room}">
                            <div class="priority-option" onclick="updatePriority('${room}', 'default')"><span class="white">⚪</span></div>
                            <div class="priority-option" onclick="updatePriority('${room}', 'sunrise')"><span class="red">🔴</span></div>
                            <div class="priority-option" onclick="updatePriority('${room}', 'early-arrival')"><span class="yellow">🟡</span></div>
                            <div class="priority-option" onclick="updatePriority('${room}', 'vacancy')"><span class="black">⚫</span></div>
                            <!-- ✅ ADD BLUE OPTION -->
                            <div class="priority-option" onclick="setAllowCleaning('${room}')"><span class="blue">🔵</span></div>
                        </div>
                    </div>
                    <button id="start-${room}" onclick="startCleaning('${room}')">សម្អាត</button>
                    <button id="finish-${room}" onclick="finishCleaning('${room}')" disabled>ហើយ</button>
                    <button id="inspection-${room}" class="inspection-btn" onclick="openInspectionPopup('${room}')">📝</button> 
                    <button id="checked-${room}" onclick="checkRoom('${room}')" disabled class="checked">
                        <canvas id="canvas-${room}" width="24" height="24"></canvas>
                    </button>
                    <button id="dnd-${room}" class="dnd-btn" onclick="toggleDoNotDisturb('${room}')">🚫</button>
                `;

                floorDiv.appendChild(roomDiv);
            });
        });

        // ✅ Update priority displays
        priorities.forEach(({ roomNumber, priority }) => {
            if (roomNumber !== undefined) {
                updateSelectedPriorityDisplay(roomNumber, priority);
            } else {
                console.warn("Skipping undefined roomNumber:", priority);
            }
        });

        // ✅ Draw checked buttons in default GREY disabled state
        Object.keys(floors).forEach(floor => {
            floors[floor].forEach(room => {
                drawCheckButton(room, "grey", 1.0, false); // Grey, Disabled
            });
        });

        // ✅ Restore cleaning status (keeps previous cleaning data)
        await restoreCleaningStatus();
        console.log("✅ Rooms loaded successfully with priorities.");
    }

async function showDashboard(username) {
    console.log("Inside showDashboard function. Username:", username);

    const dashboard = document.getElementById("dashboard");
    const authSection = document.getElementById("auth-section");

    if (!dashboard || !authSection) {
        console.error("❌ Dashboard or Auth section not found in DOM.");
        return;
    }

    // Hide the login section
    authSection.style.display = "none";

    // Show the main dashboard
    dashboard.classList.remove("hidden");
    dashboard.style.display = "block";

    try {
        const token = localStorage.getItem("token");

        const res = await fetch(`${apiUrl}/user/profile`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        const profileData = await res.json();

        const fullImageURL = profileData.profileImage?.startsWith("data:image/")
            ? profileData.profileImage
            : profileData.profileImage
                ? `${apiUrl}/uploads/${profileData.profileImage}`
                : "default-avatar.png";

        updateHeaderProfile({
            username: profileData.username,
            profileImage: fullImageURL
        });

        console.log("✅ Header profile updated from showDashboard()");
    } catch (error) {
        console.error("❌ Failed to fetch or update header profile:", error);
    }

   // 🏆 Fetch and display cleaning stats
try {
    const { userDurations, fastestUser, fastestAverageDuration } = await calculateUserCleaningStats();

    const avgDuration = userDurations[username]?.average || "N/A";
    const fastestCleaner = fastestUser ? `${fastestUser} (${fastestAverageDuration} min)` : "N/A";

    // Create or reuse stats container
    let statsContainer = document.getElementById("user-stats");
    if (!statsContainer) {
        statsContainer = document.createElement("div");
        statsContainer.id = "user-stats";
        statsContainer.style.fontSize = "13px";
        statsContainer.style.marginTop = "5px";
        statsContainer.style.textAlign = "center";
        statsContainer.style.color = "#666";
        statsContainer.style.backgroundColor = "#f0f0f0";
        statsContainer.style.padding = "8px 12px";
        statsContainer.style.borderRadius = "8px";
        statsContainer.style.marginTop = "10px";

        const profileSection = document.getElementById("profile-section");
        if (profileSection) {
            profileSection.appendChild(statsContainer);
        } else {
            console.warn("⚠️ profile-section not found, appending stats to dashboard.");
            document.getElementById("dashboard").appendChild(statsContainer);
        }
    }

    statsContainer.innerHTML = `
        <div>🕒 ល្បឿនសម្អាតរបស់អ្នកជាមធ្យម: <strong>${avgDuration} min</strong></div>
        <div>⚡ អ្នកសម្អាតបានលឿនជាងគេ: <strong>${fastestCleaner}</strong></div>
    `;
} catch (err) {
    console.error("❌ Failed to load cleaning stats:", err);
}


    // 🧼 Restore floor lock and inspection button states
    enforceFloorLock();
    restoreAllInspectionButtons();

    // 🧭 Fallback to default floor if no lock set
    setTimeout(() => {
        const locked = localStorage.getItem("lockedFloor");
        if (locked) {
            console.log(`🔒 Locked floor "${locked}" already active. Skipping manual toggle.`);
            enforceFloorLock();
        } else {
            console.log("✅ No locked floor found. Activating ground floor...");
            toggleFloor("ground-floor");
        }
    }, 1000);
}


    function restoreAllInspectionButtons() {
        inspectionLogs.forEach(log => {
            restoreInspectionButton(log.roomNumber, log.items);
        });
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

    function setAllowCleaning(roomNumber) {
        Swal.fire({
            title: 'Set Allow Cleaning Time',
            html: `
                <input type="time" id="manual-time" class="swal2-input" style="width: 70%;" />
                <small style="display:block;margin-top:5px;">Leave empty to auto-use current time</small>
            `,
            showCancelButton: true,
            confirmButtonText: 'Set',
            cancelButtonText: 'Cancel',
            preConfirm: () => {
                return document.getElementById('manual-time').value;
            }
        }).then(result => {
            let selectedTime = result.value;

            // If user leaves empty → fallback to auto time
            if (!selectedTime) {
                const now = new Date().toLocaleTimeString('en-US', {
                    timeZone: 'Asia/Phnom_Penh',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                });
                selectedTime = now;
            } else {
                // Convert to AM/PM format
                const [hour, minute] = selectedTime.split(':');
                const date = new Date();
                date.setHours(hour);
                date.setMinutes(minute);
                selectedTime = date.toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                });
            }

            // Save locally
            localStorage.setItem(`priority-${roomNumber}`, 'allow');
            localStorage.setItem(`allowTime-${roomNumber}`, selectedTime);

            // Update UI
            const button = document.getElementById(`selected-priority-${roomNumber}`);
            button.innerHTML = `
                <div class="priority-display">
                    <span class="blue">🔵</span>
                    <span class="priority-time">${selectedTime}</span>
                </div>
            `;

            // Sync styles (optional)
            const priorityTime = button.querySelector('.priority-time');
            if (priorityTime) {
                priorityTime.style.fontSize = '8px';
                priorityTime.style.color = '#333';
            }

            // Emit WebSocket event to sync across devices
            safeEmit("allowCleaningUpdate", { roomNumber, time: selectedTime });

            console.log(`🔵 Room ${roomNumber} allowed for cleaning at ${selectedTime}`);

            // Telegram Notify
            const username = localStorage.getItem("username") || "Unknown";
            sendTelegramMessage(`👌🏻 Room ${roomNumber} ត្រូវបានអនុញ្ញាតឲ្យសម្អាតដោយ ${username} នៅម៉ោង ${selectedTime}`);
        });
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

        const allowTime = localStorage.getItem(`allowTime-${roomNumber}`);
        if (priority === "allow" && allowTime) {
        button.innerHTML = `
            <div class="priority-display">
                <span class="blue">🔵</span>
                <span class="priority-time">${allowTime}</span>
            </div>
        `;
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

    async function restorePriorities() {
        const res = await fetch(`${apiUrl}/logs/priority`);
        const priorities = await res.json();
        priorities.forEach(p => {
            if (p.priority === "allow" && p.allowCleaningTime) {
                localStorage.setItem(`allowTime-${p.roomNumber}`, p.allowCleaningTime);
            }
        });
        console.log("✅ Priority status restored from server.");
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
        let storedRefreshToken = localStorage.getItem("refreshToken"); // ✅ rename this

        if (!token) {
            console.warn("⚠ No token found. Attempting to refresh...");
            token = await refreshToken();
            if (!token) {
                console.error("❌ Token refresh failed. User must log in.");
                logout();
                return null;
            }
        }

        try {
            const payload = JSON.parse(atob(token.split('.')[1]));

            if (payload.exp * 1000 < Date.now()) {
                console.warn("⚠ Token expired. Attempting to refresh...");
                token = await refreshToken();
                if (!token) {
                    console.error("❌ Token refresh unsuccessful. User must log in.");
                    logout();
                    return null;
                }
            }

            localStorage.setItem("token", token); // ✅ Store the new token
            console.log("✅ Token is valid.");
            return token;
        } catch (error) {
            console.error("❌ Invalid token structure. Logging out...");
            logout();
            return null;
        }
    }

    setInterval(async () => {
        const token = await ensureValidToken();
        if (token) {
            console.log("✅ Token refreshed in the background.");
        }
    }, 15 * 60 * 1000); // ✅ Refresh every 15 minutes



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
            const response = await fetch(`${apiUrl}/logs/status`, {
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
            const priorityResponse = await fetch(`${apiUrl}/logs/priority`, {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${localStorage.getItem("token")}`
                }
            });

            if (!priorityResponse.ok) throw new Error(`HTTP error! Status: ${priorityResponse.status}`);
            const priorities = await priorityResponse.json();
            console.log("✅ Room Priorities Fetched:", priorities);

            // Fetch inspection logs
            const inspectionResponse = await fetch(`${apiUrl}/logs/inspection`, {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${localStorage.getItem("token")}`
                }
            });

            if (!inspectionResponse.ok) throw new Error(`HTTP error! Status: ${inspectionResponse.status}`);
            const inspectionLogs = await inspectionResponse.json();
            console.log("✅ Inspection Logs Fetched:", inspectionLogs);

            // ✅ Restore checkedRooms from localStorage
            const checkedRooms = JSON.parse(localStorage.getItem("checkedRooms")) || [];

            // ✅ Process cleaning statuses
            Object.entries(statuses).forEach(([roomNumber, status]) => {
                const formattedRoom = formatRoomNumber(roomNumber);

                updateButtonStatus(formattedRoom, status);

                // ✅ Explicitly restore GREEN checked if in checkedRooms or backend says 'checked'
                if (status === "checked" || checkedRooms.includes(formattedRoom)) {
                    drawCheckButton(formattedRoom, "#4CAF50", 1.0, false);

                    // ✅ Ensure it's in localStorage
                    if (!checkedRooms.includes(formattedRoom)) {
                        checkedRooms.push(formattedRoom);
                        localStorage.setItem("checkedRooms", JSON.stringify(checkedRooms));
                    }

                    console.log(`✅ Restored GREEN checked for Room ${formattedRoom}`);
                } else if (status === "finished") {
                    drawCheckButton(formattedRoom, "#008CFF", 1.0, true);
                    console.log(`🔵 Restored BLUE checked (finished) for Room ${formattedRoom}`);
                } else {
                    drawCheckButton(formattedRoom, "grey", 1.0, false);
                }

                // ✅ Handle Priority
                const roomPriority = priorities.find(p =>
                    formatRoomNumber(p.roomNumber) === formattedRoom
                )?.priority || "default";

                updateSelectedPriorityDisplay(formattedRoom, roomPriority);
            });

            // Process inspection logs
            inspectionLogs.forEach(log => {
                const formattedRoom = formatRoomNumber(log.roomNumber);

                // Restore inspection button status (clean/not clean)
                if (log.inspectionData) {
                    restoreInspectionButton(formattedRoom, log.inspectionData);
                }
            });
            restoreAllInspectionButtons(); // Ensures UI fully syncs

        } catch (error) {
            console.error("❌ Error fetching room statuses, priorities, or inspections:", error);
            alert("Failed to fetch room data. Check console for details.");
        }
    }

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

       document.querySelectorAll(".room").forEach(roomDiv => {
            const roomNumber = roomDiv.querySelector("span").innerText.replace("Room ", "").trim();
            let dndStatus = localStorage.getItem(`dnd-${roomNumber}`) || "available";
            updateDNDStatus(roomNumber, dndStatus); // ✅ FIXED
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

    async function restoreCleaningStatus() {
        try {
            console.log("🔄 Restoring cleaning, checked, and DND status...");

            // === 1️⃣ Fetch latest logs and DND logs from server FIRST ===
            const [logs, dndLogs] = await Promise.all([
                fetchWithErrorHandling(`${apiUrl}/logs`),
                fetchWithErrorHandling(`${apiUrl}/logs/dnd`)
            ]);

            if (!logs || !Array.isArray(logs)) {
                console.warn("⚠ No cleaning logs found.");
                return;
            }

            // === 2️⃣ Build DND status map ===
            const dndStatusMap = new Map(
                (Array.isArray(dndLogs) ? dndLogs : []).map(dnd => [formatRoomNumber(dnd.roomNumber), dnd.dndStatus])
            );

            // === 3️⃣ Restore Checked Rooms from LocalStorage ===
            const checkedRooms = JSON.parse(localStorage.getItem("checkedRooms")) || [];

            // === 4️⃣ Loop through logs to restore cleaning status & checked buttons ===
            logs.forEach(log => {
                const roomNumber = formatRoomNumber(log.roomNumber);
                const status = log.finishTime ? "finished" : log.startTime ? "in_progress" : "available";
                const dndStatus = dndStatusMap.get(roomNumber) ? "dnd" : "available";

                // Update UI buttons
                updateButtonStatus(roomNumber, status, dndStatus);

                // Store latest status into localStorage
                localStorage.setItem(`status-${roomNumber}`, status);
                localStorage.setItem(`dnd-${roomNumber}`, dndStatus);

                if (checkedRooms.includes(roomNumber)) {
                    drawCheckButton(roomNumber, "#4CAF50", 1.0, false);
                    console.log(`✅ Checked restored: Room ${roomNumber}`);
                    safeEmit("roomChecked", { roomNumber, username: localStorage.getItem("username") });
                } else if (log.finishTime) {
                    // Show blue if finished but not checked
                    drawCheckButton(roomNumber, "#008CFF", 1.0, true);
                    console.log(`🔵 Blue restored (finished): Room ${roomNumber}`);
                } else {
                    drawCheckButton(roomNumber, "grey", 1.0, false);
                }
               }); // ✅ <-- You were missing this line

            // === 5️⃣ Ensure localStorage DND and Status restore for rooms that may not be in logs ===
            document.querySelectorAll(".room").forEach(roomDiv => {
                const roomNumber = roomDiv.querySelector("span").innerText.replace("Room ", "").trim();
                const savedStatus = localStorage.getItem(`status-${roomNumber}`) || "available";
                const savedDND = localStorage.getItem(`dnd-${roomNumber}`) || "available";
                updateButtonStatus(roomNumber, savedStatus, savedDND);
            });

             // ✅ Restore Inspection Logs
          inspectionLogs.forEach(log => {
              Object.entries(log.items).forEach(([item, status]) => {
                  console.log(`Restored inspection: Room ${log.roomNumber} - ${item}: ${status}`);
                  // Optional: visually reflect status (green/red badge per item)
              });
          });

            console.log("✅ Cleaning, DND, and Checked buttons restored.");
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

        // === 🔥 IMMEDIATE UI UPDATE ===
        if (newStatus === "dnd") {
            startButton?.setAttribute("disabled", "true");
            startButton?.style.setProperty("background-color", "grey");
            finishButton?.setAttribute("disabled", "true");
            finishButton?.style.setProperty("background-color", "grey");

            dndButton.classList.add("active-dnd");
            void dndButton.offsetWidth;  // 🟢 Add this!

        } else {
            startButton?.removeAttribute("disabled");
            startButton?.style.setProperty("background-color", "#008CFF");
            finishButton?.setAttribute("disabled", "true");
            finishButton?.style.setProperty("background-color", "grey");

            dndButton.classList.remove("active-dnd");
        }

        // ✅ Save Local Immediately
        localStorage.setItem(`dnd-${formattedRoom}`, newStatus);
        updateDNDStatus(formattedRoom, newStatus); // Optional double update

        // ✅ Emit WebSocket event immediately
        safeEmit("dndUpdate", { roomNumber: formattedRoom, status: newStatus });

        // ✅ Notify Telegram immediately
        const username = localStorage.getItem("username") || "Unknown";
        const message = newStatus === "dnd"
            ? `🚫 Room ${formattedRoom} មិនត្រូវការសម្អាត ${username}`
            : `✅ Room ${formattedRoom} អាចចូលសម្អាតបាន ${username}`;
        sendTelegramMessage(message);

        // === AFTER immediate UI feedback → Send API ===
        try {
            const response = await fetch(`${apiUrl}/logs/dnd`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    roomNumber: formattedRoom,
                    status: newStatus,
                    updatedBy: username
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error("❌ Failed to update DND status:", errorData);
                alert(`Error: ${errorData.message || "Failed to update DND status."}`);
                return;
            }

            console.log(`✅ DND status updated successfully for Room ${formattedRoom}`);
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
        const startButton = document.getElementById(`start-${formattedRoom}`);
        const finishButton = document.getElementById(`finish-${formattedRoom}`);
        const checkedButton = document.getElementById(`checked-${formattedRoom}`);
        const dndButton = document.getElementById(`dnd-${formattedRoom}`);

        if (!startButton || !finishButton || !dndButton || !checkedButton) {
            console.error(`❌ Buttons not found for Room ${formattedRoom}`);
            return;
        }

        if (startButton.disabled) return; // Prevent multiple clicks

        // ✅ Confirmation popup
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
            return;
        }

        const username = localStorage.getItem("username");
        if (!username) {
            console.error("❌ No username found in localStorage. Cannot start cleaning.");
            alert("You must be logged in to start cleaning.");
            return;
        }

        // ✅ Check logs to prevent double cleaning
        const logs = await fetchWithErrorHandling(`${apiUrl}/logs`);
        const roomLog = logs.find(log => log.roomNumber.toString().padStart(3, '0') === formattedRoom);
        if (roomLog && roomLog.startTime && !roomLog.finishTime) {
            alert(`⚠ Room ${formattedRoom} is already being cleaned.`);
            return;
        }

        // ✅ Send API request
        try {
            const res = await fetch(`${apiUrl}/logs/start`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ roomNumber: formattedRoom, username })
            });

            const data = await res.json();
            if (!res.ok) {
                console.error("❌ Failed to Start Cleaning:", data);
                alert(`❌ Failed: ${data.message}`);
                return;
            }

            // ✅ Update buttons
            startButton.disabled = true;
            startButton.style.backgroundColor = "transparent";

            finishButton.disabled = false;
            finishButton.style.backgroundColor = "#008CFF";

            checkedButton.disabled = true; // Remain disabled until finished
            checkedButton.style.backgroundColor = "transparent";

            dndButton.disabled = true;
            dndButton.style.backgroundColor = "transparent";

            console.log(`✅ Room ${formattedRoom} cleaning started.`);

            // ✅ Update checked button canvas (dimmed grey)
            drawCheckButton(roomNumber, "grey", 1.0, false);

            // ✅ Notify
            sendTelegramMessage(`🧹 Room ${formattedRoom} ចាប់ផ្ដើមសម្អាតដោយ ${username}`);
            safeEmit("roomUpdate", { roomNumber, status: "in_progress" });

            updateButtonStatus(formattedRoom, "in_progress");

            // ✅ Reload logs
            await loadLogs();

        } catch (error) {
            console.error("❌ Error starting cleaning:", error);
            startButton.disabled = false;
            startButton.style.backgroundColor = "#008CFF"; // Re-enable in error
            Swal.fire("Error", "An unexpected error occurred while starting cleaning.", "error");
        }
    }


    async function finishCleaning(roomNumber) {
        const formattedRoom = formatRoomNumber(roomNumber);
        const finishButton = document.getElementById(`finish-${formattedRoom}`);
        const checkedButton = document.getElementById(`checked-${formattedRoom}`);
        const startButton = document.getElementById(`start-${formattedRoom}`);
        const username = localStorage.getItem("username"); 
    
        if (!username) {
            console.error("❌ No username found in localStorage. Cannot finish cleaning.");
            Swal.fire({
                icon: "error",
                title: "Authentication Required",
                text: "You must be logged in to finish cleaning.",
                confirmButtonText: "OK"
            });
            return;
        }
    
        if (!finishButton || !checkedButton || !startButton) {
            console.error(`❌ Buttons not found for Room ${formattedRoom}`);
            return;
        }

        // ✅ Fetch logs
        let roomLog = null;
        try {
            const logs = await fetchWithErrorHandling(`${apiUrl}/logs`);
            roomLog = logs.find(log => log.roomNumber.toString().padStart(3, '0') === formattedRoom);
        } catch (error) {
            console.error("❌ Error fetching logs:", error);
            Swal.fire({
                icon: "error",
                title: "Error",
                text: "Failed to retrieve cleaning logs.",
                confirmButtonText: "OK"
            });
            return;
        }

        // ✅ Calculate Cleaning Duration
        let duration = "-";
        if (roomLog && roomLog.startTime) {
            let startTime = new Date(roomLog.startTime);
            let finishTime = new Date();
            let durationMs = finishTime - startTime;
            let minutes = Math.floor(durationMs / (1000 * 60));
            duration = minutes > 0 ? `${minutes} min` : "< 1 min";
        }

        // ✅ Confirmation popup
        const confirmFinish = await Swal.fire({
            title: `សម្អាតរួចរាល់ ${roomNumber}?`,
            text: `អ្នកបានសម្អាតបន្ទប់នេះ ក្នុងថេរវេលា: ${duration}`,
            icon: "question",
            showCancelButton: true,
            confirmButtonColor: "#3085d6",
            cancelButtonColor: "#d33",
            confirmButtonText: "Yes",
            cancelButtonText: "No"
        });

        if (!confirmFinish.isConfirmed) {
            console.log(`🚫 Cleaning not marked as finished for Room ${roomNumber}`);
            return;
        }

        // ✅ API Request
        try {
            const res = await fetch(`${apiUrl}/logs/finish`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ roomNumber: formattedRoom, username, status: "finished" })
            });

            const data = await res.json();
            if (!res.ok) {
                console.error("❌ Failed to Finish Cleaning:", data);
                Swal.fire({
                    icon: "error",
                    title: "Cleaning Completion Failed",
                    text: data.message || "An error occurred while finishing cleaning.",
                    confirmButtonText: "OK"
                });
                return;
            }

            // ✅ Success Notification
            Swal.fire({
                icon: "success",
                title: `បន្ទប់ ${formattedRoom} ត្រូវបានសម្អាត!`,
                text: `ក្នុងថេរវេលា: ${duration}`,
                timer: 2500,
                showConfirmButton: false
            });

            // ✅ Disable Finish Button
            finishButton.disabled = true;
            finishButton.style.backgroundColor = "transparent";

            // ✅ Disable Start Button
            startButton.disabled = true;
            startButton.style.backgroundColor = "transparent";

            // ✅ Enable Checked Button BLUE
            drawCheckButton(roomNumber, "#008CFF", 1.0, true);

            // ✅ Notify
            sendTelegramMessage(`✅ Room ${formattedRoom} បានសម្អាតរួចរាល់ដោយ ${username}. ថេរវេលា: ${duration}`);
            safeEmit("roomUpdate", { roomNumber, status: "finished" });

            updateButtonStatus(formattedRoom, "finished");

            await loadLogs();

        } catch (error) {
            console.error("❌ Error finishing cleaning:", error);
            Swal.fire({
                icon: "error",
                title: "Error",
                text: "An unexpected error occurred while finishing cleaning.",
                confirmButtonText: "OK"
            });
        }
    }


    async function checkRoom(roomNumber) {
        const checkedButton = document.getElementById(`checked-${roomNumber}`);
        if (!checkedButton) return;

        const username = localStorage.getItem("username"); 
        if (!username) {
            console.error("❌ No username found. Cannot check room.");
            return;
        }

        // ✅ Show confirmation popup BEFORE sending request
        const confirmCheck = await Swal.fire({
            title: `ត្រួតពិនិត្យបន្ទប់ ${roomNumber}`,
            text: "តើអ្នកប្រាកដថាបន្ទប់ស្អាតរួចហើយទេ?",
            icon: "question",
            showCancelButton: true,
            confirmButtonColor: "#4CAF50",
            cancelButtonColor: "#d33",
            confirmButtonText: "Yes!",
            cancelButtonText: "No"
        });

        if (!confirmCheck.isConfirmed) {
            console.log(`🚫 Room ${roomNumber} check canceled.`);
            return;
        }

        try {
            const res = await fetch(`${apiUrl}/logs/check`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ roomNumber, username, status: "checked" })
            });

            const data = await res.json();
            if (!res.ok) {
                console.error("❌ Failed to Check Room:", data);
                return;
            }

            // ✅ Update Checked Button: GREEN
            drawCheckButton(roomNumber, "#4CAF50", 1.0, false);
            checkedButton.style.backgroundColor = "transparent";
            checkedButton.disabled = true;

            // ✅ Save checked status
            localStorage.setItem(`status-${roomNumber}`, "checked");

            let checkedRooms = JSON.parse(localStorage.getItem("checkedRooms")) || [];
            if (!checkedRooms.includes(roomNumber)) {
                checkedRooms.push(roomNumber);
                localStorage.setItem("checkedRooms", JSON.stringify(checkedRooms));
            }

            // ✅ Emit real-time event
            safeEmit("roomChecked", { roomNumber, username: localStorage.getItem("username") });


            // ✅ Send Telegram Notification
            const message = `💦Room ${roomNumber} ត្រូវបានត្រួតពិនិត្យ ដោយ ${username}`;
            await sendTelegramMessage(message);

            console.log(`✅ Room ${roomNumber} marked as checked & Telegram sent.`);

        } catch (error) {
            console.error("❌ Error checking room:", error);
            Swal.fire({
                icon: "error",
                title: "មានបញ្ហា",
                text: "បរាជ័យក្នុងការត្រួតពិនិត្យបន្ទប់",
                confirmButtonText: "OK"
            });
        }
    }

    let logsCleared = false; // ✅ move this up here

    function emitCheckedRoomsToAllDevices() {
        if (logsCleared) {
            console.log("🧹 Logs just cleared, skipping broadcasting old checkedRooms...");
            return;  // ✅ Don't send anything if logs were cleared
        }

        const checkedRooms = JSON.parse(localStorage.getItem("checkedRooms")) || [];
        checkedRooms.forEach(roomNumber => {
            console.log(`📢 Broadcasting checked room ${roomNumber} to all devices...`);
            safeEmit("roomChecked", { roomNumber, username: localStorage.getItem("username") });
        });
    }

    function emitInspectionRequest() {
        if (window.socket && window.socket.connected) {
            console.log("📡 Requesting inspection logs...");
            window.socket.emit("requestInspectionLogs");
        }
    }


    function openInspectionPopup(roomNumber) {
        const checklistItems = [
            { icon: "📺", name: "TV" },
            { icon: "🛋️", name: "Sofa" },
            { icon: "💡", name: "Lamp" },
            { icon: "🔆", name: "Light" },
            { icon: "🧴", name: "Amenity" },
            { icon: "🍪", name: "Complimentary" },
            { icon: "🌿", name: "Balcony" },
            { icon: "🚰", name: "Sink" },
            { icon: "🚪", name: "Door" },
            { icon: "🥤", name: "Minibar" }
        ];

        // Fetch correct inspection log for the room
        const roomLog = inspectionLogs.find(log => log.roomNumber === roomNumber);

        let htmlContent = checklistItems.map(item => {
            // Check if status exists
            const itemStatus = roomLog && roomLog.items && roomLog.items[item.name] 
                ? roomLog.items[item.name] : null;

            let cleanClass = itemStatus === "clean" ? 'active' : '';
            let notCleanClass = itemStatus === "not_clean" ? 'active' : '';

            return `
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
                <div style="font-size:18px;">${item.icon} ${item.name}</div>
                <div>
                    <button class="inspect-btn clean ${cleanClass}" onclick="updateInspection('${roomNumber}', '${item.name}', 'clean')">✔️</button>
                    <button class="inspect-btn not-clean ${notCleanClass}" onclick="updateInspection('${roomNumber}', '${item.name}', 'not_clean')">❌</button>
                </div>
            </div>`;
        }).join('');

        Swal.fire({
            title: `📝 Inspection - Room ${roomNumber}`,
            html: htmlContent,
            showCloseButton: true,
            showConfirmButton: false,
            width: 400
        });
    }

    function triggerInspectButtonAnimation(button) {
        button.classList.add('animate');

        // Force reflow for immediate effect (optional, makes animation reliable)
        void button.offsetWidth;


        setTimeout(() => {
            button.classList.remove('animate');
        }, 150); // Match transform duration

    }


    async function updateInspection(roomNumber, item, status) {
        const username = localStorage.getItem("username");
        const token = localStorage.getItem("token");

        const popup = Swal.getPopup();

        // Get target buttons
        const cleanButton = popup.querySelector(`.inspect-btn.clean[onclick*="${item}"]`);
        const notCleanButton = popup.querySelector(`.inspect-btn.not-clean[onclick*="${item}"]`);

        let newStatus = status; // default

        // Check if user clicked the same active button → toggle off
        if (status === 'clean' && cleanButton.classList.contains('active')) {
            newStatus = null; // Unset status
        } 
        if (status === 'not_clean' && notCleanButton.classList.contains('active')) {
            newStatus = null; // Unset status
        }

        // Play sound based on choice
        let sound;
        if (status === 'clean') {
            sound = new Audio('Sound/Yes.mp3'); // ✅ Your Yes sound
        } else if (status === 'not_clean') {
            sound = new Audio('Sound/No.mp3');  // ✅ Your No sound
        }

        if (sound) {
            sound.volume = 0.5;
            sound.play();
        }

        // Send update to backend
        await fetch(`${apiUrl}/logs/inspection`, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ roomNumber, item, status: newStatus, username })
        });

        // Emit WebSocket update
        safeEmit("inspectionUpdate", { roomNumber, item, status: newStatus, updatedBy: username });

        console.log(`✅ ${item} in Room ${roomNumber} updated → ${newStatus ?? "cleared"}`);

        // Update button visuals
        cleanButton.classList.remove('active');
        notCleanButton.classList.remove('active');

        if (newStatus === 'clean') {
            cleanButton.classList.add('active');
            triggerInspectButtonAnimation(cleanButton); // 🎯 Animate clean button
            // Directly set background color
             cleanButton.style.backgroundColor = '#90EE90'; // Light green
        } else if (newStatus === 'not_clean') {
            notCleanButton.classList.add('active');
            triggerInspectButtonAnimation(notCleanButton); // 🎯 Animate not clean button
            notCleanButton.style.backgroundColor = '#FF6B6B'; // Light red
        }

        // ✅ Add this here after buttons updated
        restoreInspectionBorder(roomNumber);
    }


    // Client-side request for inspection logs
    function requestInspectionLogs() {
        if (window.socket && window.socket.connected) {
            console.log("📡 Requesting inspection logs from server...");
            window.socket.emit("requestInspectionLogs");
        } else {
            console.warn("⚠️ WebSocket not connected. Cannot request inspection logs.");
        }
    }

    function restoreInspectionButton(roomNumber, inspectionData) {
        const btn = document.getElementById(`inspection-${roomNumber}`);
        if (!btn) return;

        let isClean = true;
        let hasStatus = false;

        if (inspectionData) {
            for (let key in inspectionData) {
                if (inspectionData[key] === "not_clean") {
                    isClean = false;
                    hasStatus = true;
                    break;
                }
                if (inspectionData[key] === "clean") {
                    hasStatus = true;
                }
            }
        }

        // Remove previous classes
        btn.classList.remove("clean", "not-clean", "active", "clean-border", "not-clean-border");

        // Set border color based on cleanliness
        if (hasStatus) {
            if (isClean) {
                btn.classList.add("clean", "active", "clean-border");
            } else {
                btn.classList.add("not-clean", "active", "not-clean-border");
            }
        }

        console.log(`🔄 Restored inspection button for Room ${roomNumber}: ${isClean ? "clean" : "not_clean"}`);
    }

    function restoreInspectionBorder(roomNumber) {
        const btn = document.getElementById(`inspection-${roomNumber}`);
        if (!btn) return;

        const roomLog = inspectionLogs.find(log => log.roomNumber === roomNumber);

        let hasNotClean = false;
        let allClean = true;

        if (roomLog && roomLog.items) {
            for (let key in roomLog.items) {
                if (roomLog.items[key] === "not_clean") {
                    hasNotClean = true;
                    allClean = false;
                    break;
                }
                if (roomLog.items[key] !== "clean") {
                    allClean = false;
                }
            }
        } else {
            allClean = false;
        }

        // Remove old border classes
        btn.classList.remove("clean-border", "not-clean-border", "fade-in");

        // Apply new class
        if (hasNotClean) {
            btn.classList.add("not-clean-border", "fade-in");
        } else if (allClean) {
            btn.classList.add("clean-border", "fade-in");
        }
    }

    function updateInspectionLogAndUI(roomNumber, item, status) {
        const logIndex = inspectionLogs.findIndex(log => log.roomNumber === roomNumber);
        if (logIndex !== -1) {
            inspectionLogs[logIndex].items[item] = status;
        } else {
            inspectionLogs.push({
                roomNumber,
                items: { [item]: status }
            });
        }

        localStorage.setItem("inspectionLogs", JSON.stringify(inspectionLogs));
        restoreInspectionButton(roomNumber, inspectionLogs.find(log => log.roomNumber === roomNumber)?.items);
    }

    function updateFloorTabIcons() {
    document.querySelectorAll(".floor-tab").forEach(tab => {
        const floorId = tab.dataset.floor;
        const isLocked = localStorage.getItem("lockedFloor") === floorId;

        if (isLocked && !tab.innerHTML.includes("🔒")) {
            tab.innerHTML = `🔒 ${tab.dataset.label || tab.textContent.trim()}`;
        } else if (!isLocked) {
            tab.innerHTML = tab.dataset.label || tab.textContent.replace("🔒", "").trim();
        }
    });
}


    function enforceFloorLock() {
        const lockedFloor = localStorage.getItem("lockedFloor");

        // Hide all floors
        document.querySelectorAll(".rooms").forEach(floor => {
            floor.style.display = "none";
        });

        // Reset all tab styles first
        document.querySelectorAll(".floor-tab").forEach(tab => {
            tab.classList.remove("locked");
        });

        // If there's a locked floor, show only that
        if (lockedFloor) {
            const floorToShow = document.getElementById(lockedFloor);
            if (floorToShow) floorToShow.style.display = "block";

            // Highlight the locked tab
            const lockedTab = document.querySelector(`.floor-tab[data-floor="${lockedFloor}"]`);
            if (lockedTab) lockedTab.classList.add("locked");
        }
        updateFloorTabIcons(); // 🟢 Add this line
    }

    
    function toggleFloorLock(floorId) {
            const currentLock = localStorage.getItem("lockedFloor");

            if (currentLock === floorId) {
                // Unlock the floor
                localStorage.removeItem("lockedFloor");
                showNotification(`🔓 Unlocked ${floorId}`);
            } else {
                // Lock this floor
                localStorage.setItem("lockedFloor", floorId);
                showNotification(`🔒 Locked ${floorId}`);
            }

            enforceFloorLock(); // Refresh UI based on lock state
            updateFloorTabIcons(); // 🟢 Add here too
        }


      function toggleFloor(floorId) {
        const locked = localStorage.getItem("lockedFloor");
        if (locked && locked !== floorId) {
            localStorage.removeItem("lockedFloor");
            Swal.fire("🔓 Floor Unlocked", "You switched floors. Lock removed.", "info");
        }

        // Show the selected floor
        document.querySelectorAll(".rooms").forEach(floor => {
            floor.style.display = "none";
        });
        const selected = document.getElementById(floorId);
        if (selected) selected.style.display = "block";

        // Remove highlight from all, add to selected
        document.querySelectorAll(".floor-tab").forEach(tab => {
            tab.classList.remove("locked");
        });
        const selectedTab = document.querySelector(`.floor-tab[data-floor="${floorId}"]`);
        if (selectedTab) selectedTab.classList.add("locked");
    }

    


    function showNotification(message) {
        Swal.fire({
            toast: true,
            position: "top-end",
            icon: "info",
            title: message,
            showConfirmButton: false,
            timer: 1500
        });
    }

    function updateButtonStatus(roomNumber, status, dndStatus = "available") {
        let formattedRoom = formatRoomNumber(roomNumber);
        const startButton = document.getElementById(`start-${formattedRoom}`);
        const finishButton = document.getElementById(`finish-${formattedRoom}`);
        const checkedButton = document.getElementById(`checked-${formattedRoom}`);
        const dndButton = document.getElementById(`dnd-${formattedRoom}`);

        if (!startButton || !finishButton || !dndButton || !checkedButton) {
            console.warn(`⚠️ Buttons for Room ${formattedRoom} not found in DOM`);
            return;
        }

        console.log(`🎯 Updating Room ${formattedRoom} -> Status: ${status}, DND: ${dndStatus}`);

        // === CLEANING STATUS ===
        if (status === "finished") {
            startButton.disabled = true;
            startButton.style.backgroundColor = "transparent";

            finishButton.disabled = true;
            finishButton.style.backgroundColor = "transparent";

            // Enable checked button (Blue)
            drawCheckButton(roomNumber, "#008CFF", 1.0, true);

        } else if (status === "checked") {
            startButton.disabled = true;
            startButton.style.backgroundColor = "transparent";

            finishButton.disabled = true;
            finishButton.style.backgroundColor = "transparent";

            // ✅ Force checked button GREEN and disabled
            drawCheckButton(roomNumber, "#4CAF50", 1.0, false);

        } else if (status === "in_progress") {
            startButton.disabled = true;
            startButton.style.backgroundColor = "transparent";

            finishButton.disabled = false;
            finishButton.style.backgroundColor = "#008CFF";

            drawCheckButton(roomNumber, "grey", 1.0, false);

        } else {
            // Default - Available
            startButton.disabled = false;
            startButton.style.backgroundColor = "#008CFF";

            finishButton.disabled = true;
            finishButton.style.backgroundColor = "transparent";

            drawCheckButton(roomNumber, "grey", 1.0, false);
        }

        // === DND STATUS ===
        if (dndStatus === "dnd") {
            startButton.disabled = true;
            startButton.style.backgroundColor = "transparent";
            dndButton.classList.add("active-dnd");
            
            void dndButton.offsetWidth;  // 🟢 Add this!
        } else {
            dndButton.classList.remove("active-dnd");
           

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

            const dndStatusMap = new Map(
                (Array.isArray(dndLogs) ? dndLogs : []).map(dnd => [dnd.roomNumber, dnd.dndStatus])
            );

            const logTable = document.querySelector("#logTable tbody");
            logTable.innerHTML = ""; // Clear existing logs

            const checkedRooms = JSON.parse(localStorage.getItem("checkedRooms")) || [];
            let cleaningStatus = {};

            // ✅ Sort logs: "In Progress" first, then latest logs first
            logs.sort((a, b) => {
                if (a.status === "in_progress" && b.status !== "in_progress") return -1;
                if (b.status === "in_progress" && a.status !== "in_progress") return 1;
                return new Date(b.startTime || 0) - new Date(a.startTime || 0);
            });

            logs.forEach(log => {
                console.log("📌 Log Entry:", log);

                let roomNumber = String(log.roomNumber).padStart(3, "0");
                let startTime = log.startTime ? new Date(log.startTime).toLocaleString('en-US', { timeZone: 'Asia/Phnom_Penh' }) : "N/A";
                let startedBy = log.startedBy || "-";
                let finishTime = log.finishTime ? new Date(log.finishTime).toLocaleString('en-US', { timeZone: 'Asia/Phnom_Penh' }) : "កំពុងសម្អាត....";
                let finishedBy = log.finishedBy || "-";
                let status = log.finishTime ? "finished" : "in_progress";
                let dndStatus = dndStatusMap.get(log.roomNumber) ? "dnd" : "available";

                let duration = "-";
                if (log.startTime && log.finishTime) {
                    let durationMs = new Date(log.finishTime) - new Date(log.startTime);
                    let minutes = Math.floor(durationMs / (1000 * 60));
                    duration = minutes > 0 ? `${minutes} min` : "< 1 min";
                }

                updateButtonStatus(roomNumber, status, dndStatus);

                 // ✅ Checked Button Logic FIX:
                if (log.status === "checked" || (checkedRooms.includes(roomNumber) && log.status === "checked")) {
                    drawCheckButton(roomNumber, "#4CAF50", 1.0, false);
                    console.log(`✅ Restored GREEN checked button for Room ${roomNumber}`);
                } else if (status === "finished") {
                    drawCheckButton(roomNumber, "#008CFF", 1.0, true); // BLUE & Enabled after finished
                    console.log(`🔵 Restored BLUE checked button for Room ${roomNumber}`);
                } else {
                    drawCheckButton(roomNumber, "grey", 1.0, false); // Default GREY
                    console.log(`🔄 Restored GREY checked button for Room ${roomNumber}`);
                }


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
                    <td>${duration}</td>
                `;
                logTable.appendChild(row);
            });

            if (!logTable.innerHTML.trim()) {
                logTable.innerHTML = "<tr><td colspan='5'>No logs found.</td></tr>";
            }
             console.log("✅ Finished loading logs and restoring buttons.");

        } catch (error) {
            console.error("❌ Error loading logs:", error);
        }
    }

    async function calculateUserCleaningStats() {
        console.log("🔄 Calculating user cleaning statistics...");

        const logs = await fetchWithErrorHandling(`${apiUrl}/logs`);
        if (!logs || !Array.isArray(logs)) {
            console.warn("⚠️ No valid logs found. Skipping stats update.");
            return;
        }

        let userDurations = {}; // Store cleaning times per user

        logs.forEach(log => {
            if (log.startTime && log.finishTime) {
                const startTime = new Date(log.startTime);
                const finishTime = new Date(log.finishTime);
                const duration = (finishTime - startTime) / 60000; // Convert to minutes

                if (duration > 0) {
                    const user = log.finishedBy || "Unknown";

                    if (!userDurations[user]) {
                        userDurations[user] = { totalDuration: 0, count: 0 };
                    }

                    userDurations[user].totalDuration += duration;
                    userDurations[user].count += 1;
                }
            }
        });

        // Compute averages and find the fastest average
        let fastestUser = null;
        let fastestAverageDuration = Infinity;

        for (const user in userDurations) {
            const average = userDurations[user].totalDuration / userDurations[user].count;
            userDurations[user].average = average.toFixed(1);

            if (average < fastestAverageDuration) {
                fastestAverageDuration = average;
                fastestUser = user;
            }
        }

        return { 
            userDurations, 
            fastestUser, 
            fastestAverageDuration: fastestAverageDuration === Infinity ? null : fastestAverageDuration.toFixed(1)
        };
    }



    function updateDNDStatus(roomNumber, status) {
        const formattedRoom = formatRoomNumber(roomNumber);
        const dndButton = document.getElementById(`dnd-${formattedRoom}`);
        const startButton = document.getElementById(`start-${formattedRoom}`);
        const finishButton = document.getElementById(`finish-${formattedRoom}`);

        if (!dndButton) return;

        if (status === "dnd") {
            dndButton.classList.add("active-dnd");
           
            void dndButton.offsetWidth;  // 🟢 Add this!

            // Disable Start/Fix buttons
            if (startButton) {
                startButton.disabled = true;
                startButton.style.backgroundColor = "grey";
            }
            if (finishButton) {
                finishButton.disabled = true;
                finishButton.style.backgroundColor = "grey";
            }
        } else {
            dndButton.classList.remove("active-dnd");

            if (startButton) {
                startButton.disabled = false;
                startButton.style.backgroundColor = "#008CFF";
            }
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

        // Clear stored authentication data
        localStorage.clear();
        sessionStorage.clear();
        document.cookie = "refreshToken=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;"; // Remove refresh token

        // ✅ Show a clean, modern notification
        Swal.fire({
            icon: "success",
            title: "ចាកចេញ",
            text: "អ្នកចាកចេញដោយជោគជ័យ.",
            confirmButtonText: "OK",
            timer: 2000, // Auto-close in 2 seconds
            showConfirmButton: false // Removes OK button for a cleaner look
        });

        // ✅ Show the login form & hide the dashboard
        setTimeout(() => {
            document.getElementById("auth-section").style.display = "block";
            document.getElementById("dashboard").style.display = "none";
        }, 2000);
    }

    async function clearLogs() {
        console.log("🧹 Clearing all logs, inspection logs, and resetting room statuses...");

        // ✅ Confirmation popup
        const confirmClear = await Swal.fire({
            title: "អ្នកប្រាកដទេ?",
            text: "វានឹងលុចចោលទិន្នន័យសម្អាត និងត្រួតពិនិត្យទាំងអស់!",
            icon: "warning",
            showCancelButton: true,
            confirmButtonColor: "#d33",
            cancelButtonColor: "#3085d6",
            confirmButtonText: "យល់ព្រម!",
            cancelButtonText: "អត់ទេ"
        });

        if (!confirmClear.isConfirmed) {
            console.log("🚫 Log clearing canceled.");
            return;
        }

        try {
            // ✅ API Request to clear logs server-side
            const res = await fetch(`${apiUrl}/logs/clear`, { method: "POST" });
            if (!res.ok) {
                const errorData = await res.json();
                console.error("❌ Error clearing logs on server:", errorData);
                alert(`❌ Failed to clear logs: ${errorData.message}`);
                return;
            }
            console.log("✅ Logs cleared successfully on server.");
            logsCleared = true; // ✅ Set flag to true

            /** === STEP 1: Reset Logs Table === */
            document.querySelector("#logTable tbody").innerHTML = "";

            /** === STEP 2: Reset All Room Buttons === */
            document.querySelectorAll(".room").forEach(roomDiv => {
                const roomNumber = roomDiv.querySelector("span").innerText.replace("Room ", "").trim();

                const startButton = document.getElementById(`start-${roomNumber}`);
                const finishButton = document.getElementById(`finish-${roomNumber}`);
                const checkedButton = document.getElementById(`checked-${roomNumber}`);
                const dndButton = document.getElementById(`dnd-${roomNumber}`);

                // Start → Blue & enabled
                if (startButton) {
                    startButton.disabled = false;
                    startButton.style.backgroundColor = "#008CFF";
                }

                // Finish → Transparent & disabled
                if (finishButton) {
                    finishButton.disabled = true;
                    finishButton.style.backgroundColor = "transparent";
                }

                // DND → Transparent & inactive
                if (dndButton) {
                    dndButton.classList.remove("active-dnd");
                    dndButton.style.backgroundColor = "transparent";
                }

                // Checked → Grey, disabled
                if (checkedButton) {
                    drawCheckButton(roomNumber, "grey", 1.0, false);
                }
            });

            /** === STEP 3: Reset Priorities === */
            document.querySelectorAll(".priority-toggle").forEach(button => {
                button.innerHTML = "⚪";
            });
            document.querySelectorAll(".priority-dropdown").forEach(dropdown => {
                dropdown.classList.remove("show");
            });

            /** === STEP 4: Clear Relevant LocalStorage === */
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith("priority-") || key.startsWith("status-") || key.startsWith("dnd-")) {
                    localStorage.removeItem(key);
                }
            });

            /** === STEP 5: Clear Checked Rooms List === */
            localStorage.removeItem("checkedRooms");
            console.log("✅ Cleared checkedRooms from localStorage.");

            /** === STEP 6: Reset Checked Buttons UI === */
            document.querySelectorAll(".room button").forEach(button => {
                if (button.id.startsWith("checked-")) {
                    let roomNum = button.id.replace("checked-", "");
                    drawCheckButton(roomNum, "grey", 1.0, false);
                }
            });

            /** === STEP 7: Clear Inspection Logs & UI === */
            inspectionLogs = []; // Reset variable
            localStorage.removeItem("inspectionLogs");
            console.log("✅ Cleared inspectionLogs from localStorage.");

            // Reset inspection buttons visually
            document.querySelectorAll(".inspection-btn, .inspection-button").forEach(button => {
                button.classList.remove("clean", "not-clean", "active");
            });
            console.log("✅ All inspection buttons visually reset.");

            /** === STEP 8: Emit WebSocket Events to ALL devices === */
            if (window.socket && window.socket.connected) {
                window.socket.emit("clearLogs");
                window.socket.emit("updatePriorityStatus", { status: "reset" });
                window.socket.emit("resetCheckedRooms");
                window.socket.emit("forceClearCheckedRooms");
                window.socket.emit("clearInspectionLogs"); // 🚀 Inspection logs clear event!
                window.socket.emit("requestButtonStatus"); // Force reload
            } else {
                console.warn("⚠️ WebSocket disconnected. Attempt reconnect...");
                reconnectWebSocket();
            }

            /** === STEP 9: Reload Logs & Buttons === */
            await restoreCleaningStatus();
            await loadLogs();

            /** === STEP 10: Success Message === */
            Swal.fire({
                icon: "success",
                title: "របាយការណ៍ត្រូវបានលុច",
                text: "បានលុបរបាយការណ៍ និងត្រួតពិនិត្យទាំងអស់ដោយជោគជ័យ.",
                timer: 2000,
                showConfirmButton: false
            });

        } catch (error) {
            console.error("❌ Error clearing logs:", error);
            Swal.fire({
                icon: "error",
                title: "មានបញ្ហា",
                text: "បញ្ហាបច្ចេកទេសក្នុងពេលលុបទិន្នន័យ",
                confirmButtonText: "OK"
            });
        }
    }

   function toggleDropdownMenu() {
      const menu = document.querySelector(".dropdown-content");
      console.log("Toggling menu"); // ✅ See if this logs
      menu.classList.toggle("show");
    }

  function getFullImageURL(image) {
  return image?.startsWith("data:image/")
    ? image
    : image
    ? `${apiUrl}/uploads/${image}`
    : "https://via.placeholder.com/80";
}

function updateOnlineIndicators() {
  document.querySelectorAll(".user-card").forEach(card => {
    const username = card.dataset.username;
    const isOnline = onlineUsernames.includes(username);

    const existingDot = card.querySelector(".online-dot");
    if (isOnline) {
      if (!existingDot) {
        const dot = document.createElement("span");
        dot.className = "online-dot";
        dot.style = "position: absolute; bottom: 2px; right: 2px; width: 12px; height: 12px; background-color: #0f0; border: 2px solid white; border-radius: 50%;";
        const container = card.querySelector("div[style*='position: relative']");
        if (container) container.appendChild(dot);
      }
    } else {
      if (existingDot) {
        existingDot.remove();
      }
    }
  });
}

// 🧠 Load user profile and display modal
async function handleUserAccount() {
  const res = await fetch(`${apiUrl}/user/profile`, {
    headers: { Authorization: `Bearer ${getToken()}` }
  });

  const data = await res.json();
  const { username, phone, profileImage, score } = data;
  const stars = "⭐".repeat(score || 0);

  Swal.fire({
    title: "👤 User Account",
    html: `
      <div id="view-profile" style="display: flex; flex-direction: column; align-items: center; gap: 10px;">
        <img src="${getFullImageURL(profileImage)}"
        style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; border: 2px solid #ccc;" />

        <p><strong>Username:</strong> ${username}</p>
        <p><strong>Phone:</strong> ${phone || "Not set"}</p>
        <p><strong>Score:</strong> ${stars} (${score})</p>
      </div>
      <div style="margin-top: 10px;">
        <button id="edit-profile-btn" class="swal2-confirm swal2-styled">Edit Profile</button>
      </div>
    `,
    showCancelButton: true,
    cancelButtonText: "Close",
    showConfirmButton: false,
    customClass: { popup: "minimal-popup-menu" },
    didOpen: () => {
      document.getElementById("edit-profile-btn").addEventListener("click", () => {
        showEditProfileForm({ username, phone, profileImage, score });
      });
    }
  });
}

function showEditProfileForm({ username, phone, profileImage, score, position }) {
  const stars = "⭐".repeat(score || 0);

  Swal.fire({
    title: "Edit Profile",
    html: `
      <form id="edit-profile-form" style="display: flex; flex-direction: column; align-items: center; gap: 10px;">
        <img id="edit-profile-preview" src="${profileImage || "https://via.placeholder.com/80"}" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; border: 2px solid #ccc;" />
        <input type="file" id="edit-profile-upload" accept="image/*" />
        <input id="edit-phone" type="tel" value="${phone || ""}" placeholder="Phone" style="padding: 6px; width: 100%;" />
        <input id="edit-position" type="text" value="${position || ""}" placeholder="Position" style="padding: 6px; width: 100%;" />
        <input id="edit-password" type="password" placeholder="New Password (optional)" style="padding: 6px; width: 100%;" />
        <p><strong>Username:</strong> ${username}</p>
        <p>Score: ${stars} (${score})</p>
      </form>
    `,
    showCancelButton: true,
    confirmButtonText: "Save",
    cancelButtonText: "Cancel",
    preConfirm: async () => {
      const phone = document.getElementById("edit-phone").value;
      const position = document.getElementById("edit-position").value;
      const password = document.getElementById("edit-password").value;
      const file = document.getElementById("edit-profile-upload").files[0];

      const formData = new FormData();
      formData.append("phone", phone);
      formData.append("position", position);
      if (password) formData.append("password", password);
      if (file) formData.append("profileImage", file);
      Swal.showLoading();

      const res = await fetch(`${apiUrl}/user/update-profile`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getToken()}`
        },
        body: formData
      });

      if (!res.ok) {
        const err = await res.json();
        console.error("❌ Failed to update profile:", err);
        throw new Error(err.message || "Failed to update profile.");
      }

      const updated = await res.json();

      updateHeaderProfile({
        username: updated.username,
        profileImage: updated.profileImage?.startsWith("data:image/")
          ? updated.profileImage
          : updated.profileImage
            ? `${apiUrl}/uploads/${updated.profileImage}`
            : "default-avatar.png"
      });

      Swal.fire("✅ Saved", "Your profile has been updated.", "success");

      await showDashboard(updated.username);
    },
    didOpen: () => {
      document.getElementById("edit-profile-upload").addEventListener("change", (event) => {
        const file = event.target.files[0];
        const preview = document.getElementById("edit-profile-preview");
        if (file) {
          const reader = new FileReader();
          reader.onload = (e) => preview.src = e.target.result;
          reader.readAsDataURL(file);
        }
      });
    },
    customClass: { popup: "minimal-popup-menu" }
  });
}


async function showLeaderboard() {
  try {
    // Show loading while fetching
    Swal.fire({
      title: "Loading leaderboard...",
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });

    const res = await fetch(`${apiUrl}/score/leaderboard`, {
      headers: {
        Authorization: `Bearer ${getToken()}`
      }
    });


    const data = await res.json();

    // Define medals
    const medals = ["🥇", "🥈", "🥉"];

    // Create leaderboard HTML
    let html = "<ol style='text-align: left; padding-left: 0;'>";

    data.forEach(({ _id, count, profileImage }, index) => {
      const imageUrl = profileImage
        ? getFullImageURL(profileImage)
        : "https://via.placeholder.com/40";

      html += `
        <li style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
          <span style="font-size: 20px;">${medals[index] || "⭐"}</span>
          <img src="${imageUrl}" alt="Profile" style="width: 40px; height: 40px; border-radius: 50%; border: 1px solid #ccc; object-fit: cover;" />
          <div>
            <strong>${_id}</strong><br/>
            <small>⭐ x${count}</small>
          </div>
        </li>`;
    });

    html += "</ol>";

    Swal.fire({
      title: "🌟 Top 3 Cleaners",
      html,
      confirmButtonText: "Close",
      customClass: { popup: "minimal-popup-menu" }
    });
  } catch (err) {
    console.error("❌ Error loading leaderboard:", err);
    Swal.fire("Error", "Unable to load leaderboard.", "error");
  }
}

async function showAllUsers() {
  try {
    Swal.fire({
      title: "Loading Users...",
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });

    const res = await fetch(`${apiUrl}/user/all`, {
      headers: {
        Authorization: `Bearer ${getToken()}`
      }
    });

    const users = await res.json();

    if (!res.ok || !Array.isArray(users)) {
      throw new Error("Failed to fetch users.");
    }

    // Get current username (from decoded token or stored session)
    const token = getToken();
    const payload = JSON.parse(atob(token.split(".")[1]));
    const currentUsername = payload.username;

    // Sort: current user on top
    users.sort((a, b) => {
      if (a.username === currentUsername) return -1;
      if (b.username === currentUsername) return 1;
      return a.username.localeCompare(b.username);
    });

    // Build user cards with online indicator
    const userCards = users.map(user => {
      const imageUrl = getFullImageURL(user.profileImage);
      const isOnline = onlineUsernames.includes(user.username);
      const onlineDot = isOnline ? `<span class="online-dot" style="display:inline-block; width:10px; height:10px; border-radius:50%; background-color:#0f0; margin-right:6px;"></span>` : "";

      return `
      <div class="user-card" data-username="${user.username}" style="display: flex; align-items: center; gap: 12px; border-bottom: 1px solid #ddd; padding: 10px 0;">
        <div style="position: relative; display: inline-block;">
          <img src="${imageUrl}" alt="${user.username}" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover; border: 1px solid #ccc;" />
          ${isOnline ? `<span style="position: absolute; bottom: 2px; right: 2px; width: 12px; height: 12px; background-color: #0f0; border: 2px solid white; border-radius: 50%;"></span>` : ""}
        </div>
        <div style="flex-grow: 1;">
          <strong>${user.username}</strong><br/>
          <small>📞 ${user.phone || "Not set"}</small><br/>
          <small>${user.position || "Unknown Position"}</small>
        </div>
      </div>
    `;
    }).join('');

    Swal.fire({
      title: "👥 All Users",
      html: `<div style="max-height: 400px; overflow-y: auto;">${userCards}</div>`,
      confirmButtonText: "Close",
      customClass: { popup: "minimal-popup-menu" },
      width: 400
    });

  } catch (err) {
    console.error("❌ Failed to show users:", err);
    Swal.fire("Error", "Unable to fetch user list.", "error");
  }
}


    function clearLocalStorage() {
      localStorage.clear();
      Swal.fire("🧹 Cleared", "Local storage cleared!", "success").then(() => {
        location.reload(); // Optional
      });
    }


   document.getElementById("menu-button").addEventListener("click", () => {
  Swal.fire({
    title: 'Menu',
    html: `
      <div style="display: flex; flex-direction: column; gap: 10px; width: 100%;">
        <button class="minimal-menu-button" onclick="handleUserAccount()">👤 User Account</button>
        <button class="minimal-menu-button" onclick="showAllUsers()">👥 All Users</button>
        <button class="minimal-menu-button" onclick="showLeaderboard()">🏅 Board</button>
        <button class="minimal-menu-button" onclick="exportLogs()">📄 Export Cleaning Logs</button>
        <button class="minimal-menu-button" onclick="exportInspectionPDF()">📝 Export Inspection Logs</button>
        <button class="minimal-menu-button" onclick="clearLocalStorage()">🧹 Clear Local Storage</button>
        <button class="minimal-menu-button" onclick="logout()">🔓 Logout</button>
        <button class="minimal-menu-button" onclick="clearLogs()">🗑️ Clear Logs</button>
      </div>
    `,
    showConfirmButton: false,
    width: 320,
    customClass: {
      popup: 'minimal-popup-menu'
    }
  });
});



    function exportInspectionPDF() {
        if (!window.jspdf) {
            console.error("❌ jsPDF library is not loaded.");
            return;
        }

        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF();

        const formattedDate = new Date().toISOString().split('T')[0];
        pdf.setFontSize(16);
        pdf.text(`Room Inspection Report (${formattedDate})`, 14, 15);

        if (!inspectionLogs || inspectionLogs.length === 0) {
            alert("No inspection logs found.");
            return;
        }

        let inspectionData = [];

        // Sort logs by room number
        inspectionLogs.sort((a, b) => parseInt(a.roomNumber, 10) - parseInt(b.roomNumber, 10));

        inspectionLogs.forEach(log => {
            let row = [log.roomNumber];
            const items = ["TV", "Sofa", "Lamp", "Light", "Amenity", "Complimentary", "Balcony", "Sink", "Door", "Minibar"];
            for (let item of items) {
                row.push(log.items && log.items[item] === "clean" ? "Yes" : log.items && log.items[item] === "not_clean" ? "No" : "-");
            }
            inspectionData.push(row);
        });

           pdf.autoTable({
            head: [[
                "Room", "TV", "Sofa", "Lamp", "Light", "Amenity", 
                "Complimentary", "Balcony", "Sink", "Door", "Minibar"
            ]],
            body: inspectionData,
            startY: 25,
            styles: {
                fontSize: 10,
                cellPadding: 3,
                valign: 'middle',
                overflow: 'linebreak',
                minCellHeight: 10,           // Uniform row height
            },
            columnStyles: {
                0: { cellWidth: 15 },        // Room column narrower
                1: { cellWidth: 15 },
                2: { cellWidth: 15 },
                3: { cellWidth: 15 },
                4: { cellWidth: 15 },
                5: { cellWidth: 20 },
                6: { cellWidth: 25 },        // Longer text columns slightly wider
                7: { cellWidth: 20 },
                8: { cellWidth: 15 },
                9: { cellWidth: 15 },
                10: { cellWidth: 20 },
            },
            headStyles: {
                fillColor: [41, 128, 185], // Blue header
                textColor: 255,
                halign: 'center',
                valign: 'middle',
            },
            bodyStyles: {
                halign: 'center',
                valign: 'middle',
            },
            didParseCell: function (data) {
                if (data.section === 'body' && data.cell.text[0] === "No") {
                    data.cell.styles.fillColor = [231, 76, 60]; // Red background
                    data.cell.styles.textColor = 255;           // White text
                }
            }
        });
        pdf.save(`inspection_logs_${formattedDate}.pdf`);
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
                logs.push(rowData);handleUserAccount
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

        // Get today's date in YYYY-MM-DD format for file name
        const formattedDate = new Date().toISOString().split('T')[0];

        pdf.save(`cleaning_logs_${formattedDate}.pdf`);

    }

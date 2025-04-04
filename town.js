const TILE_SIZE = 80; // Adjusted tile size for better visibility
const gridWidth = Math.ceil(window.innerWidth / (TILE_SIZE / 2)) + 8; // Add extra tiles to fully cover the screen width
const gridHeight = Math.ceil(window.innerHeight / (TILE_SIZE / 4)) + 8; // Add extra tiles to fully cover the screen height
const gridOffsetX = 0; // Removed horizontal offset
const gridOffsetY = 0; // Removed vertical offset

let selectedBuilding = "house"; // Default building to place
let userScore = 1; // For now, just a placeholder score
let hoveredBuilding = null;

const buildingOptions = [
  "house", "hotel", "school", "hospital",
  "policestation", "firestation", "manufacture", "museum",
  "nuclear", "supermarket", "university", "whitehouse", "tvstation",
  "tree", "Tree2", "Tree3", "Tree4", "Tree5", // Add all tree types
  "rock", "rock2", "rock3", "rock4", // Add all rock types
  "pond", "deer", "direction" // Add pond, deer, and direction
];

const buildingScales = {
  house: 0.9, // Adjusted scale for better visibility
  hotel: 0.85, // Adjusted scale for better visibility
  school: 0.85, // Adjusted scale for better visibility
  hospital: 0.85, // Adjusted scale for better visibility
  policestation: 0.85, // Adjusted scale for better visibility
  firestation: 0.85, // Adjusted scale for better visibility
  manufacture: 0.8, // Adjusted scale for better visibility
  museum: 0.85, // Adjusted scale for better visibility
  nuclear: 0.8, // Adjusted scale for better visibility
  supermarket: 0.85, // Adjusted scale for better visibility
  university: 0.85, // Adjusted scale for better visibility
  whitehouse: 0.85, // Adjusted scale for better visibility
  tvstation: 0.83, // Adjusted scale for better visibility
  tree: 0.3, // Adjusted scale for better visibility
  Tree2: 0.3, // Adjusted scale for better visibility
  Tree3: 0.3, // Adjusted scale for better visibility
  Tree4: 0.3, // Adjusted scale for better visibility
  Tree5: 0.3, // Adjusted scale for better visibility
  rock: 0.3, // Adjusted scale for better visibility
  rock2: 0.3, // Adjusted scale for better visibility
  rock3: 0.3, // Adjusted scale for better visibility
  rock4: 0.3, // Adjusted scale for better visibility
  deer: 0.3, // Adjusted scale for better visibility
  direction: 0.3, // Adjusted scale for better visibility
  pond: 0.3 // Adjusted scale for better visibility
};

const buildingOffsets = {
  house: 0,
  hotel: 0,
  school: 0,
  hospital: 0,
  policestation: 0,
  firestation: 0,
  manufacture: 10,
  museum: 6,
  nuclear: 12,
  supermarket: 0,
  university: 0,
  whitehouse: 0,
  tvstation: 8
};

function isoToScreen(x, y) {
  return {
    x: (x - y) * TILE_SIZE / 2,
    y: (x + y) * TILE_SIZE / 4
  };
}

function screenToIso(mouseX, mouseY) {
  const isoX = Math.floor((mouseX / (TILE_SIZE / 2) + mouseY / (TILE_SIZE / 4)) / 2);
  const isoY = Math.floor((mouseY / (TILE_SIZE / 4) - mouseX / (TILE_SIZE / 2)) / 2);
  return { x: isoX, y: isoY };
}

function drawTile(ctx, x, y, imgName, imageMap, highlight = false) {
  const img = imgName ? imageMap[imgName] : null;
  if (img) {
    ctx.imageSmoothingEnabled = false;

    if (imgName === "bale") {
      const scale = 0.5;
      ctx.drawImage(
        img,
        (x - y) * TILE_SIZE / 2 - (img.width * scale) / 2,
        (x + y) * TILE_SIZE / 4 - (img.height * scale) / 2,
        img.width * scale,
        img.height * scale
      );
    } else {
      let scale = buildingScales[imgName] || 0.5;
      const offsetY = buildingOffsets[imgName] || 0;

      if (hoveredBuilding && hoveredBuilding.x === x && hoveredBuilding.y === y) {
        scale *= 1.1; // increase by 10%
      }

      ctx.drawImage(
        img,
        (x - y) * TILE_SIZE / 2 - (img.width * scale) / 2,
        (x + y) * TILE_SIZE / 4 - (img.height * scale) / 2 + offsetY,
        img.width * scale,
        img.height * scale
      );
    }
  }

  // Add a light green border to the tile
  ctx.strokeStyle = 'lightgreen';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo((x - y) * TILE_SIZE / 2, (x + y) * TILE_SIZE / 4 - TILE_SIZE / 4);
  ctx.lineTo((x - y) * TILE_SIZE / 2 + TILE_SIZE / 2, (x + y) * TILE_SIZE / 4);
  ctx.lineTo((x - y) * TILE_SIZE / 2, (x + y) * TILE_SIZE / 4 + TILE_SIZE / 4);
  ctx.lineTo((x - y) * TILE_SIZE / 2 - TILE_SIZE / 2, (x + y) * TILE_SIZE / 4);
  ctx.closePath();
  ctx.stroke();

  if (highlight) {
    ctx.strokeStyle = 'yellow';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo((x - y) * TILE_SIZE / 2, (x + y) * TILE_SIZE / 4 - TILE_SIZE / 4);
    ctx.lineTo((x - y) * TILE_SIZE / 2 + TILE_SIZE / 2, (x + y) * TILE_SIZE / 4);
    ctx.lineTo((x - y) * TILE_SIZE / 2, (x + y) * TILE_SIZE / 4 + TILE_SIZE / 4);
    ctx.lineTo((x - y) * TILE_SIZE / 2 - TILE_SIZE / 2, (x + y) * TILE_SIZE / 4);
    ctx.closePath();
    ctx.stroke();
  }
}

const landData = [];
function drawEmptyLand(ctx, imageMap, hoverTile) {
  const width = gridWidth; // Use dynamically calculated grid width
  const height = gridHeight; // Use dynamically calculated grid height

  // Ensure landData is initialized only once
  if (landData.length === 0) {
    for (let y = -4; y < height + 4; y++) { // Add buffer to ensure full vertical coverage
      for (let x = -4; x < width + 4; x++) { // Add buffer to ensure full horizontal coverage
        landData.push({ x, y });
      }
    }
  }

  // Draw ground
  for (let y = -4; y < height + 4; y++) {
    for (let x = -4; x < width + 4; x++) {
      const tile = landData.find(t => t.x === x && t.y === y);
      const highlight = hoverTile && hoverTile.x === x && hoverTile.y === y;

      drawTile(ctx, x, y, tile?.building || null, imageMap, highlight);
    }
  }
}

function adjustCanvasSize() {
  const canvas = document.getElementById("gameCanvas");
  canvas.width = window.innerWidth; // Match canvas width to the screen width
  canvas.height = window.innerHeight; // Match canvas height to the screen height
}

window.addEventListener("resize", () => {
  adjustCanvasSize(); // Adjust canvas size on window resize
  const ctx = document.getElementById("gameCanvas").getContext("2d");
  drawEmptyLand(ctx, window.imageMapGlobal, null); // Redraw the grid
});

function preloadImages(names, path, callback) {
  const images = {};
  let loaded = 0;
  for (const name of names) {
    const img = new Image();
    img.onload = () => {
      loaded++;
      if (loaded === names.length) {
        window.imageMapGlobal = images; // Expose imageMapGlobal
        callback(images);
      }
    };
    img.src = `${path}/${name}.png`;
    images[name] = img;
  }
}

function selectBuilding(name, x, y) {
  const pos = landData.find(tile => tile.x === x && tile.y === y);
  if (pos) {
    pos.building = name; // Assign the selected building to the tile
    const canvas = document.getElementById("gameCanvas");
    const ctx = canvas.getContext("2d");
    drawEmptyLand(ctx, window.imageMapGlobal, null); // Redraw the grid to reflect the change
    Swal.close(); // Close the modal after placing the building
  } else {
    console.error(`Tile at (${x}, ${y}) not found in landData.`);
  }
}

function handleTileClick(mouseX, mouseY) {
  if (Swal.isVisible()) {
    // Prevent triggering another Swal if one is already open
    return;
  }

  const iso = screenToIso(mouseX, mouseY); // Convert screen coordinates to isometric coordinates
  const tile = landData.find(t => t.x === iso.x && t.y === iso.y); // Find the clicked tile
  if (tile) {
    if (tile.building) {
      // If the tile already has a building, show options to change or remove it
      Swal.fire({
        title: `Current: ${tile.building}`,
        html: `
          <img 
            src="assets/isometric/${tile.building}.png" 
            alt="${tile.building}" 
            style="width: 64px; height: 64px; display: block; margin: auto;" 
          />
          <div style="margin-top: 12px;">
            <button onclick="removeBuilding(${tile.x}, ${tile.y})" class="swal2-confirm swal2-styled" style="margin-right: 10px;">Remove</button>
            <button onclick="changeBuilding(${tile.x}, ${tile.y})" class="swal2-cancel swal2-styled">Change</button>
          </div>
        `,
        showConfirmButton: false,
        showCancelButton: false
      });
    } else {
      // If the tile is empty, show the building selection modal
      Swal.fire({
        title: 'Choose an item',
        showCancelButton: true,
        html: buildingOptions.map(name => `
          <img 
            src="assets/isometric/${name}.png" 
            alt="${name}" 
            title="${name}" 
            style="width: 64px; height: 64px; margin: 4px; cursor: pointer;" 
            onclick="selectBuilding('${name}', ${tile.x}, ${tile.y})"
          />
        `).join(''),
        showConfirmButton: false
      });
    }
  } else {
    console.error(`No tile found at screen coordinates (${mouseX}, ${mouseY}).`);
  }
}

window.removeBuilding = function(x, y) {
  const pos = landData.find(tile => tile.x === x && tile.y === y);
  if (pos) {
    delete pos.building;
    const canvas = document.getElementById("gameCanvas");
    const ctx = canvas.getContext("2d");
    drawEmptyLand(ctx, imageMapGlobal, null);
    Swal.close();
  }
};

window.changeBuilding = function(x, y) {
  Swal.fire({
    title: 'Choose a new building',
    showCancelButton: true,
    html: buildingOptions.map(name => `
      <img 
        src="assets/isometric/${name}.png" 
        alt="${name}" 
        title="${name}" 
        style="width: 120px; height: 120px; margin: 10px; cursor: pointer;" 
        onclick="selectBuilding('${name}', ${x}, ${y})"
      />
    `).join(''),
    showConfirmButton: false,
    customClass: {
      popup: 'swal2-fullscreen-popup' // Add a custom class for fullscreen popup
    }
  });
};

// Update the custom style for the fullscreen popup to ensure it works properly
const style = document.createElement('style');
style.innerHTML = `
  .swal2-fullscreen-popup {
    position: fixed !important; /* Ensure the popup is fixed to the viewport */
    top: 0 !important; /* Align to the top of the screen */
    left: 0 !important; /* Align to the left of the screen */
    width: 100% !important; /* Full width */
    height: 100% !important; /* Full height */
    max-width: none !important; /* Remove max-width restriction */
    margin: 0 !important; /* Remove margin */
    border-radius: 0 !important; /* Remove border radius */
    overflow: hidden !important; /* Prevent content overflow */
    background-color: white !important; /* Ensure a consistent background color */
  }
  .swal2-title {
    font-size: 28px !important; /* Larger title font size for mobile */
    text-align: center; /* Center the title */
    margin-top: 20px !important; /* Add spacing above the title */
  }
  .swal2-html-container {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: center;
    gap: 15px; /* Add spacing between items */
    height: calc(100% - 120px); /* Adjust height to fit content */
    overflow-y: auto; /* Enable scrolling if content overflows */
    padding: 20px; /* Add padding for better spacing */
  }
  .swal2-actions {
    position: absolute;
    bottom: 20px;
    width: 100%;
    display: flex;
    justify-content: center;
  }
  .swal2-popup img {
    max-width: 120px; /* Increase image size for better visibility */
    max-height: 120px;
    cursor: pointer;
  }
`;
document.head.appendChild(style);

const birds = []; // Array to store bird positions and velocities
const clouds = []; // Array to store cloud positions and velocities

function initializeBirds() {
  for (let i = 0; i < 5; i++) {
    birds.push({
      x: Math.random() * window.innerWidth, // Use full screen width
      y: Math.random() * window.innerHeight / 2, // Use top half of the screen
      vx: 1 + Math.random() * 2, // Random horizontal velocity
      vy: Math.random() * 0.5 - 0.25 // Random vertical velocity
    });
  }
}

function drawBirds(ctx) {
  ctx.fillStyle = "black";
  for (const bird of birds) {
    ctx.beginPath();
    // Adjust bird position to use the full screen
    ctx.moveTo(bird.x, bird.y);
    ctx.lineTo(bird.x - 5, bird.y + 3);
    ctx.lineTo(bird.x + 5, bird.y + 3);
    ctx.closePath();
    ctx.fill();
  }
}

function updateBirds() {
  for (const bird of birds) {
    bird.x += bird.vx;
    bird.y += bird.vy;

    // Reset bird position if it flies off the screen
    if (bird.x > window.innerWidth) {
      bird.x = -10;
      bird.y = Math.random() * window.innerHeight / 2;
    }
  }
}

function initializeClouds() {
  for (let i = 0; i < 3; i++) {
    clouds.push({
      x: Math.random() * window.innerWidth, // Use full screen width
      y: Math.random() * 150, // Clouds stay near the top of the screen
      vx: 0.5 + Math.random() * 0.5 // Random horizontal velocity
    });
  }
}

function drawClouds(ctx) {
  ctx.fillStyle = "rgba(200, 200, 200, 0.8)"; // Light gray color for clouds
  for (const cloud of clouds) {
    ctx.beginPath();
    // Adjust cloud position to use the full screen
    ctx.arc(cloud.x, cloud.y, 20, 0, Math.PI * 2); // Main circle
    ctx.arc(cloud.x + 15, cloud.y + 5, 15, 0, Math.PI * 2); // Right circle
    ctx.arc(cloud.x - 15, cloud.y + 5, 15, 0, Math.PI * 2); // Left circle
    ctx.arc(cloud.x, cloud.y + 10, 18, 0, Math.PI * 2); // Bottom circle
    ctx.fill();
  }
}

function updateClouds() {
  for (const cloud of clouds) {
    cloud.x += cloud.vx;

    // Reset cloud position if it moves off the screen
    if (cloud.x > window.innerWidth) {
      cloud.x = -50;
      cloud.y = Math.random() * 150;
    }
  }
}

window.addEventListener("DOMContentLoaded", () => {
  Swal.fire('Hello, Eightfold Town!');
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  adjustCanvasSize(); // Adjust canvas size on initial load

  preloadImages([
    "tree", "Tree2", "Tree3", "Tree4", "Tree5", "bale", "house", "hotel", "school", "hospital",
    "policestation", "firestation", "manufacture", "museum", "nuclear", "supermarket", "university",
    "whitehouse", "tvstation", "rock", "rock2", "rock3", "rock4", "deer", "direction", "pond", "pine"
  ], "assets/isometric", (images) => {
    let hoverTile = null;
    let holdTimer = null;
    let heldTile = null;

    initializeBirds(); // Initialize bird positions
    initializeClouds(); // Initialize cloud positions

    function render() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawEmptyLand(ctx, images, hoverTile);
      drawClouds(ctx); // Draw the clouds
      updateClouds(); // Update cloud positions
      drawBirds(ctx); // Draw the birds
      updateBirds(); // Update bird positions
      document.getElementById("scoreDisplay").innerText = `Score: ${userScore}`;
    }

    function animate() {
      render();
      requestAnimationFrame(animate); // Continuously update the canvas
    }

    function handleHoldStart(x, y) {
      const pos = [...landData].reverse().find(tile => {
        if (!tile.building) return false;
        const img = imageMapGlobal[tile.building];
        const scale = buildingScales[tile.building] || 0.5;
        const offsetY = buildingOffsets[tile.building] || 0;
        const screen = isoToScreen(tile.x, tile.y);
        const dx = x - (screen.x - (img.width * scale) / 2);
        const dy = y - (screen.y - (img.height * scale) / 2 + offsetY);
        return dx >= 0 && dx <= img.width * scale && dy >= 0 && dy <= img.height * scale;
      });

      if (pos) {
        holdTimer = setTimeout(() => {
          heldTile = pos;
          Swal.fire({
            icon: 'info',
            title: 'Relocate Mode',
            text: 'Click or tap another tile to move this building.'
          });
        }, 600); // long press duration (600ms)
      }
    }

    function handleHoldEnd() {
      clearTimeout(holdTimer);
    }

    function handleRelocate(x, y) {
      if (heldTile) {
        const iso = screenToIso(x, y);
        const targetTile = landData.find(tile => tile.x === iso.x && tile.y === iso.y);
        if (targetTile && !targetTile.building) {
          targetTile.building = heldTile.building;
          delete heldTile.building;
          heldTile = null;
          render();
        } else {
          Swal.fire('Invalid Move', 'You can only relocate to an empty tile.', 'warning');
        }
      }
    }

    canvas.addEventListener("mousemove", (e) => {
      const rect = canvas.getBoundingClientRect();
      const { x, y } = screenToIso(e.clientX - rect.left, e.clientY - rect.top);
      hoverTile = {
        x: Math.max(0, Math.min(gridWidth - 1, x)),
        y: Math.max(0, Math.min(gridHeight - 1, y))
      };
      render();
    });

    canvas.addEventListener("mousedown", (e) => {
      const rect = canvas.getBoundingClientRect();
      handleHoldStart(e.clientX - rect.left, e.clientY - rect.top);
    });

    canvas.addEventListener("mouseup", handleHoldEnd);

    canvas.addEventListener("click", (e) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      if (heldTile) {
        handleRelocate(mouseX, mouseY);
        return;
      }

      handleTileClick(mouseX, mouseY); // Handle tile click to place or modify buildings
    });

    // Add touch event listeners for mobile support
    canvas.addEventListener("touchstart", (e) => {
      const rect = canvas.getBoundingClientRect();
      const touch = e.touches[0];
      handleHoldStart(touch.clientX - rect.left, touch.clientY - rect.top);
    });

    canvas.addEventListener("touchend", handleHoldEnd);

    canvas.addEventListener("touchmove", (e) => {
      const rect = canvas.getBoundingClientRect();
      const touch = e.touches[0];
      const { x, y } = screenToIso(touch.clientX - rect.left, touch.clientY - rect.top);
      hoverTile = {
        x: Math.max(0, Math.min(gridWidth - 1, x)),
        y: Math.max(0, Math.min(gridHeight - 1, y))
      };
      render();
    });

    canvas.addEventListener("touchend", (e) => {
      const rect = canvas.getBoundingClientRect();
      const touch = e.changedTouches[0];
      if (heldTile) {
        handleRelocate(touch.clientX - rect.left, touch.clientY - rect.top);
      }
    });

    animate(); // Start the animation loop
  }); // end of preloadImages callback
}); // end of DOMContentLoaded event

window.addEventListener("click", (e) => {
  const rect = document.getElementById("gameCanvas").getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  handleTileClick(mouseX, mouseY); // Handle tile click to place or modify buildings
});

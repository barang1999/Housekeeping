const TILE_SIZE = 80; // Adjusted tile size for better visibility
const gridWidth = Math.ceil(window.innerWidth / (TILE_SIZE / 2)) + 8; // Add extra tiles to fully cover the screen width
const gridHeight = Math.ceil(window.innerHeight / (TILE_SIZE / 4)) + 8; // Add extra tiles to fully cover the screen height
const gridOffsetX = 0; // Removed horizontal offset
const gridOffsetY = 0; // Removed vertical offset

let hasDragged = false;
let smoothCursor = { x: 0, y: 0 };
let selectedBuilding = "house"; // Default building to place
let userScore = 1; // For now, just a placeholder score
let hoveredBuilding = null;
let heldTile = null; // Declare heldTile globally
let cursorPosition = null; // Tracks the cursor position during dragging
let dragStart = null;
let relocationInProgress = false; 

// Disable the context menu on the canvas
const canvas = document.getElementById("gameCanvas");
canvas.addEventListener("contextmenu", (e) => {
  e.preventDefault(); // Prevent the default context menu from appearing
});

const buildingOptions = [
  "Tree2", "Tree3", "Tree4", "Tree5", "Tree6", "Tree7", "Tree8", "Tree9",
    "rock", "rock2", "rock3", "rock4","road1","road2","road3","road4","road5","road6","road7","fen","trafficlight","roadlight", "stop","car1","car2","policecar1","policecar2","shop","condo",
    "pond", "deer", "direction", "bbq", "beer", "campchair", "camping",
    "decor1", "deergrass", "grassdecor1", "grassdecor2", "grassdecor3",
    "grassdecor4", "grassdecor5", "grassdecor6", "human1", "human2",
    "mushroom", "plant1", "plant2", "plant3",  "plant4", "plant5", "pine", "butterfly", "pool",
    "house", "hotel", "school", "hospital",
    "policestation", "firestation", "manufacture", "museum",
    "nuclear", "supermarket", "university", "whitehouse", "tvstation"
];

const buildingScales = {
  road1: 0.26,
  road2: 0.5,
  road3: 0.5,
  road4: 0.5,
  road5: 0.3,
  road6: 0.3,
  road7: 0.5,
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
  Tree5: 0.3,
  Tree6: 0.3,
  Tree7: 0.3,
  Tree8: 0.3, // Adjusted scale for better visibility
  rock: 0.3, // Adjusted scale for better visibility
  rock2: 0.3, // Adjusted scale for better visibility
  rock3: 0.3, // Adjusted scale for better visibility
  rock4: 0.3, // Adjusted scale for better visibility
  deer: 0.3, // Adjusted scale for better visibility
  direction: 0.3, // Adjusted scale for better visibility
  bbq: 0.25, // Adjusted scale for new object
  beer: 0.25, // Adjusted scale for new object
  campchair: 0.25, // Adjusted scale for new object
  camping: 0.45, // Adjusted scale for new object
  decor1: 0.25, // Adjusted scale for new object
  deergrass: 0.25, // Adjusted scale for new object
  grassdecor1: 0.25, // Adjusted scale for new object
  grassdecor2: 0.25, // Adjusted scale for new object
  grassdecor3: 0.25, // Adjusted scale for new object
  grassdecor4: 0.25, // Adjusted scale for new object
  grassdecor5: 0.25, // Adjusted scale for new object
  grassdecor6: 0.25, // Adjusted scale for new object
  human1: 0.25, // Adjusted scale for new object
  human2: 0.25, // Adjusted scale for new object
  mushroom: 0.25, // Adjusted scale for new object
  plant1: 0.25,
  plant2: 0.35,
  plant3: 0.35,
  plant4: 0.35,
  plant5: 0.35, // Adjusted scale for new object
  pine: 0.25, // Adjusted scale for new object
  butterfly: 0.25, // Adjusted scale for new object
  bale: 0.5, // Existing scale for bale
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
  tvstation: 8,
  road1: -2,
  road2: 10,
  road3: 10,
  road4: 10,
  road5: -2,
  road6: -2,
  road7: 10
};

const particles = [];

function createParticles(x, y) {
  for (let i = 0; i < 10; i++) {
    particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 4,
      vy: (Math.random() - 0.5) * 4,
      life: 30 + Math.random() * 10,
      alpha: 1
    });
  }
}

function updateParticles() {
  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.life -= 1;
    p.alpha = p.life / 40;
  }
  // Remove dead ones
  for (let i = particles.length - 1; i >= 0; i--) {
    if (particles[i].life <= 0) particles.splice(i, 1);
  }
}

function drawParticles(ctx) {
  for (const p of particles) {
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = "gold";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

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
  // Draw the green border first
  ctx.strokeStyle = 'lightgreen';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo((x - y) * TILE_SIZE / 2, (x + y) * TILE_SIZE / 4 - TILE_SIZE / 4);
  ctx.lineTo((x - y) * TILE_SIZE / 2 + TILE_SIZE / 2, (x + y) * TILE_SIZE / 4);
  ctx.lineTo((x - y) * TILE_SIZE / 2, (x + y) * TILE_SIZE / 4 + TILE_SIZE / 4);
  ctx.lineTo((x - y) * TILE_SIZE / 2 - TILE_SIZE / 2, (x + y) * TILE_SIZE / 4);
  ctx.closePath();
  ctx.stroke();

  const img = imgName ? imageMap[imgName] : null;
  if (img) {
    ctx.imageSmoothingEnabled = false;

    if (imgName === "bale") {
      const scale = 0.5;
      ctx.globalAlpha = heldTile && heldTile.x === x && heldTile.y === y && heldTile.isTransparent ? 0.5 : 1; // Apply transparency
      ctx.drawImage(
        img,
        (x - y) * TILE_SIZE / 2 - (img.width * scale) / 2,
        (x + y) * TILE_SIZE / 4 - (img.height * scale) / 2,
        img.width * scale,
        img.height * scale
      );
      ctx.globalAlpha = 1; // Reset transparency
    } else {
      let scale = buildingScales[imgName] || 0.5;
      const offsetY = buildingOffsets[imgName] || 0;

      if (hoveredBuilding && hoveredBuilding.x === x && hoveredBuilding.y === y) {
        scale *= 1.1; // increase by 10%
      }

      ctx.globalAlpha = heldTile && heldTile.x === x && heldTile.y === y && heldTile.isTransparent ? 0.5 : 1; // Apply transparency
      ctx.drawImage(
        img,
        (x - y) * TILE_SIZE / 2 - (img.width * scale) / 2,
        (x + y) * TILE_SIZE / 4 - (img.height * scale) / 2 + offsetY,
        img.width * scale,
        img.height * scale
      );
      ctx.globalAlpha = 1; // Reset transparency
    }
  }

  // Draw the highlight border if needed
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
    for (let y = -4; y < height + 8; y++) { // Increased buffer for downward tiles
      for (let x = -4; x < width + 4; x++) { // Add buffer to ensure full horizontal coverage
        landData.push({ x, y });
      }
    }
  }

  // Draw ground
  for (let y = -4; y < height + 12; y++) { // Increased buffer for downward tiles
    for (let x = -4; x < width + 6; x++) {
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
    img.onerror = () => {
      console.error(`Image not found: ${path}/${name}.png`);
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
  if (relocationInProgress || heldTile) {
    // Skip showing the popup if relocation or dragging is in progress
    return;
  }

  if (Swal.isVisible()) {
    // Prevent triggering another Swal if one is already open
    return;
  }

  // Check if the click is within the bounds of any building image
  const clickedTile = landData.find(tile => {
    if (!tile.building) return false;

    const img = window.imageMapGlobal[tile.building];
    const scale = buildingScales[tile.building] || 0.5;
    const offsetY = buildingOffsets[tile.building] || 0;
    const screen = isoToScreen(tile.x, tile.y);

    const imgX = screen.x - (img.width * scale) / 2;
    const imgY = screen.y - (img.height * scale) / 2 + offsetY;
    const imgWidth = img.width * scale;
    const imgHeight = img.height * scale;

    return (
      mouseX >= imgX &&
      mouseX <= imgX + imgWidth &&
      mouseY >= imgY &&
      mouseY <= imgY + imgHeight
    );
  });

  if (clickedTile) {
    // Show the menu for the clicked object immediately
    Swal.fire({
      title: `Current: ${clickedTile.building}`,
      html: `
        <img 
          src="assets/isometric/${clickedTile.building}.png" 
          alt="${clickedTile.building}" 
          style="width: 64px; height: 64px; display: block; margin: auto;" 
        />
        <div style="margin-top: 12px;">
          <button id="removeBuildingBtn" class="swal2-confirm swal2-styled" style="margin-right: 10px;">Remove</button>
          <button id="changeBuildingBtn" class="swal2-cancel swal2-styled">Change</button>
        </div>
      `,
      showConfirmButton: false,
      showCancelButton: false,
      didRender: () => {
        // Attach event listeners to the buttons after the Swal is rendered
        document.getElementById('removeBuildingBtn').addEventListener('click', () => {
          removeBuilding(clickedTile.x, clickedTile.y);
        });
        document.getElementById('changeBuildingBtn').addEventListener('click', () => {
          changeBuilding(clickedTile.x, clickedTile.y);
        });
      }
    });
    return; // Exit the function after showing the menu
  }

  // If no object was clicked, handle empty tile or other logic
  const iso = screenToIso(mouseX, mouseY); // Convert screen coordinates to isometric coordinates
  const tile = landData.find(t => t.x === iso.x && t.y === iso.y);

  if (tile && !tile.building) {
    Swal.fire({
      title: 'Choose an item',
      showCancelButton: true,
      html: buildingOptions.map(name => `
        <img 
          src="assets/isometric/${name}.png" 
          alt="${name}" 
          title="${name}" 
          onclick="selectBuilding('${name}', ${tile.x}, ${tile.y})"
        />
      `).join(''),
      customClass: {
        popup: 'swal-custom-popup'
      }
    });
    return; // Exit the function after showing the "Choose an item" menu
  }

  console.error(`No tile found at screen coordinates (${mouseX}, ${mouseY}).`);
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
        style="width: 400px; height: 400px; margin: 20px; cursor: pointer;" 
        onclick="selectBuilding('${name}', ${x}, ${y})"
      />
    `).join(''),
    showConfirmButton: false,
    customClass: {
      popup: 'swal2-fullscreen-popup' // Add a custom class for fullscreen popup
    }
  });
};

// Update the custom style for the fullscreen popup to ensure it works properly on mobile with larger popups
const style = document.createElement('style');
style.innerHTML = `
  .swal2-fullscreen-popup {
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    width: 100% !important;
    height: 100% !important;
    max-width: none !important;
    margin: 0 !important;
    border-radius: 0 !important;
    overflow: hidden !important;
    background-color: white !important;
  }
  .swal2-title {
    font-size: 32px !important; /* Larger title font size */
    text-align: center;
    margin-top: 20px !important;
  }
  .swal2-html-container {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: center;
    gap: 25px; /* Increased spacing between items */
    height: calc(100% - 150px);
    overflow-y: auto;
    padding: 20px;
  }
  .swal2-actions {
    position: absolute;
    bottom: 20px;
    width: 100%;
    display: flex;
    justify-content: center;
  }
  .swal2-popup img {
    max-width: 400px; /* Larger images for better visibility */
    max-height: 400px;
    cursor: pointer;
  }
  @media (max-width: 768px) {
    .swal2-title {
      font-size: 24px !important;
      text-align: center;
    }
    .swal2-popup img {
      max-width: 120px;
      max-height: 120px;
      margin: 8px;
    }
    .swal2-html-container {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
      overflow-y: auto;
      padding: 10px;
      height: calc(100% - 160px);
    }
  }
  .item-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    gap: 12px;
    padding: 12px;
    justify-items: center;
  }
  .item-tile {
    background-color: #f9f9f9;
    border-radius: 12px;
    padding: 10px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
    transition: transform 0.2s ease;
  }
  .item-tile:hover {
    transform: scale(1.05);
  }
  .item-tile img {
    max-width: 64px;
    max-height: 64px;
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

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  adjustCanvasSize(); // Adjust canvas size on initial load

  preloadImages([
   "Tree2", "Tree3", "Tree4", "Tree5", "Tree6", "Tree7", "Tree8", "Tree9",
    "rock", "rock2", "rock3", "rock4","road1","road2","road3","road4","road5","road6","road7","fen","trafficlight","roadlight", "stop","car1","car2","policecar1","policecar2","shop","condo",
    "pond", "deer", "direction", "bbq", "beer", "campchair", "camping",
    "decor1", "deergrass", "grassdecor1", "grassdecor2", "grassdecor3",
    "grassdecor4", "grassdecor5", "grassdecor6", "human1", "human2",
    "mushroom", "plant1", "plant2", "plant3",  "plant4", "plant5", "pine", "butterfly", "pool",
    "house", "hotel", "school", "hospital",
    "policestation", "firestation", "manufacture", "museum",
    "nuclear", "supermarket", "university", "whitehouse", "tvstation"
  ], "assets/isometric", (images) => {
    let hoverTile = null;
    let holdTimer = null;

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
    
      // Draw the held object at the cursor position
      if (heldTile && cursorPosition) {
        // Smooth interpolation
        smoothCursor.x += (cursorPosition.x - smoothCursor.x) * 0.2;
        smoothCursor.y += (cursorPosition.y - smoothCursor.y) * 0.2;
      
        // Convert to isometric coords
        const iso = screenToIso(smoothCursor.x, smoothCursor.y);
        const snapTile = landData.find(t => t.x === iso.x && t.y === iso.y);
      
        let drawX = smoothCursor.x;
        let drawY = smoothCursor.y;
      
        if (snapTile) {
          const screen = isoToScreen(snapTile.x, snapTile.y);
          drawX = screen.x;
          drawY = screen.y;
        }
      
        const img = imageMapGlobal[heldTile.building];
        const scale = buildingScales[heldTile.building] || 0.5;
        const offsetY = buildingOffsets[heldTile.building] || 0;
      
        ctx.globalAlpha = 0.7;
        ctx.drawImage(
          img,
          drawX - (img.width * scale) / 2,
          drawY - (img.height * scale) / 2 + offsetY,
          img.width * scale,
          img.height * scale
        );
        ctx.globalAlpha = 1;
      }
      drawParticles(ctx);
      updateParticles();
    }
    function animate() {
      render();
      requestAnimationFrame(animate); // Continuously update the canvas
    }

    function handleHoldStart(x, y) {
      hasDragged = false; // Reset drag flag
      holdTimer = setTimeout(() => {
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
          heldTile = pos;
          heldTile.isTransparent = true; // Set transparency flag
          cursorPosition = { x, y }; // Initialize cursor position
          smoothCursor = { x, y }; // Initialize to prevent initial jump
          render(); // Re-render to apply transparency
        }
      }, 200); // Delay of 200ms to differentiate between click and hold
    
      dragStart = { x, y };
    }

    function handleHoldEnd() {
      clearTimeout(holdTimer); // Clear the hold timer
      if (heldTile) {
        const iso = screenToIso(cursorPosition.x, cursorPosition.y);
        const targetTile = landData.find(tile => tile.x === iso.x && tile.y === iso.y);
        if (targetTile && !targetTile.building) {
          targetTile.building = heldTile.building;
          delete heldTile.building;
          heldTile.isTransparent = false; // Reset transparency flag
          heldTile = null;
          cursorPosition = null;
          smoothCursor = { x: 0, y: 0 }; // Reset so it doesn't trail after release
          render(); // Re-render to reflect changes
        } else {
          Swal.fire('Invalid Move', 'You can only relocate to an empty tile.', 'warning');
        }
      }
    }

    function handleRelocate(x, y) {
      if (heldTile) {
        const iso = screenToIso(x, y);
        const targetTile = landData.find(tile => tile.x === iso.x && tile.y === iso.y);
        if (targetTile && !targetTile.building) {
          relocationInProgress = true; // Set the flag before relocation
          targetTile.building = heldTile.building;
          const screen = isoToScreen(iso.x, iso.y); // Snap location
          createParticles(screen.x, screen.y); // 💥 spark!
          delete heldTile.building;
          heldTile.isTransparent = false;
          heldTile = null;
          cursorPosition = null;
          render(); // Re-render to reflect changes
          relocationInProgress = false; // Reset the flag after relocation
        } else {
          Swal.fire('Invalid Move', 'You can only relocate to an empty tile.', 'warning');
        }
      }
    }

    canvas.addEventListener("mousemove", (e) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
    
      // Update position first
      cursorPosition = { x: mouseX, y: mouseY };
    
      // Then check if actual drag occurred
      if (heldTile && dragStart) {
        const dx = Math.abs(cursorPosition.x - dragStart.x);
        const dy = Math.abs(cursorPosition.y - dragStart.y);
        if (dx > 5 || dy > 5) {
          hasDragged = true;
        }
      }
    
      if (!heldTile) {
        const { x, y } = screenToIso(mouseX, mouseY);
        hoverTile = { x, y };
      }
    });
    
    canvas.addEventListener("mousedown", (e) => {
      const rect = canvas.getBoundingClientRect();
      hasDragged = false;
      handleHoldStart(e.clientX - rect.left, e.clientY - rect.top);
    }, { passive: true }); // Mark as passive

    canvas.addEventListener("mouseup", () => {
      handleHoldEnd();
    }, { passive: true });
    
    canvas.addEventListener("click", (e) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
    
      if (heldTile) {
        if (hasDragged) {
          handleRelocate(mouseX, mouseY);
        } else {
          // Do nothing on click; allow menu only on normal tile click
        }
        return;
      }
    
      handleTileClick(mouseX, mouseY); // Handle tile click to place or modify buildings
    }, { passive: true });

    // Optimize touch event listeners
    canvas.addEventListener("touchstart", (e) => {
      const rect = canvas.getBoundingClientRect();
      const touch = e.touches[0];
      handleHoldStart(touch.clientX - rect.left, touch.clientY - rect.top);
    }, { passive: true }); // Mark as passive

    canvas.addEventListener("touchend", (e) => {
      const rect = canvas.getBoundingClientRect();
      const touch = e.changedTouches[0];
      const mouseX = touch.clientX - rect.left;
      const mouseY = touch.clientY - rect.top;
    
      if (heldTile) {
        if (hasDragged) {
          handleRelocate(mouseX, mouseY);
        } else {
          handleTileClick(mouseX, mouseY);
        }
      }
    
      handleHoldEnd();
    }, { passive: true });

    canvas.addEventListener("touchmove", (e) => {
      const rect = canvas.getBoundingClientRect();
      const touch = e.touches[0];
      const mouseX = touch.clientX - rect.left;
      const mouseY = touch.clientY - rect.top;
    
      cursorPosition = { x: mouseX, y: mouseY };
    
      if (!heldTile) {
        const { x, y } = screenToIso(mouseX, mouseY);
        hoverTile = { x, y };
      }
    }, { passive: true });

    canvas.addEventListener("touchend", (e) => {
      const rect = canvas.getBoundingClientRect();
      const touch = e.changedTouches[0];
      if (heldTile) {
        handleRelocate(touch.clientX - rect.left, touch.clientY - rect.top);
      }
    }, { passive: true }); // Mark as passive

    animate(); // Start the animation loop
  }); // end of preloadImages callback
}); // end of DOMContentLoaded event



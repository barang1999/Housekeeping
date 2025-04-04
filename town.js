const TILE_SIZE = 64;
const gridWidth = 40; // Increased grid width
const gridHeight = 40; // Increased grid height
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
  house: 0.6,
  hotel: 0.5,
  school: 0.5,
  hospital: 0.5,
  policestation: 0.5,
  firestation: 0.5,
  manufacture: 0.45,
  museum: 0.5,
  nuclear: 0.45,
  supermarket: 0.5,
  university: 0.5,
  whitehouse: 0.5,
  tvstation: 0.48,
  tree: 0.17, // Reduced scale
  Tree2: 0.17, // Reduced scale
  Tree3: 0.17, // Reduced scale
  Tree4: 0.17, // Reduced scale
  Tree5: 0.17, // Reduced scale
  rock: 0.17, // Reduced scale
  rock2: 0.17, // Reduced scale
  rock3: 0.17, // Reduced scale
  rock4: 0.17, // Reduced scale
  deer: 0.17, // Reduced scale
  direction: 0.17, // Reduced scale
  pond: 0.17 // Reduced scale
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
  const width = gridWidth; // Use updated grid width
  const height = gridHeight; // Use updated grid height
  if (landData.length === 0) {
    // Draw ground
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const highlight =
          hoverTile &&
          hoverTile.x === x &&
          hoverTile.y === y &&
          hoverTile.x >= 0 && hoverTile.x < width &&
          hoverTile.y >= 0 && hoverTile.y < height;

        if (highlight) {
          drawTile(ctx, x, y, null, {}, true); // draw only highlight with no image
        }

        if (!landData.find(tile => tile.x === x && tile.y === y)) {
          landData.push({ x, y });
        }
      }
    }
  }

  // Add static objects (trees, rocks, pond, etc.) to renderQueue for proper depth sorting
  const staticObjects = [
    { x: 2, y: 3, type: "tree" },
    { x: 4, y: 2, type: "Tree2" },
    { x: 3, y: 4, type: "Tree3" },
    { x: 8, y: 6, type: "Tree4" },
    { x: 9, y: 3, type: "Tree5" },
    { x: 10, y: 4, type: "rock" },
    { x: 11, y: 5, type: "rock2" },
    //{ x: 12, y: 2, type: "rock3" },
   // { x: 13, y: 6, type: "rock4" },
    { x: 14, y: 7, type: "deer" },
    //{ x: 15, y: 4, type: "direction" },
    //{ x: 17, y: 6, type: "pond" }, // Include pond
    { x: 6, y: 9, type: "pine" }
  ];

  const renderQueue = [...landData.map(tile => ({ ...tile, isBuilding: true })), ...staticObjects];

  // Sort renderQueue by y-coordinate and prioritize buildings over static objects
  renderQueue.sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y; // Sort by y-coordinate
    if (a.isBuilding && !b.isBuilding) return 1; // Buildings render after static objects on the same tile
    if (!a.isBuilding && b.isBuilding) return -1; // Static objects render before buildings on the same tile
    return a.x - b.x; // Tiebreaker: sort by x-coordinate
  });

  // Render all objects in sorted order
  for (const obj of renderQueue) {
    if (obj.isBuilding) {
      drawTile(ctx, obj.x, obj.y, obj.building, imageMap);
    } else if (obj.type) {
      drawTile(ctx, obj.x, obj.y, obj.type, imageMap);
    }
  }

  // Render hover highlight
  for (const pos of landData) {
    if (hoveredBuilding && hoveredBuilding.x === pos.x && hoveredBuilding.y === pos.y) {
      ctx.strokeStyle = 'rgba(255, 255, 0, 0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      const screenX = (pos.x - pos.y) * TILE_SIZE / 2;
      const screenY = (pos.x + pos.y) * TILE_SIZE / 4;
      ctx.moveTo(screenX, screenY - TILE_SIZE / 2);
      ctx.lineTo(screenX + TILE_SIZE / 2, screenY);
      ctx.lineTo(screenX, screenY + TILE_SIZE / 2);
      ctx.lineTo(screenX - TILE_SIZE / 2, screenY);
      ctx.closePath();
      ctx.stroke();
    }
  }
}

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
    pos.building = name;
    document.querySelector('.swal2-container')?.remove(); // Close the modal
    const canvas = document.getElementById("gameCanvas");
    const ctx = canvas.getContext("2d");
    drawEmptyLand(ctx, imageMapGlobal, { x, y }); // show highlight
    setTimeout(() => {
      drawEmptyLand(ctx, imageMapGlobal, null); // remove highlight after short delay
    }, 200);
  }
}
window.selectBuilding = selectBuilding;

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
        style="width: 64px; height: 64px; margin: 4px; cursor: pointer;" 
        onclick="selectBuilding('${name}', ${x}, ${y})"
      />
    `).join(''),
    showConfirmButton: false
  });
};

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

      const pos = [...landData].reverse().find(tile => {
        if (!tile.building) return false;
        const img = imageMapGlobal[tile.building];
        const scale = buildingScales[tile.building] || 0.5;
        const offsetY = buildingOffsets[tile.building] || 0;
        const screen = isoToScreen(tile.x, tile.y);
        const dx = mouseX - (screen.x - (img.width * scale) / 2);
        const dy = mouseY - (screen.y - (img.height * scale) / 2 + offsetY);
        return dx >= 0 && dx <= img.width * scale && dy >= 0 && dy <= img.height * scale;
      });

      let finalTile = pos;
      if (!finalTile) {
        const iso = screenToIso(mouseX, mouseY);
        finalTile = landData.find(tile => tile.x === iso.x && tile.y === iso.y);
      }
      if (!finalTile) return;

      if (finalTile.building) {
        Swal.fire({
          title: `Current: ${finalTile.building}`,
          html: `
            <img 
              src="assets/isometric/${finalTile.building}.png" 
              alt="${finalTile.building}" 
              style="width: 64px; height: 64px; display: block; margin: auto;" 
            />
            <div style="margin-top: 12px;">
              <button onclick="removeBuilding(${finalTile.x}, ${finalTile.y})" class="swal2-confirm swal2-styled" style="margin-right: 10px;">Remove</button>
              <button onclick="changeBuilding(${finalTile.x}, ${finalTile.y})" class="swal2-cancel swal2-styled">Change</button>
            </div>
          `,
          showConfirmButton: false,
          showCancelButton: false
        });
      } else {
        Swal.fire({
          title: 'Choose an item',
          showCancelButton: true,
          html: buildingOptions.map(name => `
            <img 
              src="assets/isometric/${name}.png" 
              alt="${name}" 
              title="${name}" 
              style="width: 64px; height: 64px; margin: 4px; cursor: pointer;" 
              onclick="selectBuilding('${name}', ${finalTile.x}, ${finalTile.y})"
            />
          `).join(''),
          showConfirmButton: false
        });
      }
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

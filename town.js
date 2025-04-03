// Eightfold Town – Empty Land Setup

const TILE_SIZE = 64;
const gridOffsetX = 400;
const gridOffsetY = 100;

function isoToScreen(x, y) {
  return {
    x: (x - y) * TILE_SIZE / 2 + gridOffsetX,
    y: (x + y) * TILE_SIZE / 4 + gridOffsetY
  };
}

function drawTile(ctx, x, y, imgName, imageMap) {
  const screen = isoToScreen(x, y);
  const img = imageMap[imgName];
  if (img) ctx.drawImage(img, screen.x, screen.y);
  else console.warn("Missing image:", imgName);
}

// Random natural scenery on an empty land
function drawEmptyLand(ctx, imageMap) {
  const width = 10;
  const height = 10;

  // Draw grass tiles
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      drawTile(ctx, x, y, "tile", imageMap);
    }
  }

  // Trees
  drawTile(ctx, 2, 3, "tree", imageMap);
  drawTile(ctx, 6, 1, "tree", imageMap);

  // Rocks
  //drawTile(ctx, 4, 5, "rock", imageMap);
  //drawTile(ctx, 7, 2, "rock", imageMap);

  // Hay Bales
  drawTile(ctx, 1, 6, "bale", imageMap);
  drawTile(ctx, 5, 7, "bale", imageMap);

  // Small river (just a few tiles for now)
  //drawTile(ctx, 3, 0, "river", imageMap);
  //drawTile(ctx, 3, 1, "river", imageMap);
  //drawTile(ctx, 3, 2, "river", imageMap);
}

function preloadImages(names, path, callback) {
  const images = {};
  let loaded = 0;
  for (const name of names) {
    const img = new Image();
    img.onload = () => {
      loaded++;
      if (loaded === names.length) callback(images);
    };
    img.src = `${path}/${name}.png`;
    images[name] = img;
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  preloadImages([
    "dirtTiles_E",    // <- Add this image soon
    "tree",    // e.g., tree-park-large.png
    "bale"     // e.g., barrelsStacked_S.png
    // "rock", "river" ← skip for now
  ], "assets/isometric", (images) => {
    drawEmptyLand(ctx, images);
  });
});

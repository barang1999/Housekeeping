const config = {
  type: Phaser.AUTO,
  width: 640,
  height: 640,
  backgroundColor: "#c2f0c2",
  scene: {
    preload,
    create,
  }
};

const game = new Phaser.Game(config);

function preload() {
  // In the future: load assets like tiles/buildings here
}

function create() {
  const tileSize = 64;
  const cols = 10;
  const rows = 10;

  // Draw grid
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      this.add.rectangle(x * tileSize + tileSize/2, y * tileSize + tileSize/2, tileSize, tileSize, 0xffffff).setStrokeStyle(1, 0xcccccc);
    }
  }

  this.add.text(20, 20, "🏡 Welcome to Eightfold Town", {
    font: "20px Arial",
    fill: "#333",
  });
}

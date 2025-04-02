
const config = {
  type: Phaser.AUTO,
  width: 960,
  height: 640,
  parent: 'game-container',
  scene: {
    preload,
    create
  }
};

const game = new Phaser.Game(config);

function preload() {
  this.load.image('tile', 'assets/tile.png');
  this.load.image('tree', 'assets/tree.png');
}

function create() {
  const tileWidth = 64;
  const tileHeight = 32;
  const mapWidth = 10;
  const mapHeight = 10;

  for (let x = 0; x < mapWidth; x++) {
    for (let y = 0; y < mapHeight; y++) {
      const screenX = (x - y) * tileWidth / 2 + 480;
      const screenY = (x + y) * tileHeight / 2 + 50;
      this.add.image(screenX, screenY, 'tile');

      // Example: place house on tile (2, 2), tree on (4, 4)
      if (x === 2 && y === 2) {
        this.add.image(screenX, screenY - 20, 'house');
      } else if (x === 4 && y === 4) {
        this.add.image(screenX, screenY - 20, 'tree');
      }
    }
  }
}

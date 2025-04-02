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
    }
  }
}

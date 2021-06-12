const path = require('path')
const fs = require('fs').promises
const { builder, Build } = require('mineflayer-builder')
const { Schematic } = require('prismarine-schematic')
const { pathfinder } = require('../mineflayer-pathfinder')
const mineflayer = require('mineflayer')
const mineflayerViewer = require('prismarine-viewer').mineflayer

let schematic

const bot = mineflayer.createBot({
  host: process.argv[2] || 'localhost',
  port: parseInt(process.argv[3]) || 25565,
  username: process.argv[4] || 'builder',
  password: process.argv[5]
})

bot.loadPlugin(pathfinder)
bot.loadPlugin(builder)

function wait (ms) { return new Promise(resolve => setTimeout(resolve, ms)) }

bot.once('spawn', async () => {
  mineflayerViewer(bot, { port: 3000 })

  bot.on('path_update', (r) => {
    const path = [bot.entity.position.offset(0, 0.5, 0)]
    for (const node of r.path) {
      path.push({ x: node.x, y: node.y + 0.5, z: node.z })
    }
    bot.viewer.drawLine('path', path, 0xff00ff)
  })

  schematic = await Schematic.read(await fs.readFile(path.resolve(__dirname, '../schematics/smallhouse1.schem')), bot.version)
  while (!bot.entity.onGround) {
    await wait(100)
  }
  bot.on('messagestr', (message, messagePosition, jsonMsg) => {
    if (message.includes('start')) {
      start()
    }
  })
  bot.on('chat', async (username, message) => {
    console.info(username, message)
    if (message === 'start') {
      start()
    }
  })
})

async function start () {
  bot.chat('/clear')
  await sleep(1000)
  bot.chat('/give builder dirt')
  await sleep(1000)
  bot.chat('/fill 187 4 122 209 30 101 air')
  await sleep(1000)
  bot.chat('/tp 197 4 121')
  await sleep(1000)
  const at = bot.entity.position.floored()
  console.log('Building at ', at)
  const build = new Build(schematic, bot.world, at)
  bot.builder.build(build)
}

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

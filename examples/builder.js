const path = require('path')
const fs = require('fs').promises
const { builder, Build } = require('mineflayer-builder')
const { Schematic } = require('prismarine-schematic')
const { pathfinder } = require('mineflayer-pathfinder')
const mineflayer = require('mineflayer')
const mineflayerViewer = require('prismarine-viewer').mineflayer

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

  while (!bot.entity.onGround) {
    await wait(100)
  }

  bot.on('chat', async (username, message) => {
    if (message.startsWith('build')) {
      let [, schematicName] = message.split(' ')
      if (!schematicName) schematicName = 'smallhouse1.schem'
      buildSchematic(schematicName)
    } else if (message === 'stop') {
      bot.builder.stop()
    } else if (message === 'pause') {
      bot.builder.pause()
    } else if (message === 'continue') {
      bot.builder.continue()
    }
  })

  bot.on('builder:missing_blocks', async item => {
    console.info('Missing', item)
    if (bot.inventory.emptySlotCount() === 0) {
      bot.chat('/clear')
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    bot.chat('Missing ' + item?.displayName)
    bot.chat(`/give ${bot.username} ${item.name} 64`)
    await new Promise((resolve) => setTimeout(resolve, 500))
    bot.builder.continue()
  })

  bot.on('builder:no_actions_left', () => {
    bot.chat('No more actions left may be finished or not')
  })
})

async function buildSchematic (name) {
  const schematicName = !name.endsWith('.schem') ? name + '.schem' : name
  const filePath = path.resolve(__dirname, '../schematics/' + schematicName)
  if (!fileExists(filePath)) {
    bot.chat(`File ${schematicName} not found`)
    return
  }
  const schematic = await Schematic.read(await fs.readFile(filePath), bot.version)
  const at = bot.entity.position.floored()
  at.offset(-1, 0, -1)
  bot.chat('Building at ' + at)
  const build = new Build(schematic, bot.world, at)
  bot.builder.build(build)
}

async function fileExists (path) {
  try {
    await fs.promises.access(path)
    return true
  } catch {
    return false
  }
}

const { builder } = require('mineflayer-builder')
const { pathfinder } = require('mineflayer-pathfinder')
const mineflayer = require('mineflayer')
const { Vec3 } = require('vec3')
const assert = require('assert')

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
  while (!bot.entity.onGround) {
    await wait(100)
  }
  const at = bot.entity.position.floored()
  console.log('Building at ', at)

  const facingData = {}

  const mcData = require('minecraft-data')(bot.version)
  for (const [name, block] of Object.entries(mcData.blocksByName)) {
    const facing = block.states.find(x => x.name === 'facing')
    if (facing) {
      const wall = name.includes('wall') || name === 'ladder' || name === 'tripwire_hook'
      const itemName = wall ? name.replace('wall_', '') : name
      // console.log('Placing', name, JSON.stringify(facing))
      if (!mcData.itemsByName[itemName]) {
        console.log('Cant place :', name)
        continue
      }
      if (wall) {
        await bot.builder.equipItem(mcData.itemsByName.dirt.id)
        await bot.placeBlock(bot.blockAt(at.offset(0, -1, 4)), new Vec3(0, 1, 0))
      }
      await bot.builder.equipItem(mcData.itemsByName[itemName].id)
      // try {

      if (wall) await bot.placeBlock(bot.blockAt(at.offset(0, 0, 4)), new Vec3(0, 0, -1))
      else await bot.placeBlock(bot.blockAt(at.offset(0, -1, 3)), new Vec3(0, 1, 0))
      const result = bot.blockAt(at.offset(0, 0, 3))
      console.log(name, result.getProperties().facing, facing.num_values)
      await bot.dig(result)

      if (wall) await bot.dig(bot.blockAt(at.offset(0, 0, 4)))

      const face = result.getProperties().facing
      if (wall) {
        assert.ok(['north', 'south'].includes(face))
        facingData[name] = {
          is3D: facing.num_values > 4,
          faceDirection: true,
          inverted: face === 'south'
        }
      } else {
        if (['up', 'down'].includes(face)) {
          facingData[name] = {
            is3D: facing.num_values > 4,
            faceDirection: true,
            inverted: face === 'down'
          }
        } else {
          facingData[name] = {
            is3D: facing.num_values > 4,
            faceDirection: result.name.includes('trapdoor'),
            inverted: face === 'south'
          }
        }
      }

      /* } catch (e){
        console.log(name, 'cant be placed on floor', facing.num_values)
      } */
      await wait(50)
    }
  }

  console.log(JSON.stringify(facingData, null, 2))

  bot.end()
})

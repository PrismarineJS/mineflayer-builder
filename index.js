const { goals, Movements } = require('mineflayer-pathfinder')

const interactable = require('./lib/interactable.json')

function wait (ms) { return new Promise(resolve => setTimeout(resolve, ms)) }

function inject (bot) {
  if (!bot.pathfinder) {
    throw new Error('pathfinder must be loaded before builder')
  }

  let interruptBuilding = false

  const mcData = require('minecraft-data')(bot.version)
  const Item = require('prismarine-item')(bot.version)

  const movements = new Movements(bot, mcData)
  // movements.canDig = false
  movements.digCost = 10
  movements.maxDropDown = 3
  bot.pathfinder.searchRadius = 10

  bot.builder = {}

  bot.builder.currentBuild = null

  async function equipCreative (id) {
    if (bot.inventory.items().length > 30) {
      bot.chat('/clear')
      await wait(1000)
      const slot = bot.inventory.firstEmptyInventorySlot()
      await bot.creative.setInventorySlot(slot !== null ? slot : 36, new Item(mcData.itemsByName.dirt.id, 1))
    }
    if (!bot.inventory.items().find(x => x.type === id)) {
      const slot = bot.inventory.firstEmptyInventorySlot()
      await bot.creative.setInventorySlot(slot !== null ? slot : 36, new Item(id, 1))
    }
    const item = bot.inventory.items().find(x => x.type === id)
    await bot.equip(item, 'hand')
  }

  async function equipItem (id) {
    if (bot.heldItem?.type === id) return
    const item = bot.inventory.findInventoryItem(id, null)
    if (!item) {
      throw Error('no_blocks')
    }
    await bot.equip(item.type, 'hand')
  }

  async function materialCallback (item, noMaterialCallback) {
    if (noMaterialCallback && typeof noMaterialCallback === 'function') {
      const p = new Promise((resolve, reject) => {
        try {
          noMaterialCallback(item, (data) => {
            resolve(data)
          }, (error) => {
            reject(error)
          })
        } catch (e) {
          reject(e)
        }
      })
      try {
        await p
      } catch (e) {
        throw new Error(item.name)
      }
    }
    throw new Error(item.name)
  }

  bot.builder.equipItem = equipItem

  bot.builder.stop = function () {
    console.log('Stopped building')
    interruptBuilding = true
    bot.builder.currentBuild = null
    bot.pathfinder.setGoal(null)
  }

  bot.builder.pause = function () {
    console.log('Paused building')
    interruptBuilding = true
    bot.pathfinder.setGoal(null)
  }

  bot.builder.continue = () => {
    if (!bot.builder.currentBuild) return console.log('Nothing to continue building')
    bot.builder.build(bot.builder.currentBuild)
  }

  // /fill ~-20 ~ ~-20 ~20 ~10 ~20 minecraft:air

  bot.builder.build = async (build, noMaterialCallback, placementOptions = {}) => {
    let errorNoBlocks
    bot.builder.currentBuild = build

    const placementRange = placementOptions.range || 3
    const placementLOS = 'LOS' in placementOptions ? placementOptions.LOS : true

    interruptBuilding = false

    while (build.actions.length > 0) {
      if (interruptBuilding) {
        interruptBuilding = false
        return
      }
      const actions = build.getAvailableActions()
      console.log(`${actions.length} available actions`)
      if (actions.length === 0) {
        console.log('No actions to perform')
        break
      }
      actions.sort((a, b) => {
        let dA = a.pos.offset(0.5, 0.5, 0.5).distanceSquared(bot.entity.position)
        dA += (a.pos.y - bot.entity.position.y) * 100
        let dB = b.pos.offset(0.5, 0.5, 0.5).distanceSquared(bot.entity.position)
        dB += (b.pos.y - bot.entity.position.y) * 100
        return dA - dB
      })
      const action = actions[0]
      console.log('action', action)

      try {
        if (action.type === 'place') {
          const item = build.getItemForState(action.state)
          console.log('Selecting ' + item.displayName)

          const properties = build.properties[action.state]
          const half = properties.half ? properties.half : properties.type

          const faces = build.getPossibleDirections(action.state, action.pos)
          for (const face of faces) {
            const block = bot.blockAt(action.pos.plus(face))
            console.log(face, action.pos.plus(face), block.name)
          }

          const { facing, is3D } = build.getFacing(action.state, properties.facing)
          const goal = new goals.GoalPlaceBlock(action.pos, bot.world, {
            faces,
            facing: facing,
            facing3D: is3D,
            half,
            range: placementRange,
            LOS: placementLOS
          })
          if (!goal.isEnd(bot.entity.position.floored())) {
            console.log('pathfinding')
            bot.pathfinder.setMovements(movements)
            await bot.pathfinder.goto(goal)
            console.log('finished pathing')
          }

          try {
            await equipItem(item.id) // equip item after pathfinder
          } catch (e) {
            if (e.message === 'no_blocks') {
              try {
                await materialCallback(item, noMaterialCallback)
              } catch (e) {
                console.info('Throwing error no material')
                throw Error('cancel')
              }
              continue
            }
            throw e
          }

          // TODO: const faceAndRef = goal.getFaceAndRef(bot.entity.position.offset(0, 1.6, 0))
          const faceAndRef = goal.getFaceAndRef(bot.entity.position.floored().offset(0.5, 1.6, 0.5))
          if (!faceAndRef) { throw new Error('no face and ref') }

          bot.lookAt(faceAndRef.to, true)

          const refBlock = bot.blockAt(faceAndRef.ref)
          const sneak = interactable.indexOf(refBlock.name) > 0
          const delta = faceAndRef.to.minus(faceAndRef.ref)
          if (sneak) bot.setControlState('sneak', true)
          await bot._placeBlockWithOptions(refBlock, faceAndRef.face.scaled(-1), { half, delta })
          if (sneak) bot.setControlState('sneak', false)

          // const block = bot.world.getBlock(action.pos)
          const worldState = bot.world.getBlockStateId(action.pos)
          // Does not work for 1.12 as blocks dont have the stateId property
          if (worldState !== action.state) {
            console.log('expected', properties)
            console.log('got', worldState)
          }
          build.removeAction(action)
        } else if (action.type === 'dig') {
          await bot.pathfinder.goto(goals.Goal)
          build.removeAction(action)
        } else {
          build.removeAction(action)
        }
      } catch (e) {
        if (e?.name === 'NoPath') {
          console.info('Skipping unreachable action', action)
        } else if (e && (e.name === 'cancel' || e.message === 'cancel')) {
          console.info('Canceling build no materials')
          break
        } else if (e?.message.startsWith('No block has been placed')) {
          console.info('Block placement failed')
          console.error(e)
          continue
        } else {
          console.log(e?.name, e)
        }
        build.removeAction(action)
      }
    }

    if (errorNoBlocks) {
      const message = 'Failed to build no blocks left ' + errorNoBlocks
      bot.chat(message)
      bot.emit('builder_cancel', message)
    } else {
      bot.chat('Finished building')
      setTimeout(() => {
        bot.emit('builder_finished')
      }, 0)
    }
    bot.builder.currentBuild = null
  }
}

module.exports = {
  Build: require('./lib/Build'),
  builder: inject
}

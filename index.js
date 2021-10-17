const { goals, Movements } = require('mineflayer-pathfinder')
const wait = require('util').promisify(setTimeout)

function awaitWithTimeout(func, ms, message) {
  return new Promise((resolve, reject) => {
    let timer = setTimeout(() => {
      cleanup()
      reject(message ? message : 'timeout')
    }, ms)
    let timerCleared = false
    const cleanup = () => {
      timerCleared = true
      clearInterval(timer)
    }
    func
      .then((arg) => {
        if (timerCleared) {
          console.info('Functon', func, 'resolved after timeout')
          return
        }
        cleanup()
        resolve(arg)
      })
      .catch((error) => {
        cleanup()
        reject(message ? message : error)
      })
  })
  
}

const interactable = require('./lib/interactable.json')

// function wait (ms) { return new Promise(resolve => setTimeout(resolve, ms)) }

/**
 * @typedef builder
 * @property {builderProperties} builder
 */

/**
 * @typedef builderProperties
 * @property {any} currentBuild
 * @property {function} equipItem
 */

/**
 * @typedef pathfinder
 * @property {import('mineflayer-pathfinder').Pathfinder} pathfinder
 */

/**
 * 
 * @param {import('mineflayer').Bot & builder & pathfinder} bot 
 */
function inject (bot) {
  if (!bot.pathfinder) {
    throw new Error('pathfinder must be loaded before builder')
  }

  let interruptBuilding = false

  const mcData = require('minecraft-data')(bot.version)
  // const Item = require('prismarine-item')(bot.version)

  const movements = new Movements(bot, mcData)
  // movements.canDig = false
  movements.digCost = 10
  movements.maxDropDown = 3
  bot.pathfinder.searchRadius = 10

  bot.builder = {}

  bot.builder.currentBuild = null

  // async function equipCreative (id) {
  //   if (bot.inventory.items().length > 30) {
  //     bot.chat('/clear')
  //     await wait(1000)
  //     const slot = bot.inventory.firstEmptyInventorySlot()
  //     await bot.creative.setInventorySlot(slot !== null ? slot : 36, new Item(mcData.itemsByName.dirt.id, 1))
  //   }
  //   if (!bot.inventory.items().find(x => x.type === id)) {
  //     const slot = bot.inventory.firstEmptyInventorySlot()
  //     await bot.creative.setInventorySlot(slot !== null ? slot : 36, new Item(id, 1))
  //   }
  //   const item = bot.inventory.items().find(x => x.type === id)
  //   await bot.equip(item, 'hand')
  // }

  async function equipItem (id) {
    if (bot.heldItem?.type === id) return
    const item = bot.inventory.findInventoryItem(id, null)
    if (!item) {
      throw Error('no_blocks')
    }
    await bot.equip(item.type, 'hand')
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
    bot.builder.currentBuild.updateActions()
    bot.builder.build(bot.builder.currentBuild)
  }

  const defaultSort = (a, b, bot) => {
    // Build in layers
    if (a.pos.y !== b.pos.y) {
      return a.pos.y > b.pos.y ? 1 : -1
    } else {
      const p = bot.entity.position.offset(-0.5, 0, -0.5)
      return p.distanceTo(a.pos) > p.distanceTo(b.pos) ? 1 : -1
    }
  }

  // /fill ~-20 ~ ~-20 ~20 ~10 ~20 minecraft:air

  /**
   * 
   * @param {import('./lib/Build')} build 
   * @param {{range?: number, LOS?: boolean, materialMin?: number, buildOrderSort?: function}} options 
   * @returns 
   */
  bot.builder.build = async (build, options = {}) => {
    bot.builder.currentBuild = build
    const mcData = require('minecraft-data')(bot.version)

    const replaceable = new Set()
    replaceable.add(mcData.blocksByName.air.id)
    if (mcData.blocksByName.cave_air) replaceable.add(mcData.blocksByName.cave_air.id)
    if (mcData.blocksByName.void_air) replaceable.add(mcData.blocksByName.void_air.id)

    const placementRange = options.range || 3
    const placementLOS = 'LOS' in options ? options.LOS : true
    const materialMin = options.materialMin || 0
    const buildOrderSort = options.buildOrderSort || defaultSort

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
      actions.sort((a, b) => buildOrderSort(a, b, bot))
      const action = actions[0]
      console.log('action', action)

      try {
        if (action.type === 'place') {
          const item = build.getItemForState(action.state)
          if (!item) {
            console.warn('No item found for action', action)
            console.info(build.schematic.getBlock(action.pos.minus(build.at)))
            build.removeAction(action)
            continue
          }
          console.log('Selecting ' + item?.displayName)

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
            await awaitWithTimeout(bot.pathfinder.goto(goal), 1000 * bot.entity.position.distanceTo(action.pos), 'pathfinder_timeout')
            // await Promise.race([bot.pathfinder.goto(goal), timeout(1000 * bot.entity.position.distanceTo(action.pos), 'pathfinder_timeout')])
            console.log('finished pathing')
          }

          try {
            const amount = bot.inventory.count(item.id)
            if (amount <= materialMin) {
              console.info('Missing blocks', item)
              bot.builder.pause()
              bot.emit('builder:missing_blocks', item)
              return
            }
            await awaitWithTimeout(equipItem(item.id), 2000, 'equip_timeout')
            // await Promise.race([equipItem(item.id), timeout(2000, 'equip_timeout')])
            // await equipItem(item.id) // equip item after pathfinder
          } catch (e) {
            if (e?.message === 'equip_timeout') throw e
            console.warn('Equipping error', e)
            throw Error('cancel')
          }

          // TODO: const faceAndRef = goal.getFaceAndRef(bot.entity.position.offset(0, 1.6, 0))
          const faceAndRef = goal.getFaceAndRef(bot.entity.position.floored().offset(0.5, 1.6, 0.5))
          if (!faceAndRef) { throw new Error('no face and ref') }

          bot.lookAt(faceAndRef.to, true)

          const refBlock = bot.blockAt(faceAndRef.ref)
          const sneak = interactable.indexOf(refBlock.name) > 0
          const delta = faceAndRef.to.minus(faceAndRef.ref)
          if (sneak) bot.setControlState('sneak', true)
          await awaitWithTimeout(bot._placeBlockWithOptions(refBlock, faceAndRef.face.scaled(-1), { half, delta }), 5000, 'place_timeout')
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
          const wantBlock = mcData.blocksByStateId[action.state]
          const isBlock = bot.blockAt(action.pos)
          if (!replaceable.has(isBlock) && isBlock?.name !== wantBlock?.name) {
            const goal = new goals.GoalBreakBlock(action.pos.x, action.pos.y, action.pos.z, bot)
            await awaitWithTimeout(bot.pathfinder.goto(goal), 1000 * bot.entity.position.distanceTo(action.pos), 'goal_break_timeout')
          }
          await awaitWithTimeout(bot.dig(bot.blockAt(action.pos), true, 'raycast'), 10000, 'dig_timeout')
          build.removeAction(action)
        } else {
          build.removeAction(action)
        }
      } catch (e) {
        if (e?.name === 'NoPath') {
          console.info('Skipping unreachable action', action)
        } else if (e?.name === 'cancel' || e?.message === 'cancel') {
          console.info('Canceling build error', e)
          break
        } else if (e?.message?.startsWith('No block has been placed')) {
          console.info('Block placement failed')
          console.error(e)
          continue
        } else if (e?.message === 'GoalChanged') {
          console.info('Goal changed error')
          return
        } else if (e?.message === 'pathfinder_timeout') {
          bot.pathfinder.setGoal(null)
          console.warn('Pathfinder timed out')
          await wait(100)
        } else {
          console.log('Unknown error', e)
        }
        build.removeAction(action)
      }
    }
    bot.emit('builder:no_actions_left')
    bot.builder.currentBuild = null
  }
}

module.exports = {
  Build: require('./lib/Build'),
  builder: inject
}

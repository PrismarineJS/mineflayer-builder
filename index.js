const { goals, Movements } = require('../mineflayer-pathfinder')

const interactable = require('./lib/interactable.json')

function inject (bot) {
  if (!bot.pathfinder) {
    throw new Error('pathfinder must be loaded before builder')
  }

  const mcData = require('minecraft-data')(bot.version)
  const Item = require('prismarine-item')(bot.version)

  const movements = new Movements(bot, mcData)
  movements.canDig = false
  movements.maxDropDown = 256

  bot.builder = {}

  async function equipItem (id) {
    if (!bot.inventory.items().find(x => x.type === id)) {
      const slot = bot.inventory.firstEmptyInventorySlot()
      await bot.creative.setInventorySlot(slot !== null ? slot : 36, new Item(id, 1))
    }
    const item = bot.inventory.items().find(x => x.type === id)
    await bot.equip(item, 'hand')
  }

  bot.builder.equipItem = equipItem

  // /fill ~-20 ~ ~-20 ~20 ~10 ~20 minecraft:air

  bot.builder.build = async (build) => {
    while (build.actions.length > 0) {
      const actions = build.getAvailableActions()
      console.log(`${actions.length} available actions`)
      if (actions.length === 0) {
        console.log('No actions to perform')
        break
      }
      actions.sort((a, b) => {
        const dA = a.pos.offset(0.5, 0.5, 0.5).distanceSquared(bot.entity.position)
        const dB = b.pos.offset(0.5, 0.5, 0.5).distanceSquared(bot.entity.position)
        return dA - dB
      })
      const action = actions[0]
      console.log('action', action)

      try {
        if (action.type === 'place') {
          const item = build.getItemForState(action.state)
          console.log('Selecting ' + item.displayName)
          await equipItem(item.id)

          const properties = build.properties[action.state]

          const faces = build.getPossibleDirections(action.state, action.pos)
          for (const face of faces) {
            const block = bot.blockAt(action.pos.plus(face))
            console.log(face, action.pos.plus(face), block.name)
          }

          const { facing, is3D } = build.getFacing(action.state, properties.facing)
          const goal = new goals.GoalPlaceBlock(action.pos, bot.world, {
            faces,
            facing: facing,
            facing3D: is3D
          })
          if (!goal.isEnd(bot.entity.position.floored())) {
            console.log('pathfinding')
            bot.pathfinder.setMovements(movements)
            await bot.pathfinder.goto(goal)
          }

          // TODO: const faceAndRef = goal.getFaceAndRef(bot.entity.position.offset(0, 1.6, 0))
          const faceAndRef = goal.getFaceAndRef(bot.entity.position.floored().offset(0.5, 1.6, 0.5))
          if (!faceAndRef) { throw new Error('no face and ref') }

          bot.lookAt(faceAndRef.to, true)

          const refBlock = bot.blockAt(faceAndRef.ref)
          const sneak = interactable.indexOf(refBlock.name) > 0
          if (sneak) bot.setControlState('sneak', true)
          await bot._placeBlockWithOptions(refBlock, faceAndRef.face.scaled(-1), { half: properties.half ? properties.half : properties.type })
          if (sneak) bot.setControlState('sneak', false)

          const block = bot.world.getBlock(action.pos)
          if (block.stateId !== action.state) {
            console.log('expected', properties)
            console.log('got', block.getProperties())
          }
        }
      } catch (e) {
        console.log(e)
      }

      build.removeAction(action)
    }
  }
}

module.exports = {
  Build: require('./lib/Build'),
  builder: inject
}

const { Vec3 } = require('vec3')
const facingData = require('./facingData.json')

const { getShapeFaceCenters } = require('mineflayer-pathfinder/lib/shapes')

class Build {
  constructor (schematic, world, at) {
    this.schematic = schematic
    this.world = world
    this.at = at

    this.min = at.plus(schematic.offset)
    this.max = this.min.plus(schematic.size)

    this.actions = []
    this.updateActions()

    // Cache of blockstate to block
    const Block = require('prismarine-block')(schematic.version)
    const mcData = require('minecraft-data')(schematic.version)
    this.blocks = {}
    this.properties = {}
    this.items = {}
    for (const stateId of schematic.palette) {
      const block = Block.fromStateId(stateId, 0)
      this.blocks[stateId] = block
      this.properties[stateId] = block.getProperties()
      this.items[stateId] = mcData.itemsByName[block.name]
    }

    // How many actions ?
    // console.log(this.actions)
  }

  updateActions () {
    this.actions = []
    const cursor = new Vec3(0, 0, 0)
    for (cursor.y = this.min.y; cursor.y < this.max.y; cursor.y++) {
      for (cursor.z = this.min.z; cursor.z < this.max.z; cursor.z++) {
        for (cursor.x = this.min.x; cursor.x < this.max.x; cursor.x++) {
          const stateInWorld = this.world.getBlockStateId(cursor)
          const wantedState = this.schematic.getBlockStateId(cursor.minus(this.at))
          if (stateInWorld !== wantedState) {
            if (wantedState === 0) {
              this.actions.push({ type: 'dig', pos: cursor.clone() })
            } else {
              this.actions.push({ type: 'place', pos: cursor.clone(), state: wantedState })
            }
          }
        }
      }
    }
  }

  updateBlock (pos) {
    // is in area ?
    this.updateActions()
  }

  getItemForState (stateId) {
    return this.items[stateId]
  }

  getFacing (stateId, facing) {
    if (!facing) return { facing: null, faceDirection: false, is3D: false }
    const block = this.blocks[stateId]
    const data = facingData[block.name]
    if (data.inverted) {
      if (facing === 'up') facing = 'down'
      else if (facing === 'down') facing = 'up'
      else if (facing === 'north') facing = 'south'
      else if (facing === 'south') facing = 'north'
      else if (facing === 'west') facing = 'east'
      else if (facing === 'east') facing = 'west'
    }
    return { facing, faceDirection: data.faceDirection, is3D: data.is3D }
  }

  getPossibleDirections (stateId, pos) {
    const faces = [true, true, true, true, true, true]
    const properties = this.properties[stateId]
    const block = this.blocks[stateId]
    if (properties.axis) {
      if (properties.axis === 'x') faces[0] = faces[1] = faces[2] = faces[3] = false
      if (properties.axis === 'y') faces[2] = faces[3] = faces[4] = faces[5] = false
      if (properties.axis === 'z') faces[0] = faces[1] = faces[4] = faces[5] = false
    }
    if (properties.half === 'upper') return []
    if (properties.half === 'top' || properties.type === 'top') faces[0] = faces[1] = false
    if (properties.half === 'bottom' || properties.type === 'bottom') faces[0] = faces[1] = false
    if (properties.facing) {
      const { facing, faceDirection } = this.getFacing(stateId, properties.facing)
      if (faceDirection) {
        if (facing === 'north') faces[0] = faces[1] = faces[2] = faces[4] = faces[5] = false
        else if (facing === 'south') faces[0] = faces[1] = faces[3] = faces[4] = faces[5] = false
        else if (facing === 'west') faces[0] = faces[1] = faces[2] = faces[3] = faces[4] = false
        else if (facing === 'east') faces[0] = faces[1] = faces[2] = faces[3] = faces[5] = false
        else if (facing === 'up') faces[1] = faces[2] = faces[3] = faces[4] = faces[5] = false
        else if (facing === 'down') faces[0] = faces[2] = faces[3] = faces[4] = faces[5] = false
      }
    }
    if (properties.hanging) faces[0] = faces[2] = faces[3] = faces[4] = faces[5] = false
    if (block.material === 'plant') faces[1] = faces[2] = faces[3] = faces[4] = faces[5] = false

    let dirs = []
    const faceDir = [new Vec3(0, -1, 0), new Vec3(0, 1, 0), new Vec3(0, 0, -1), new Vec3(0, 0, 1), new Vec3(-1, 0, 0), new Vec3(1, 0, 0)]
    for (let i = 0; i < faces.length; i++) {
      if (faces[i]) dirs.push(faceDir[i])
    }

    const half = properties.half ? properties.half : properties.type
    dirs = dirs.filter(dir => {
      const block = this.world.getBlock(pos.plus(dir))
      return getShapeFaceCenters(block.shapes, dir.scaled(-1), half).length > 0
    })

    return dirs
  }

  removeAction (action) {
    this.actions.splice(this.actions.indexOf(action), 1)
  }

  getAvailableActions () {
    return this.actions.filter(action => {
      if (action.type === 'dig') return true // TODO: check
      if (this.getPossibleDirections(action.state, action.pos).length > 0) return true
      return false
    })
  }
}

module.exports = Build

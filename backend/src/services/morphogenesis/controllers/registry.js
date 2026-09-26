'use strict';

const { TopologyController } = require('./topologyController');
const { TrinityController } = require('./trinityController');
const { ATeamController } = require('./aTeamController');
const { RhizomeController } = require('./rhizomeController');
const { SyncytiumController } = require('./syncytiumController');
const { BiocenoseController } = require('./biocenoseController');

const CONTROLLER_MAP = {
  trinity: TrinityController,
  a_team: ATeamController,
  rhizome: RhizomeController,
  syncytium: SyncytiumController,
  biocenose: BiocenoseController
};

class ControllerRegistry {
  constructor(runtime) {
    this.runtime = runtime;
    this.controllers = new Map();
    this.controllerInstances = new Map();
  }

  getController(topology, node) {
    const key = `${topology}:${node.nodeId}`;

    if (this.controllerInstances.has(key)) {
      return this.controllerInstances.get(key);
    }

    const ControllerClass = CONTROLLER_MAP[topology] || TopologyController;
    const instance = new ControllerClass(node, this.runtime);
    this.controllerInstances.set(key, instance);
    return instance;
  }

  getOrCreate(node) {
    return this.getController(node.topology, node);
  }

  registerCustom(topology, ControllerClass) {
    CONTROLLER_MAP[topology] = ControllerClass;
  }

  hasController(topology) {
    return CONTROLLER_MAP.hasOwnProperty(topology);
  }

  getRegisteredTopologies() {
    return Object.keys(CONTROLLER_MAP);
  }

  clearInstance(topology, nodeId) {
    this.controllerInstances.delete(`${topology}:${nodeId}`);
  }

  clearAll() {
    this.controllerInstances.clear();
  }
}

module.exports = { ControllerRegistry, CONTROLLER_MAP };
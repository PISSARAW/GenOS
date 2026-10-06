'use strict';

const { handleTeam } = require('../src/services/topology/teamDispatchHandler.cjs');
const { handleBiological } = require('../src/services/topology/biologicalDispatchHandler.cjs');
const { handleTrinity } = require('../src/services/topology/trinityDispatchHandler.cjs');
const { selectMembers } = require('../src/services/topology/biologicalMemberDispatcherCore.cjs');

module.exports = { handleTeam, handleBiological, handleTrinity, selectMembers };
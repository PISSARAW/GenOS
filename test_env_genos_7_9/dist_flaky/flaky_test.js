"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// flaky_test.ts - test conçu pour réussir aléatoirement environ 1 fois sur 3.
const node_assert_1 = require("node:assert");
const node_test_1 = require("node:test");
const flaky_network_1 = require("./flaky_network");
(0, node_test_1.test)('profile data is fetched from the network', () => {
    const data = (0, flaky_network_1.fetchProfileData)();
    node_assert_1.strict.equal(data, 'data');
});

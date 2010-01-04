exports.testPersistence = require("./model");
exports.testFacet = require("./facet");
exports.testStores = require("./store/all-stores");

if (true)
    require("os").exit(require("test/runner").run(exports));


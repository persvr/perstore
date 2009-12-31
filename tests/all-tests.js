exports.testPersistence = require("./model");
exports.testFacet = require("./facet");

if (true)
    require("os").exit(require("test/runner").run(exports));


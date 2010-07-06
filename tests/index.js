exports.testPersistence = require("./model");
exports.testFacet = require("./facet");
exports.testStores = require("./store/all-stores");

if (require.main === module)
    require("patr/runner").run(exports);


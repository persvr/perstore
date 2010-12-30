exports.testReadonlyMemory = require("./readonly-memory");
exports.testInherited = require("./inherited");
exports.testInherited = require("./cache");

if (require.main === module)
    require("patr/runner").run(exports);
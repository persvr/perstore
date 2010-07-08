exports.testJSFile = require("./js-file");
exports.testReadonlyMemory = require("./readonly-memory");

if (require.main === module)
    require("patr/runner").run(exports);
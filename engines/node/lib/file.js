var fs = require("fs");
exports.read = fs.readFileSync;
exports.write = fs.writeFileSync;
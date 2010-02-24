var fs = require("fs");

exports.root = JSON.parse(fs.readFileSync("local.json"));
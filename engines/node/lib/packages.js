var posix = require("posix");

exports.root = JSON.parse(posix.cat("local.json").wait());
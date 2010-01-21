/**
 * Does normalization of the Node environment to more closely match CommonJS
 */

var sys = require("sys");
// upgrade to ES5 and CommonJS globals
print = sys.puts;
global = this;
require("global");


process.addListener("uncaughtException", function(error){
	// obviously we don't want uncaught exceptions to crash the server
	print(error.stack);
});
/**
 * This provides utilities for stores 
 */

exports.DefaultStore = function(options){
	return require("./store/replicated").Replicated(require("./store/memory").Persistent(options));
};

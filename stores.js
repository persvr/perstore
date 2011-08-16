/**
 * This provides utilities for stores 
 */

exports.DefaultStore = function(){
	return require("./store/replicated").Replicated(require("./store/memory").Persistent());
};

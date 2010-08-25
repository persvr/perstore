/**
 * This provides utilities for stores 
 */

exports.DefaultStore = function(){
	return require("./store/notifying").Notifying(require("./store/memory").Persistent());
};

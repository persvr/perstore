/**
 * An in-memory store.
 */

var ReadonlyMemory = require("./readonly-memory").ReadonlyMemory;
exports.Memory = function(options){
	var store = ReadonlyMemory(options);
	// start with the read-only memory store and add write support
	store.put = function(object, id){
		object.id = id = id || object.id || Math.round(Math.random()*10000000000000);
		this.index[id] = object;
		return id;
	};
	store["delete"] = function(id){
		delete this.index[id]; 
	};
	return store;
};
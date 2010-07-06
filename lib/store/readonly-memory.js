/**
 * An readonly in-memory store.
 */
var executeQuery = require("rql/query").executeQuery;
var LazyArray = require("promised-io/lazy-array").LazyArray;
function MemoryObject(){}
MemoryObject.prototype = {
	getId: function(object){
		return this.id;
	}
}
exports.ReadonlyMemory = function(options){
	return {
		index: (options && options.index) || {},
		get: function(id){
			var object = new MemoryObject;
			var current = this.index[id];
			if(!current){
				return;
			}
			for(var i in current){
				if(current.hasOwnProperty(i)){
					object[i] = current[i];
				}
			}
			return object;
		},
		query: function(query, options){
			options = options || {};
			var all = [];
			for(var i in this.index){
				all.push(this.index[i]);
			}
			var result = executeQuery(query, options, all);
			if(result instanceof Array){
				// make a copy 
				return LazyArray({
					some: function(callback){
						result.some(function(item){
							if(item && typeof item === "object"){
								var object = {};
								for(var i in item){
									if(item.hasOwnProperty(i)){
										object[i] = item[i];
									}
								}
								return callback(object);
							}
							return callback(item);
						});
					},
					length: result.length,
					totalCount: result.totalCount
				});
			}
			return result;
		}
	};
};

/**
 * An in-memory store.
 */
var PreconditionFailed = require("../errors").PreconditionFailed; 
var ReadonlyMemory = require("./readonly-memory").ReadonlyMemory;
exports.Memory = function(options){
	var store = ReadonlyMemory(options);
	var uniqueKeys = {};
	// start with the read-only memory store and add write support
	store.put = function(object, directives){
		directives = directives || {};
		var id = object.id = directives.id || object.id || Math.round(Math.random()*10000000000000);
		var isNew = !(id in this.index);
		if("overwrite" in directives){
			if(directives.overwrite){
				if(isNew){
					throw new PreconditionFailed(id + " does not exist to overwrite");
				}
			}
			else{
				if(!isNew){
					throw new PreconditionFailed(id + " exists, and can't be overwritten");
				}
			}
		}
		updateIndexes.call(this, id, object);
		this.index[id] = object;
		return isNew && id;
	};
	store["delete"] = function(id){
		updateIndexes.call(this, id);
		delete this.index[id]; 
	};
	store.setSchema = function(schema){
		for(var i in schema.properties){
			if(schema.properties[i].unique){
				uniqueKeys[i] = true;
				store.indexes[i] = {};
			}
		}
	};
	store.indexes = {};
	store.setIndex = function(index){
		this.index = index;
		for(var id in index){
			updateIndexes.call(this, id, index[id]);
		}
	};
	store.setIndex(store.index);
	return store;

	function updateIndexes(id, object){
		var indexes = this.indexes;
		var current = this.index[id];
		// update the indexes
		for(var i in indexes){
			var index = indexes[i];
			if(uniqueKeys.hasOwnProperty(i)){
				if(current){
					delete index[current[i]];
				}
				if(object){
					if(index.hasOwnProperty(object[i])){
						throw new Error("Unique key constraint error duplicate " + JSON.stringify(object[i]) + " for key " + JSON.stringify(i));
					}
					index[object[i]] = object;
				}
			}
			else{
				// multi-valued indexes, each entry is an array
				if(current){
					var forKey = index[current[i]];
					if(forKey){
						var position = forKey.indexOf(current);
						if(position > -1){
							forKey.splice(position, 1);
						}
					}
				}
				if(object){ 
					(index[object[i]] = index[object[i]] || []).push(object);
				}
			}
		} 
		
	}

};

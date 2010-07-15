var executeQuery = require("rql/js-array").executeQuery,
    LazyArray = require("promised-io/lazy-array").LazyArray;


function MemoryObject(){}
MemoryObject.prototype = {
	getId: function(object){
		return this.id;
	}
}

// ReadOnly memory store

var ReadOnly = exports.ReadOnly = function(options){
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


// Memory store extends ReadOnly to add support for writes

var PreconditionFailed = require("../errors").PreconditionFailed; 
var Memory = exports.Memory = function(options){
	var store = ReadOnly(options);
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


// Persistent store extends Memory to persist writes to fs

var JSONExt = require("commonjs-utils/json-ext"),
    fs = require("promised-io/fs");
    AutoTransaction = require("perstore/stores").AutoTransaction;

var Persistent = exports.Persistent = function(filename, options) {
	if (!filename) throw new Error("No path for store provided");
	var store = Memory(options);

    // set up a memory store and populate with line-separated json
    var buffer;
    try {
        buffer = fs.readFileSync(filename);
    }
    catch(e) {}
    if (buffer && buffer.length > 1) {
        var s = "[" + buffer.substring(0, buffer.length - 2) + "]";
        var data = JSONExt.parse(s);
        data = data.filter(function(doc){
            return doc.__deleted__ !== true;
        });
        // populate the store
        store.setIndex(data);
    }

	// open and keep file in append mode
	var writeStream;
	try {
		// first try for node's fs module
		writeStream = require("fs").createWriteStream(filename, {flags: "a"});
	} catch (e) {
		// N.B. QUIRK: we are here even if under node, just filepath didn't exist :)
		// fall back on narwhal's file module
		writeStream = require("file").open(filename, "a");
	}
    
	var originalPut = store.put;
	store.put = function(object){
		var result = originalPut.apply(store, arguments);
		writeStream.write(JSONExt.stringify(object) + ",\n");
		if (writeStream.flush) writeStream.flush();
		return result;
	};
    
	var originalDelete = store["delete"];
	store["delete"] = function(id){
		var result = originalDelete.apply(store, arguments);
		writeStream.write(JSON.stringify({id: id, __deleted__: true}) + ",\n");
		if (writeStream.flush) writeStream.flush();
		return result;
	};

	// FIXME learn how to use transactions!
	/*store.transaction = function() {
        var transactionQueue = [];
		return {
			commit: function() {
                print('commiting!')
				if (transactionQueue.length) {
					outputStream.write(transactionQueue.join("\n") + "\n");
					transactionQueue.length = 0;
				}
			},
			abort: function() {
                print('abort, abort')
				transactionQueue.length = 0;
			}
		};
	};*/
    
	return store;//AutoTransaction(store);
};


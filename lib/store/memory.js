var executeQuery = require("rql/js-array").executeQuery,
	when = require("promised-io/promise").when,
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
	store.add = function(object, directives){
		directives = directives || {};
		directives.overwrite = false;
		store.put(object, directives);
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
		if(index instanceof Array){
			index.forEach(function(object){
				store.index[object.id] = object;
			});
		}
		else{
			this.index = index;
		}
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
}


// Persistent store extends Memory to persist writes to fs

var JSONExt = require("commonjs-utils/json-ext"),
	fs = require("promised-io/fs");
	AutoTransaction = require("../stores").AutoTransaction;

var Persistent = exports.Persistent = function(options) {
	options = options || {};
	var path = options.path || require("commonjs-utils/settings").dataFolder || "data";
	if(options.filename){
		initializeFile(options.filename);
	}
	var store = Memory(options);
	function initializeFile(filename){
		if(!writeStream){
			if(filename.charAt(0) != '/'){
				filename = path + '/' + filename;
			}
			writeStream = fs.open(filename, "a");
			// set up a memory store and populate with line-separated json
			var buffer;
			try {
				buffer = fs.read(filename);
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
		}

	}

	var transactionQueue;
	var writeStream;
	store.setPath = function(id){
		initializeFile(id);
	}
	var originalPut = store.put;
	store.put = function(object) {
		var result = originalPut.apply(store, arguments);
		transactionQueue.push(JSONExt.stringify(object) + ",\n");
		return result;
	}
	var originalAdd = store.add;
	store.add = function(object) {
		var result = originalAdd.apply(store, arguments);
		transactionQueue.push(JSONExt.stringify(object) + ",\n");
		return result;
	}
	
	var originalDelete = store["delete"];
	store["delete"] = function(id) {
		var result = originalDelete.apply(store, arguments);
		transactionQueue.push(JSONExt.stringify({id: id, __deleted__: true}) + ",\n");
		return result;
	}

	store.transaction = function() {
		var queue = transactionQueue = [];
		return {
			commit: function() {
				if(!writeStream){
					throw new Error("Store was not initialized. Store's setPath should be called or it should be included as part of a data model package")
				}
				return when(writeStream, function(writeStream){
					queue.forEach(function(block){
						writeStream.write(block);
					});
					if(writeStream.flush){
						writeStream.flush();
					}
				   queue.length = 0;
				});
			},
			abort: function() {
				queue.length = 0;
			},
			suspend: function(){
				transactionQueue = null;
			},
			resume: function(){
				transactionQueue = queue;
			}
		};
	};

	return AutoTransaction(store);
};


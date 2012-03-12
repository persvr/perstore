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
		query: function(query, directives){
			directives = directives || {};
			var all = [];
			for(var i in this.index){
				all.push(this.index[i]);
			}
			all.log = options.log;
			if(directives.id){
				query += "&id=" + encodeURIComponent(directives.id);
			}
			var result = executeQuery(query, directives, all);
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
	options = options || {};
	var store = ReadOnly(options);
	var uniqueKeys = {};
	var log = ("log" in options) ? options.log : (options.log = []);
	// start with the read-only memory store and add write support
	var put = store.put = function(object, directives){
		directives = directives || {};
		var id = object.id = "id" in object ? object.id :
					"id" in directives ? directives.id : Math.round(Math.random()*10000000000000);
		var isNew = !(id in store.index);
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
		updateIndexes.call(store, id, object);
		store.index[id] = object;
		return isNew && id;
	};
	store.add = function(object, directives){
		if(log){
			log.push(object);
		}
		directives = directives || {};
		directives.overwrite = false;
		put(object, directives);
	};
	store["delete"] = function(id){
		if(log){
			log.push({__deleted__: id,id: id});
		}
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
			if(log){
				log.push.apply(log, index);
			}
			index.forEach(function(object){
				if("__deleted__" in object){
					delete store.index[object.__deleted__];
				}else{
					store.index[object.id] = object;
				}
			});
			index.forEach(function(object){
				updateIndexes.call(store, object.id, object);
			})
		}
		else{
			this.index = index;
			for(var id in index){
				updateIndexes.call(this, id, index[id]);
			}
		}
	};
	store.setIndex(store.index);
	if(log){
		store.getRevision = function(){
			return log.length;
		};
	}
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
				if(object && object.hasOwnProperty(i)){
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

require("rql/js-array").operators.revisions = function(revision){
	return this.log.slice(revision || 0, this.log.length);
}
// Persistent store extends Memory to persist writes to fs

var JSONExt = require("../util/json-ext"),
	fs = require("promised-io/fs"),
	AutoTransaction = require("../transaction").AutoTransaction;

var Persistent = exports.Persistent = function(options) {
	options = options || {};
	var path = options.path || require("../util/settings").dataFolder || "data";
	if(options.filename){
		initializeFile(options.filename);
	}
	var store = Memory(options);
	function initializeFile(filename){
		if(!filename){
			throw new Error("A path/filename must be provided to the store");
		}
		if(!writeStream){
			if(filename.charAt(0) != '/'){
				filename = path + '/' + filename;
			}
			writeStream = fs.openSync(filename, "a");
			// set up a memory store and populate with line-separated json
			var buffer;
			try {
				buffer = fs.read(filename);
			}
			catch(e) {}
			if(buffer && buffer.trim() === "[") {
			}
			else if(buffer && buffer.length > 1){
				if(buffer.charAt(0) == '{'){
					buffer = '[' + buffer;
				}
				if(buffer.match(/,\r?\n$/)){
					buffer = buffer.replace(/,\r?\n$/,']');
				}
				try{
					var data = eval(buffer);
				}catch(e){
					e.message += " trying to parse " + filename;
					throw e;
				}
				// populate the store
				store.setIndex(data);
				if(options.log === false){
					// rewrite the file if loging is disabled
					data = [];
					for(var i in store.index){
						data.push(store.index[i]);
					}
					buffer = JSONExt.stringify(data);
					buffer = buffer.substring(0, buffer.length - 1) + ',\n';
					writeStream.close();
					writeStream = fs.openSync(filename, "w");
					writeStream.write(buffer);
				}
			}else if(!buffer || buffer.length == 0){
				writeStream.write("[");
			}
		}
	}

	var writeStream;
	store.setPath = function(path){
		initializeFile(path);
	}
	var originalPut = store.put;
	store.put = function(object) {
		var result = originalPut.apply(store, arguments);
		store.addToTransactionQueue(JSONExt.stringify(object) + ",\n");
		return result;
	}
	var originalAdd = store.add;
	store.add = function(object) {
		var result = originalAdd.apply(store, arguments);
		store.addToTransactionQueue(JSONExt.stringify(object) + ",\n");
		return result;
	}
	var originalDelete = store["delete"];
	store["delete"] = function(id) {
		var result = originalDelete.apply(store, arguments);
		store.addToTransactionQueue(JSONExt.stringify({__deleted__: id, id: id}) + ",\n");
		return result;
	};

	store.commitTransactionQueue = function(queue) {
		if(!writeStream){
			throw new Error("Store was not initialized. Store's setPath should be called or it should be included as part of a data model package")
		}
		queue.forEach(function(block){
			writeStream.write(block);
		});
		if(writeStream.flush){
			writeStream.flush();
		}
	};

	return AutoTransaction(store);
};

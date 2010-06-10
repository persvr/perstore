/**
* A persistent in-memory store inspired by node-dirty.
*/

var JSONExt = require("commonjs-utils/json-ext"),
	//AutoTransaction = require("stores").AutoTransaction,
	fs = require("fs-promise");

exports.PersistentMemory = function(filename) {
	if (!filename) throw new Error("No path for store provided");

	// set up a memory store and populate with line-separated json
	var store = Memory = require("./memory").Memory(),
		buffer = "[]";

	try {
		buffer = fs.read/*FileSync*/(filename);
		// TODO: in order to not have a pique of memusage (when buffer and the same buffer wrapped with [] are in memory):
		// TODO: play with buffer position = 1?
		// the last comma to be changed with ]
		var len = buffer.length;
		if (len > 1) {
			//buffer[len-2] = ']';
			var s = '['+buffer.substring(0, len-2)+']';
			// TODO: how big we could be here?
			var data = JSONExt.parse(s);
			// kick off deleted records. TODO: need to really purge them
			data = data.filter(function(doc){
				return doc.__deleted__ !== true;
			});
			// populate the store
			store.setIndex(data);
		}
	} catch (e) {
	}

	// open and keep file in append mode
	var writeStream;
	try {
		// first try for node's fs module
		writeStream = require("fs").createWriteStream(filename, {flags: "a"});
	} catch (e) {
		// fall back on narwhal's file module
		writeStream = require("file").open(filename, "a");
	}

	// wrap .put()
	var originalPut = store.put;
	store.put = function(object, directives){
		var result = originalPut.apply(this, arguments);
		writeStream.write(JSONExt.stringify(object) + ",\n");
		if (writeStream.flush) writeStream.flush();
		return result;
	};

	// wrap .delete()
	var originalDelete = store["delete"];
	store["delete"] = function(id){
		var result = originalDelete.apply(store, arguments);
		writeStream.write(JSON.stringify({id: id, __deleted__: true}) + ",\n");
		if (writeStream.flush) writeStream.flush();
		return result;
	};

	// wrap .query()
	var originalQuery = store.query;
	store.query = function(query, directives){
		return originalQuery.apply(store, arguments);
	};

	// FIXME learn how to use transactions!
	/*store.transaction = function() {
		return {
			commit: function() {
				if (transactionQueue.length) {
					outputStream.write(transactionQueue.join("\n") + "\n");
					transactionQueue.length = 0;
				}
			},
			abort: function() {
				transactionQueue.length = 0;
			}
		};
	};*/

	return store;//AutoTransaction(store);
};

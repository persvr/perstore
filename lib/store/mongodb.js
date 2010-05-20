/**
 * MongoDB data store. Depends on
 * http://github.com/christkv/node-mongodb-native
 * This can be automatically resolved by adding the following line to your 
 * package.json "mappings" object if you are using a package mapping aware module
 * loader (like Nodules):
 * "mongodb/": "jar:http://github.com/christkv/node-mongodb-native/zipball/master!/lib/mongodb/"
 */
var mongo = require('mongodb/db'),
	//ObjectID = require('mongodb/bson/bson').ObjectID,
	BSON = require('mongodb/bson/bson'),
	BinaryParser = require('mongodb/bson/binary_parser').BinaryParser,
	Server = require("mongodb/connection").Server,
	parseQuery = require("perstore/resource-query").parseQuery,
	print = require("system").print,
	sys = require('sys'),
	convertNodeAsyncFunction = require("promise").convertNodeAsyncFunction,
	defer = require("promise").defer;

function dir(x){
	sys.puts(sys.inspect(x));
}

// this will return a data store 
exports.MongoDB = function(options){
	if(options.database){
		var database = options.database;
	}
	else{
		var dbOptions = require("commonjs-utils/settings").database;
		var database = new mongo.Db(dbOptions.name, new Server(dbOptions.host, dbOptions.port, {}), {});
	}
	var ready = defer(); 
	var collection;
	database.open(function(err, db){
		if(err){
			print("Failed to load mongo database " + dbOptions.name + " error " + err.message);
			ready.reject(err);
		}
		else{
			db.collection(options.collection, function(err, coll){
				if(err){
					print("Failed to load mongo database collection " + dbOptions.name + " collection " + options.collection + " error " + err.message);
					ready.reject(err);
				}else{
					collection = coll;
					ready.resolve();
				}
			});
		}
	});

	function callAsync(method, args){
		return convertNodeAsyncFunction(method, true).apply(collection, args);
	}
	function to_id(id){
		if (typeof id === 'string' && id.length == 12*2) try {
			id = BSON.ObjectID.createFromHexString(id);
		} catch (ex) {}
		return {_id: id};
	}
	return {
		ready: function(){
			return ready.promise;
		},
		get: function(id){
			return callAsync(collection.find, [to_id(id)]).then(function(results){
				return convertNodeAsyncFunction(results.nextObject).call(results).then(function(object){
					if (object) {
						return object;
					}
				});
			});
		},
		put: function(object, directives){
			var id = directives.id || Math.random().toString().substring(2);
			if (!object._id)
				object._id = to_id(id);
			var search = object._id;

			if(directives.overwrite === false){
				// do an insert, and check to make sure no id matches first
				return callAsync(collection.count, [search]).then(function(count){
					if(count === 0){
						return callAsync(collection.insert, [object]);
					}
					else{
						throw new Error("Object with id of " + id + " already exists");
					}
				});	
			}
			return callAsync(collection.update, [search, object, !directives.overwrite]);
		},
		"delete": function(id){
			callAsync(collection.remove, [to_id(id)]);
		},
		query: function(query, directives){
			if(typeof query === "string"){
				query = parseQuery(query);
			}
			var options = {};

			function walk(name, terms) {
				// valid funcs
				var valid_funcs = ['lt','lte','gt','gte','ne','in','nin','not','mod','all','size','exists','type','elemMatch'];
				// funcs which definitely require array arguments
				var requires_array = ['in','nin','all','mod'];
				// compiled search conditions
				var search = {};
				// iterate over terms
				terms.forEach(function(term){
					var func = term.name;
					var args = term.args;
					// ignore bad terms
					if (!func || !args) return;
					// process well-known functions
					// http://www.mongodb.org/display/DOCS/Querying
					if (func == "sort" && args.length > 0) {
						options.sort = args.map(function(sortAttribute){
							var firstChar = sortAttribute.charAt(0);
							var orderDir = "ascending";
							if (firstChar == "-" || firstChar == "+") {
								if (firstChar == "-") {
									orderDir = "descending";
								}
								sortAttribute = sortAttribute.substring(1);
							}
							return [sortAttribute, orderDir];
						});
					} else if (func == "select") {
						options.fields = args;
					// N.B. mongo has $slice to act upon array properties
					} else if (func == "slice") {
						// TODO: think over!!!
						// db.posts.find({}, {comments:{$slice: [20, 10]}}) // skip 20, limit 10
						options[args.shift()] = {'$slice': args.length > 1 ? args : args[0]};
					// grouping
					} else if (func == 'group') {
						// TODO:
					// nested terms? -> recurse
					} else if (args[0] && typeof args[0] === 'object') {
						search['$'+func] = walk(func, args);
					}
					// structured query syntax
					// http://www.mongodb.org/display/DOCS/Advanced+Queries
					else {
						// mongo specialty
						if (func == 'le') func = 'lte';
						else if (func == 'ge') func = 'gte';
						// the args[0] is the name of the property
						var key = args.shift();
						// the rest args are parameters to func()
						// FIXME: do we really need to .join()?!
						if (requires_array.indexOf(func) == -1)
							args = args.length == 1 ? args[0] : args.join();
						// regexp inequality means negation of equality
						if (func == 'ne' && args instanceof RegExp) {
							func = 'not';
						}
						// valid functions are prepended with $
						if (valid_funcs.indexOf(func) > -1) {
							func = '$'+func;
						}
						// $or requires an array of conditions
						// N.B. $or is said available for mongodb >= 1.5.1
						if (name == 'or') {
							if (!(search instanceof Array))
								search = [];
							var x = {};
							x[func == 'eq' ? key : func] = args;
							search.push(x);
						// other functions pack conditions into object
						} else {
							// several conditions on the same property is merged into one object condition
							if (search[key] === undefined)
								search[key] = {};
							if (search[key] instanceof Object && !(search[key] instanceof Array))
								search[key][func] = args;
							// equality cancels all other conditions
							if (func == 'eq')
								search[key] = args;
						}
					}
				// TODO: add support for query expressions as Javascript
				});
				return search;
			}

			// compose search conditions
			var search = walk('and', query); //dir(search);
			// respect directives
			if(directives.start >= 0 || directives.end >= 0){
				var totalCountPromise = callAsync(collection.count, [search]);	
			}
			if(directives.start){
				options.skip = directives.start;
			}
			// N.B. .end == 0 is perfectly valid
			if(directives.end >= 0){
				options.limit = directives.end - (directives.start || 0) + 1;
			}
BSON.ObjectID = function(id) {
dir(id);
  var hexString = '';
  for(var index = 0; index < id.length; index++) {
    var value = BinaryParser.toByte(id.substr(index, 1));
    var number = value <= 15 ? "0" + value.toString(16) : value.toString(16);
    hexString = hexString + number;
  }
  return hexString;
}
			return callAsync(collection.find, [search, options]).then(function(results){
				var resultsPromise = convertNodeAsyncFunction(results.toArray).call(results);
				return resultsPromise.then(function(results){
					// N.B. results here can be [{$err: 'err-message'}]
					// the only way I see to distinguish from quite valid result [{_id:..., $err: ...}] is to check for absense of _id
					if (results && results[0] && results[0].$err !== undefined && results[0]._id === undefined)
						// N.B. wiser not be verbose
						throw new URIError("Search error");//: " + results[0].$err);
					var fields = options.fields;
					var len = results.length;
					// reduce _id from ObjectId to a hex string
// TODO: maybe smth like ObjectID.prototype.toString = ObjectID.prototype.toHexString ?
// TODO: in json-ext.js?
//			var ObjectID = require('mongodb/bson/bson').ObjectID;
//			if (value instanceof ObjectID)
//				return quote(value.toHexString());
//
					// kick out unneeded fields
					if (fields) {
						if (fields.length === 1) {
							var column = fields[0];
							for (var i = 0; i < len; i++) {
								results[i] = results[i][column] || {};
							}
						}
						// _id field is always returned from db.coll.find(),
						// so we need to delete it unless it's exlicitly specified in fields
						if (fields.indexOf("_id") == -1) {
							for (var i = 0; i < len; i++) {
								delete results[i]._id;
							}
						}
					}
					// total count
					if (totalCountPromise) {
						return totalCountPromise.then(function(totalCount){
							results.totalCount = totalCount;
							return results;
						});
					}
					else {
						return results;
					}
				});
				return resultsPromise;
			});
		}
	}
}

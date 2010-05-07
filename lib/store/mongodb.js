/**
 * MongoDB data store. Depends on
 * http://github.com/christkv/node-mongodb-native
 * This can be automatically resolved by adding the following line to your 
 * package.json "mappings" object if you are using a package mapping aware module
 * loader (like Nodules):
 * "mongodb/": "jar:http://github.com/christkv/node-mongodb-native/zipball/master!/lib/mongodb/"
 */
var mongo = require('mongodb/db'),
	Server = require("mongodb/connection").Server,
	parseQuery = require("perstore/resource-query").parseQuery,
	print = require("system").print,
	convertNodeAsyncFunction = require("promise").convertNodeAsyncFunction,
	defer = require("promise").defer;

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
	return {
		ready: function(){
			return ready.promise;
		},
		get: function(id){
			return callAsync(collection.find, [{_id:id}]).then(function(results){
				return convertNodeAsyncFunction(results.nextObject).call(results).then(function(object){
					if(!object){
						return;
					}
					return object;
				});
			});
		},
		put: function(object, directives){
			var id = directives.id || object._id || Math.random().toString().substring(2);
			object._id = id;
			var search = {_id:id};

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
			callAsync(collection.remove, [{_id:id}]);
		},
		query: function(query, directives){
			function parseJSONQuery(query){
				return JSON.parse(query);
			}
			var search = {};
var sys = require('sys');
			if(typeof query === "string"){
				if (query.charAt(0) == "?") {
					query = query.substring(1);
				}
				query = decodeURIComponent(query);
//sys.puts("Q0:", sys.inspect(query));
				query = parseJSONQuery(query);
				var a = [];
				for (var name in query) if (query.hasOwnProperty(name)) {
					var value = query[name];
					a.push({
						comparator: '=',
						name: name,
						value: value,
					});
				}
				query = a;
sys.puts("Q1:", sys.inspect(query));
			}
			var options = {};
			query.forEach(function(term){
				// comparison?
				if (term.comparator !== undefined) {
					search[term.name] = term.value;
				// call?
				} else if (term.parameters !== undefined) {
					if (term.name == "sort" && term.parameters.length > 0) {
						options.sort = term.parameters.map(function(sortAttribute){
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

					} else if (term.name == "select") {
						options.fields = term.parameters;
					} else if (term.name == "slice") {
						// DVV: .start/.end MUST be numbers, or .start + a-number will result in string concat
						// DVV: better to get rid of slice() at all, as it _may_ introduce inconsistency with range set via Range: header. As deanlandolt stated, .slice() is to mimic JS intrinsic Array.slice() and should be chainable. IOW, it doesn't fit to control server-side conditions
						directives.start = +term.parameters[0];
						directives.end = +term.parameters[1] + 1; // DVV: slice high bound is exclusive
					}
				}
			// TODO: add support for alternate comparators, sorting, etc.
			});
			// DVV: typeof NaN === 'number'
			if(directives.start >= 0 || directives.end >= 0){
				var totalCountPromise = callAsync(collection.count, [search]);	
			}
			if(directives.start){
				options.skip = directives.start;
			}
			// DVV: .end == 0 is perfectly valid
			if(directives.end >= 0){
				options.limit = directives.end - (directives.start || 0) + 1;
			}
			return callAsync(collection.find, [search, options]).then(function(results){
				var resultsPromise = convertNodeAsyncFunction(results.toArray).call(results);
				return resultsPromise.then(function(results){
					var fields = options.fields;
					if(fields){
						if (fields.length === 1) {
							var column = fields[0];
							for(var i = 0, l = results.length; i < l; i++){
								results[i] = results[i][column];
							}
						}
						if (fields.indexOf("_id") == -1) {
							for(var i = 0, l = results.length; i < l; i++){
								delete results[i]._id;
							}
						}
					}
					if(totalCountPromise){
						return totalCountPromise.then(function(totalCount){
							results.totalCount = totalCount;
							return results;
						});
					}
					else{
						return results;
					}
				});
				return resultsPromise;
			});
		}
	}
}

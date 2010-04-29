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
			var search = {};
			if(typeof query === "string"){
				query = parseQuery(query);
			}
			var grabOneColumn, deleteId;
			var options = {};
			query.forEach(function(term){

				if (term.type == "comparison") {
					search[term.name] = term.value;
				}
				else if (term.type == "call") {
					if (term.name == "sort") {
						if (term.parameters.length === 0) 
							throw new URIError("Must specify a sort criteria");
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
						var parameters = options.fields = term.parameters;
						if(parameters.length === 1){
							grabOneColumn = parameters[0];
						}else if(parameters.indexOf("_id") > -1){
							deleteId = true;
						}
					} else if (term.name == "slice") {
						directives.start = term.parameters[0];
						directives.end = term.parameters[1];
					}
				}
			// TODO: add support for alternate comparators, sorting, etc.
			});
			if(directives.start || directives.end){
				var totalCountPromise = callAsync(collection.count, [search]);	
			}
			if(directives.start){
				options.skip = directives.start;
			}
			if(directives.end){
				options.limit = directives.end - (directives.start || 0);
			}
			return callAsync(collection.find, [search, options]).then(function(results){
				var resultsPromise = convertNodeAsyncFunction(results.toArray).call(results);
				if(totalCountPromise){
					return resultsPromise.then(function(results){
						return totalCountPromise.then(function(totalCount){
							if(grabOneColumn){
								for(var i = 0, l = results.length; i < l; i++){
									results[i] = results[i][grabOneColumn];
								}
							}
							if(deleteId){
								for(var i = 0, l = results.length; i < l; i++){
									delete results[i]._id;
								}
							}
							results.totalCount = totalCount;
							return results;
						});
					});
				}
				return resultsPromise;
			});
		}
	}
}
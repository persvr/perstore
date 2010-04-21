/**
 * MongoDB data store. Depends on
 * http://github.com/christkv/node-mongodb-native
 */
var mongo = require('mongodb/db'),
	Server = require("mongodb/connection").Server,
	parseQuery = require("../resource-query").parseQuery,
	print = require("system").print,
	convertNodeAsyncFunction = require("promise").convertNodeAsyncFunction;

// this will return a data store 
exports.MongoDB = function(options){
	if(options.database){
		var database = options.database;
	}
	else{
		var dbOptions = require("settings").database;
		var database = new mongo.Db(dbOptions.name, new Server(dbOptions.host, dbOptions.port, {}), {});
	}
	var idAttribute = options.idAttribute || "id";
	function createIdSearch(id){
		var search = {};
		search[idAttribute] = id;
		return search;
	}
	var collection;
	database.open(function(db){
		db.collection(options.collection, function(err, coll){
			if(err){
				print("Failed to load mongo database " + dbOptions.name + " collection " + options.collection + " error " + err);			
			}else{
				collection = coll;
			}
		});
	});

	function callAsync(method, args){
		return convertNodeAsyncFunction(method).apply(collection, args);
	}
	return {
		get: function(id){
			return callAsync(collection.find, [createIdSearch(id)]).then(function(results){
				return convertNodeAsyncFunction(results.nextObject).call(results).then(function(object){
					if(!object){
						return;
					}
					if(idAttribute !== "_id"){
						delete object._id;
					}
					return object;
				});
			});
		},
		put: function(object, directives){
			var id = directives.id || object[idAttribute] || Math.random().toString().substring(2);
			var search = createIdSearch(id);

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
			callAsync(collection.remove, [createIdSearch(id)]);
		},
		query: function(query, directives){
			var search = {};
			if(typeof query === "string"){
				query = parseQuery(query);
			}
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
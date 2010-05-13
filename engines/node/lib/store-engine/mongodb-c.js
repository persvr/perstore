/**
 * MongoDB data store. Depends on
 * http://github.com/orlandov/node-mongodb
 */
var mongodb = require("mongodb"); // requires mongodb from http://github.com/orlandov/node-mongodb
// this will return a data store 
exports.MongoDB = function(options){
	if(options.database){
		var database = options.database;
	}
	else{
		var database = new mongodb.MongoDB();
		mongo.connect(options);
	}
	var idAttribute = options.idAttribute || "id";
	var collection = database.getCollection(options.collection);
	function createIdSearch(id){
		var search = {};
		search[idAttribute] = id;
		return search;
	}
	return {
		get: function(id){
			return collection.find(createIdSearch(id)).then(function(results){
				return results[0];
			});
		},
		put: function(object, id){
			id = id || object[idAttribute];
			var search = createIdSearch(id);
			return collection.count(search).then(function(count){
				if(count === 0){
					return collection.insert(object);
				}
				else{
					return collection.update(search, object);
				}
			});
		},
		"delete": function(id){
			collection.remove(createIdSearch(id));
		},
		query: function(query){
			var search = {};
			if(typeof query === "string"){
				query = parseQuery(query);
			}
			query.forEach(function(term){
				if(term.type == "comparison"){
					search[term.name] = term.value;
				}
			// TODO: add support for alternate comparators, sorting, etc.
			});
		}
	}
};
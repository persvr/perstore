/**
 * This store wrapper provides a means for creating a set of stores (from a single store)
 * that can inherit from each other with a superset/subset relation. One can use
 * schemas to indicate the hierarchy (with the "extends" property), and a property
 * is added to the instances to indicate what schema/model each instance belongs to.
 * See tests/inherited.js for an example.   
 */
var getLink = require("json-schema/lib/validate").getLink,
	promise = require("promised-io/promise"),
	subSchemas = {};
exports.Inherited = function(store, schemaProperty){
	// TODO: determine the schemaProperty from the schema's "schema" relation
	schemaProperty = schemaProperty || "__schema__";
	var hierarchy = [];
	var id = promise.defer();
	var inheritingStore = {};
	for(var i in store){
		inheritingStore[i] = store[i];
	}
	var schema;
	var originalSetSchema = store.setSchema;
	inheritingStore.setSchema = function(newSchema){
		schema = newSchema;
		originalSetSchema && originalSetSchema.call(store, schema);
		if(schema.id && !schema.id.then){
			id.resolve(schema.id);
			id = schema.id;
		}else{
			schema.id = id;
		}
		promise.when(id, function(id){
			function addToHierarchy(superSchema){
				promise.when(superSchema.id, function(superId){
					var subs = subSchemas[superId];
					if(!subs){
						subs = subSchemas[superId] = [];
					}
					if(subs.indexOf(id) == -1){
						subs.push(id);
					}
					superSchema = superSchema["extends"]; 
					if(superSchema){
						if(superSchema.instanceSchema){
							superSchema = superSchema.instanceSchema;
						}
						if(superSchema instanceof Array){
							// handle multiple inheritance
							superSchema.forEach(addToHierarchy);
						}else{
							addToHierarchy(superSchema);
						}
					}
				});
			}
			addToHierarchy(schema);
		});
	};
	var originalSetPath = store.setPath;
	inheritingStore.setPath = function(path){
		originalSetPath && originalSetPath.call(store, path);
		if(id && id.then){
			try{
				id.resolve(path);
				id = path;
			}catch(e){
				// squelch repeated resolve errors
			}
		}
	};
	inheritingStore.query = function(query, directives){
		query = query + "&in(" + encodeURIComponent(schemaProperty) + ",(" + subSchemas[id] + "))";
		return store.query(query, directives);
	};
	inheritingStore.put = function(object, directives){
		object[schemaProperty] = id;
		return store.put(object, directives);
	};
	if(store.add){
		inheritingStore.add = function(object, directives){
			object[schemaProperty] = id;
			return store.add(object, directives);
		};
	}
	return inheritingStore;
};

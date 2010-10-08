/**
 * This store wrapper provides a means for creating a set of stores (from a single store)
 * that can inherit from each other with a superset/subset relation. One can use
 * schemas to indicate the hierarchy (with the "extends" property), and a property
 * is added to the instances to indicate what schema/model each instance belongs to.
 * See tests/inherited.js for an example.   
 */
var getLink = require("commonjs-utils/json-schema").getLink,
	subSchemas = {};
exports.Inherited = function(store, schemaProperty){
	// TODO: determine the schemaProperty from the schema's "schema" relation
	schemaProperty = schemaProperty || "schema";
	var hierarchy = [];
	var id;
	var inheritingStore = {};
	for(var i in store){
		inheritingStore[i] = store[i];
	} 
	var originalSetSchema = store.setSchema;
	inheritingStore.setSchema = function(schema){
		originalSetSchema.call(store, schema);
		function addToHierarchy(superSchema){
			var subs = subSchemas[superSchema.id];
			if(!subs){
				subs = subSchemas[superSchema.id] = [];
			}
			subs.push(schema.id);
			if(superSchema["extends"]){
				if(superSchema["extends"] instanceof Array){
					// handle multiple inheritance
					superSchema["extends"].forEach(addToHierarchy);
				}else{
					addToHierarchy(superSchema["extends"]);
				}
			}
		}
		if(id){
			nadfk=fdaskn;
		}
		id = schema.id;
		addToHierarchy(schema);
	};
	inheritingStore.query = function(query, directives){
		query = query + "&" + schemaProperty + "=in=(" + subSchemas[id] + ")"; 
		return store.query(query, directives);
	};
	inheritingStore.put = function(object, directives){
		object[schemaProperty] = id;
		return store.put(object, directives);
	};
	return inheritingStore;
};

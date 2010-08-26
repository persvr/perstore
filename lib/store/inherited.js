/**
 * This store wrapper provides a means for creating a set of stores (from a single store)
 * that can inherit from each other with a superset/subset relation. One can use
 * schemas to indicate the hierarchy (with the "extends" property), and a property
 * is added to the instances to indicate what schema/model each instance belongs to.
 * See tests/inherited.js for an example.   
 */
var getLink = require("commonjs-utils/json-schema").getLink;
exports.Inherited = function(schema, store, schemaProperty){
	// TODO: determine the schemaProperty from the schema's "schema" relation
	schemaProperty = schemaProperty || "schema";
	var hierarchy = [];
	function addToHierarchy(schema){
		hierarchy.push(schema.id);
		if(schema["extends"]){
			if(schema["extends"] instanceof Array){
				// handle multiple inheritance
				schema["extends"].forEach(addToHierarchy);
			}else{
				addToHierarchy(schema["extends"]);
			}
		}
	}
	addToHierarchy(schema);
	var inheritingStore = {};
	for(var i in store){
		inheritingStore[i] = store[i];
	} 
	inheritingStore.query = function(query, directives){
		query = query + "&" + schemaProperty + "=in=(" + hierarchy + ")"; 
		return store.query(query, directives);
	};
	inheritingStore.put = function(object, directives){
		object[schemaProperty] = schema.id;
		return store.put(object, directives);
	};
	return inheritingStore;
};

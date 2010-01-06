var Permissive = require("./facet").Permissive;

var stores = require("./stores"),
	DefaultStore = stores.DefaultStore,
	registerStore = stores.registerStore,
	defineProperty = require("es5-helper").defineProperty;
exports.Store = function(name, store){
	exports.Model(name, store,  {});//(store.getSchema ? store.getSchema() : {});
}
var schemas = {}, models = {};
exports.Model = function(name, store, schema){
	if(!schema){
		schema = store;
		store = null;
		
	}
	if(!store){
		store= new DefaultStore(name);
	}
	schema.id = name;
	schemas[name] = schema;
	if(typeof schema !== "function"){ 
		schema = Permissive(store, schema);
	}
	schema.id = name;
	defineProperty(schema, "transaction", {
		get: function(){
			return stores.currentTransaction;
		}
	});
	models[name] = schema;
	return registerStore(name, store, schema);
};

exports.openObjectStore = function(name){
	var model = models[name];
	if(!model){
		throw new NotFoundError(name + " not found");
	}
	return model;
	
}
exports.classSchema = {};
exports.classModel = exports.Model("Class", require("./store/memory").Memory({index: schemas}), exports.classSchema);
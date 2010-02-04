var Permissive = require("./facet").Permissive;

var stores = require("./stores"),
	registerStore = stores.registerStore,
	JSFile = require("./store/js-file").JSFile,
	NotFoundError = require("./errors").NotFoundError,
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
		store = JSFile((require("settings").dataFolder || "data") + "/" + name);
	}
	store.id = name;
	if(!store.create){
		// map create to put in case it only implements the WebSimpleDB API
		store.create = store.put;
	}
	
	schema.id = name;
	schemas[name] = schema;
	if(typeof store.setSchema === "function"){
		store.setSchema(schema);
	}
	if(typeof schema !== "function"){ 
		schema = Permissive(store, schema);
	}
	schema.id = name;
	defineProperty(schema, "transaction", {
		get: function(){
			return exports.currentTransaction;
		}
	});
	return models[name] = schema;
};

exports.transaction = function(){
	var dbTransaction = stores.transaction();
	return exports.currentTransaction = {
		openObjectStore: exports.openObjectStore,
		commit: function(){
			try{
				dbTransaction.commit();
			}
			finally{
				exports.currentTransaction = null;
			}
		},
		abort: function(){
			try{
				dbTransaction.abort();
			}
			finally{
				exports.currentTransaction = null;
			}
		}
	} 
	
};

exports.openObjectStore = function(name){
	var model = models[name];
	if(!model){
		throw new NotFoundError(name + " not found");
	}
	return model;
	
}

exports.registerRootStore = function(name, store, schema) {
	if(!schema) {
		schema = store;
		store = null;
	}
	models[name] = schema;
	return schema;
};

exports.classSchema = {};
exports.classModel = exports.Model("Class", require("./store/memory").Memory({index: schemas}), exports.classSchema);
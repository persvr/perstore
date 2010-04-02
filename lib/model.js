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
exports.SubModel = function(name, store, schema) {
	if(!schema){
		schema = store;
		store = null;
	}
	
	if(!store){
		store = JSFile((require("settings").dataFolder || "data") + "/" + name);
	}
	
	schema.id = name;
	
	if (schema.parentStore && schema.parentStore)
		schema.id = schema.parentStore.id + "/" + schema.id;
	store.id = schema.id;
	
	schemas[schema.id] = schema;
	if(typeof store.setSchema === "function"){
		store.setSchema(schema);
	}
	if(typeof schema !== "function"){ 
		schema = Permissive(store, schema);
	}
	defineProperty(schema, "transaction", {
		get: function(){
			return exports.currentTransaction;
		}
	});
	return schema;
};

exports.Model = function(name, store, schema) {
	return models[name] = exports.SubModel(name, store, schema);
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

exports.classSchema = {};
exports.classModel = exports.Model("Class", require("./store/memory").Memory({index: schemas}), exports.classSchema);

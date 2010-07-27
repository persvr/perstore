var Permissive = require("./facet").Permissive;

var stores = require("./stores"),
	registerStore = stores.registerStore,
	JSFile = require("./store/js-file").JSFile,
	NotFoundError = require("./errors").NotFoundError,
	defineProperty = require("commonjs-utils/es5-helper").defineProperty,
	JSONExt = require("commonjs-utils/json-ext"),
	fs = require("promised-io/fs");

exports.Store = function(name, store){
	exports.Model(name, store,  {});//(store.getSchema ? store.getSchema() : {});
}
exports.Model = function(store, schema) {
	if(typeof store == "string"){
		throw new Error("Models should no longer be named, remove the name argument");
	}
	if(!schema){
		schema = store;
		store = null;
	}

	if(!store){
		store = stores.DefaultStore();
	}

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


exports.transaction = function(){
	var dbTransaction = stores.transaction();
	return exports.currentTransaction = {
		get: exports.openObjectStore,
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
		},
		suspend: function(){
			dbTransaction.suspend();
		},
		resume: function(){
			dbTransaction.resume();
		}
	}

};

exports.initializeRoot = function(dataModel, noClass){
	function setPath(model, path, name){
		if(typeof model === "object"){
			for(var name in model){
				setPath(model[name], path ? path + '/' + name : name, name);
			}
		}
		else{
			if(model.setPath){
				model.setPath(path);
			}
			model.instanceSchema.id = name;
		}
	}
	if(!noClass){
		dataModel.Class = {instanceSchema: exports.modelSchema};
		dataModel.Class = exports.ModelsModel(dataModel);
	}
	setPath(dataModel);
};
exports.modelSchema = {
	maxLimit: Infinity,
	id: "Class"
};

exports.ModelsModel = function(models){
	var schemas = {};
	for(var i in models){
		schemas[i] = models[i].instanceSchema;
		Object.defineProperty(schemas[i], "schema", {
			value: exports.modelSchema,
			enumerable: false
		});
	}
	var modelStore = require("./store/memory").Memory({index: schemas});
	return exports.Model(modelStore, exports.modelSchema);
};
/*var classStore = require("./store/memory").Memory({index: schemas});
classStore.put = function(object, directives){
	fs.write("lib/model/" + object.id.toLowerCase() + ".js",
	'var Model = require("perstore/model").Model;\n' +
	'Model("' + object.id + '", ' + (directives.store || null) + ', ' + JSONExt.stringify(object) + ');');
	var oldApp = fs.read("lib/app.js");
	fs.write("lib/app.js", oldApp + '\nrequire("model/' + object.id + '");');
};
exports.classModel = exports.Model("Class", classStore, exports.classSchema);
*/
exports.getModelByPath = function(path) {
    return schemas[path];
    /*modelPath = modelPath.replace(/\./g, "/"); //FIXME remove
    var parts = modelPath.split("/");
    var model = exports.classModel.get(parts[0]);
    for (var i = 1; i < parts.length; i++) {
        model = model.get(decodeURIComponent(parts[i]));
    }
    return model;*/
};
exports.XXX = function() { print(Object.keys(models)) }
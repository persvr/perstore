var Permissive = require("./facet").Permissive;

var stores = require("./stores"),
	registerStore = stores.registerStore,
	JSFile = require("./store/js-file").JSFile,
	NotFoundError = require("./errors").NotFoundError,
	defineProperty = require("commonjs-utils/es5-helper").defineProperty,
	JSONExt = require("commonjs-utils/json-ext");
	fs = require("promised-io/fs");

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
		store = JSFile((require("commonjs-utils/settings").dataFolder || "data") + "/" + name);
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
		}
	}

};

exports.get = exports.openObjectStore = function(name){
	var model = models[name];
	if(!model){
		throw new NotFoundError(name + " not found");
	}
	return model;

}

exports.classSchema = {
	maxRange: Infinity
};
var classStore = require("./store/memory").Memory({index: schemas});
classStore.put = function(object, directives){
	fs.write("lib/model/" + object.id.toLowerCase() + ".js",
	'var Model = require("perstore/model").Model;\n' +
	'Model("' + object.id + '", ' + (directives.store || null) + ', ' + JSONExt.stringify(object) + ');');
	var oldApp = fs.read("lib/app.js");
	fs.write("lib/app.js", oldApp + '\nrequire("model/' + object.id + '");');
};
exports.classModel = exports.Model("Class", classStore, exports.classSchema);

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
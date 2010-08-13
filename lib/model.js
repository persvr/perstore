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
	if(typeof schema !== "function"){
		schema = Permissive(store, schema);
	}
	defineProperty(schema, "transaction", {
		get: function(){
			return exports.currentTransaction;
		}
	});
	if(typeof store.setSchema === "function"){
		store.setSchema(schema);
	}
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

var modelPaths = {};
exports.initializeRoot = function(dataModel, addClass){
	if(addClass){
		dataModel.Class = {instanceSchema: exports.modelSchema};
		dataModel.Class = exports.ModelsModel(dataModel);
	}
	modelPaths = {}; // reset model paths
	setPath(dataModel);
	dataModel.id = "root";
};
function setPath(model, path, name){
	if (!model) return;
	modelPaths[path] = model;
	for(var key in model){
		var target = model[key];
		// FIXME would be nice to have a brand to detect Facet
		if(typeof target === "object" || target && target._baseFacetedStore){
			var blacklist = [
				"extends",
				"_baseFacetedStore",
				"instanceSchema"
			];
			if (blacklist.indexOf(key) >= 0) continue;
			setPath(target, path ? path + '/' + key : key, key);
		}
	}
	if(model.setPath){
		model.setPath(path);
	}
	if(model.instanceSchema){
		model.instanceSchema.id = name;
	}
}

exports.createModelsFromModel = function(sourceModel, models, constructor){
	// this allows you to create a set of models from another source model. This makes
	// it easy to have a RESTful interface for creating new models
	constructor = constructor || exports.Model; 
	models = models || {};
	sourceModel.query("").forEach(createSchema);
	if(sourceModel.subscribe){
		sourceModel.subscribe("*").observe(function(events){
			createSchema(events.result); 
		});
	}
	function createSchema(schema){
		var name = schema.id;
		// TODO: get the path from the parent models
		setPath(models[name] = constructor(schema), name, name);
	}
	return models;
}

exports.modelSchema = {
	maxLimit: Infinity,
	id: "Class"
};

exports.ModelsModel = function(models){
	for(var i in models){
		schemas[i] = models[i].instanceSchema;
		if(typeof schemas[i] == "object"){
			Object.defineProperty(schemas[i], "schema", {
				value: exports.modelSchema,
				enumerable: false
			});
		}
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
	return modelPaths[path];
};

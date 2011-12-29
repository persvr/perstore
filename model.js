var Permissive = require("./facet").Permissive;

var DefaultStore = require("./stores").DefaultStore,
	transaction = require("./transaction").transaction,
	NotFoundError = require("./errors").NotFoundError,
	defineProperty = require("./util/es5-helper").defineProperty,
	JSONExt = require("./util/json-ext"),
	fs = require("promised-io/fs");

var Model = function(store, schema) {
	if(typeof store == "string"){
		throw new Error("Models should no longer be named, remove the name argument");
	}
	if(!schema){
		schema = store;
		store = null;
	}
	if(!store){
		store = DefaultStore();
	}
	if(typeof store.setSchema === "function"){
		store.setSchema(schema);
	}
	if(typeof schema !== "function"){
		schema = Permissive(store, schema);
	}
	defineProperty(schema, "transaction", {
		get: function(){
			return require("./transaction").currentTransaction;
		}
	});

	return schema;
};
Model.Model = Model;
Model.Store = function(store){
	return Model(store,  {});//(store.getSchema ? store.getSchema() : {});
}

var modelPaths = {};
Model.initializeRoot = function(dataModel, addClass){
	if(addClass){
		dataModel.Class = {instanceSchema: Model.modelSchema};
		dataModel.Class = Model.ModelsModel(dataModel);
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
		model.setPath(path || "root");
	}
	if(model.instanceSchema){
		model.instanceSchema.id = name;
	}
}

Model.createModelsFromModel = function(sourceModel, models, constructor){
	// this allows you to create a set of models from another source model. This makes
	// it easy to have a RESTful interface for creating new models
	constructor = constructor || Model; 
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

Model.modelSchema = {
	maxLimit: Infinity,
	id: "Class",
	properties:{
		schemaLinks: "http://json-schema.org/links"
	}
};

Model.ModelsModel = function(models){
	var schemas = {};
	for(var i in models){
		schemas[i] = models[i].instanceSchema;
		if(typeof schemas[i] == "object"){
			Object.defineProperty(schemas[i], "schema", {
				value: Model.modelSchema,
				enumerable: false
			});
		}
	}
	var modelStore = require("./store/memory").Memory({index: schemas});
	return Model.Model(modelStore, Model.modelSchema);
};
/*var classStore = require("./store/memory").Memory({index: schemas});
classStore.put = function(object, directives){
	fs.write("lib/model/" + object.id.toLowerCase() + ".js",
	'var Model = require("perstore/model").Model;\n' +
	'Model("' + object.id + '", ' + (directives.store || null) + ', ' + JSONExt.stringify(object) + ');');
	var oldApp = fs.read("lib/app.js");
	fs.write("lib/app.js", oldApp + '\nrequire("model/' + object.id + '");');
};
Model.classModel = Model.Model("Class", classStore, Model.classSchema);
*/
Model.getModelByPath = function(path) {
	return modelPaths[path];
};
module.exports = Model;
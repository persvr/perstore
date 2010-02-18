exports.Package = function(name, schema, options){
    options = options || {};
    schema = schema || {};
    var entityStores = {};
    schema.openObjectStore = function(storeName) {
        var store = entityStores[storeName];
        if(store){
            return store;
        }
    };
    if (!schema.SubPackage) {
        schema.SubPackage = function(name, subSchema) {
            subSchema = subSchema || {};
            subSchema.parentStore = model;
            return entityStores[name] = exports.Package(name, subSchema, {nested: true});
        };
    }
    if (!schema.SubModel) {
        schema.SubModel = function(name, store, subSchema) {
            subSchema = subSchema || {};
            subSchema.parentStore = model;
            return entityStores[name] = require("model").SubModel(name, store, subSchema);
        };
    }
    if (!options.nested) {
        var model = require("model").Model(name, {}, schema);
    }
    else {
        var model = require("model").SubModel(name, {}, schema);
    }
    return model;
};

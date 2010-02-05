exports.Package = function(name, schema){
    schema = schema || {};
    var entityStores = {};
    schema.openObjectStore = function(storeName) {
        // handle nested stores with nested paths
        var store = entityStores[storeName];
        if(store){
            return store;
        }
    };
    if (!schema.Package) {
        schema.Package = function(name, schema) {
            return entityStores[name] = require("model").SubModel(name, {}, schema);
        };
    }
    if (!schema.SubModel) {
        schema.SubModel = function(name, store, schema) {
            return entityStores[name] = require("model").SubModel(name, store, schema)
        };
    }
    return require("model").Model(name, {}, schema);
};

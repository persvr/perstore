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
        schema.SubPackage = function(name, schema) {
            return entityStores[name] = exports.Package(name, schema, {nested: true});
        };
    }
    if (!schema.SubModel) {
        schema.SubModel = function(name, store, schema) {
            return entityStores[name] = require("model").SubModel(name, store, schema);
        };
    }
    if (!options.nested) 
        return require("model").Model(name, {}, schema);
    return require("model").SubModel(name, {}, schema);
};

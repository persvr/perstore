exports.Package = function(name, store, schema, options){
    if (!store) {
        options = schema;
        schema = store;
        store = {};
    }
    schema = schema || {};
    options = options || {};
    var entityStores = {};
    schema.get = function(storeName) {
        var entityStore = entityStores[storeName];
        if(entityStore){
            return entityStore;
        }
    };
    if (!schema.SubPackage) {
        schema.SubPackage = function(name, subStore, subSchema) {
            subSchema = subSchema || {};
            subSchema.parentStore = model;
            return entityStores[name] = exports.Package(name, subStore, subSchema, {nested: true});
        };
    }
    if (!schema.SubModel) {
        schema.SubModel = function(name, subStore, subSchema) {
            subSchema = subSchema || {};
            subSchema.parentStore = model;
            return entityStores[name] = require("./model").SubModel(name, subStore, subSchema);
        };
    }
    if (!options.nested) {
        var model = require("./model").Model(name, store, schema);
    }
    else {
        var model = require("./model").SubModel(name, store, schema);
    }
    return model;
};

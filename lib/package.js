exports.Package = function(name, options){
    options = options || {};
    var entityStores = options.entityStores || {};
    var schema = {
        openObjectStore: function(storeName){
            // handle nested stores with nested paths
            var store = entityStores[storeName];
            if(store){
                return store;
            }
        },
        Package: function(name, schema, options) {
            options = options || {};
            options.nested = true;
            return entityStores[name] = exports.Package(name, schema, options);
        },
        Model: function(name, store, schema, options) {
            options = options || {};
            options.nested = true;
            return entityStores[name] = require("model").Model(name, store, schema, options);
        }
    };
    if (!options.nested) require("model").registerRootStore(name, schema);
    return schema;
};

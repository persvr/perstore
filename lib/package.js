exports.Package = function(name, entityStores){
    return {
        openObjectStore: function(storeName){
            // handle nested stores with nested paths
            var store = entityStores[storeName];
            if(store){
                return store;
            }
        }
    };
};

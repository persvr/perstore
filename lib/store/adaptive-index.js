/**
 * This will be a wrapper store to implement adaptive indexing
 */
var parseQuery = require("../resource-query").parseQuery,
    when = require("promised-io/promise").when,
    setInterval = require("browser/timeout").setInterval,
    settings = require("settings");

settings = settings || {};
settings = settings.adaptiveIndexing || {};

exports.AdaptiveIndex = function(store, options) {
    /**
     * In order to wrap a store with adaptive indexing the underlying store must
     * implement a setIndex function. If setIndex is not idempotent stores may
     * implement a getIndex function to prevent breaking existing indexes.
     *
     * For storage efficiency the adaptive indexer should be able to remove
     * indexes which go unused for extended periods. An underlying store can
     * implement a removeIndex function to facilite this.
     *
     * For each indexed property timestamps of when the index was first tracked
     * and when the index was last utilized are kept, as well as total accesses.
     *
     * These statistics are kept in memory for now, so every server restart will
     * flush them. A better approach would be to allow a store to be passed in
     * via the options object to keep the stats persistent. Stats need not be
     * flushed to the store on every query and could be buffered.
     */
    
    if (typeof store.setIndex !== "function")
        throw new Error("Adaptive indexing requires store to implement a setIndex function"); // what kind of error?
    
    options = options || {};
    
    // instantiates the statistics object where index accesses are tracked
    options.statistics = options.statistics || {};
    
    // defines the default length of time an index can go unused before removal
    options.idlePeriod = options.idlePeriod || settings.idlePeriod || 604800000;
    
    // an expiration function can be provided which gets all the stats and options
    var expireIndexes = options.expireIndexes || function(store, options) {
        var stats = options.statistics;
        for (var i in stats) {
            if (new Date() - stats[i].lastAccess > options.idlePeriod) {
                when(store.removeIndex(i),
                    function() {
                        delete stats[i];
                        delete store.indexedProperties[i];
                    },
                    function(e) {
                        print("Failed removing index for " + i + ": " + e); //TODO store.id?
                    }
                );
            }
        }
    }
    
    // defines the wait interval between running the method to expire indexes
    options.expirationInterval = options.expirationInterval || settings.expirationInterval || 3600000;
    if (typeof store.removeIndex === "function") {
        expireIndexes(store, options);
        setInterval(function() {
            expireIndexes(store, options);
        }, options.expirationInterval);
    }
    
    // reference the currently-defined store
    var wrapper = {};
    for (var key in store) {
        wrapper[key] = store[key];
    }
    
    // add a catchall in case the underlying store changes out from under us
    wrapper.__noSuchMethod__ = function(name, params) {
        return store[name].apply(store, params);
    }
    
    function updateStatistics(i) {
        var now = new Date();
        var stats = options.statistics;
        if (stats[i]) {
            stats[i].lastAccess = now;
            stats[i].counter++;
        }
        else {
            var currentIndex = store.getIndex && store.getIndex(i) || null;
            when(currentIndex, function(response) {
                // don't try to create the index if it exists
                if (response) {
                    // TODO confirm index is right, e.g. unique, collation?
                    // index already exists, add to stats
                    stats[i] = {
                        created: now,
                        lastAccess: now,
                        counter: 1
                    }
                    store.indexedProperties[i] = "adaptive";
                }
                else {
                    // index may not exist, try to create it
                    if (typeof store.setIndex !== "function")
                        throw new Error("Adaptive indexing requires store to implement a setIndex function"); // what kind of error?
                    when(store.setIndex(i),
                        function() {
                            stats[i] = {
                                created: now,
                                lastAccess: now,
                                counter: 1
                            }
                            store.indexedProperties[i] = "adaptive";
                        },
                        function(e) {
                            print("Failed setting index for " + i + ": " + e); //TODO store.id?
                        }
                    );
                }
            });
        }
    }
    
    wrapper.query = function(query, options) {
        if (typeof query === "string") query = parseQuery(query);
        var indexedProperties = store.indexedProperties;
        // for each query item log its usage, if it doesn't exist create it
        query.forEach(function(component) {
            if (component.type === "call" && component.name === "sort") {
                component.parameters.forEach(function(parameter) {
                    if (parameter.charAt(0) === "+" || parameter.charAt(0) === "-") {
                        parameter = parameter.substring(1);
                    }
                    if (!(parameter in store.indexedProperties))
                        updateStatistics(parameter);
                });
            }
            else if (component.type === "comparison") {
                if (!(component.name in store.indexedProperties))
                    updateStatistics(component.name);
            }
        });
        
        return store.query(query, options)
    }
    
    return wrapper;
};

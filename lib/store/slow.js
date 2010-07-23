/**
 * This is a wrapper store that makes all the operations slow to help debug and test asynchronicity
 */
var defer = require("promised-io/promise").defer;
exports.Slow = function(store, delay){
	["get", "put", "query"].forEach(function(i){
		var method = store[i];
		store[i] = function(){
			var results = method.apply(store, arguments);
			var deferred = defer();
			setTimeout(function(){
				deferred.resolve(results);
			},delay || 1000);
			return deferred.promise;
		}
	});
	return store;
};
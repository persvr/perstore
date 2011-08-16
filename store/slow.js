/**
 * This is a wrapper store that makes all the operations slow to help debug and test asynchronicity
 */
require.def||(require.def=function(deps, factory){module.exports = factory.apply(this, deps.map(require));});
require.def(["promised-io/promise"],function(promise){
var defer = promise.defer;
function Slow(store, delay){
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
Slow.Slow = Slow;
return Slow;
});
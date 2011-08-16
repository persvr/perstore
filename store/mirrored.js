/**
*Takes a set of stores and writes to all. 
*/
exports.Mirrored = function(primary, replicas, options){
	options = options || {};
	var store = Object.create(primary);
	store.put = function(object, directives){
		var id = primary.put(object, directives);
		replicas.forEach(function(replica){
			replica.put(object, directives); // do a PUT because we require an exact replica
		});
		return id;
	};
	["delete", "subscribe", "startTransaction", "commitTransaction", "abortTransaction"].forEach(function(methodName){
		store[methodName] = options.replicateFirst ? 
		function(){
			var returned;
			replicas.forEach(function(replica){
				returned = replica[methodName] && replica[methodName].apply(primary, arguments);
			});
			primary[methodName] && primary[methodName].apply(primary, arguments);
			return returned;
		} :
		function(){
			var returned = primary[methodName] && primary[methodName].apply(primary, arguments);
			replicas.forEach(function(replica){
				replica[methodName] && replica[methodName].apply(primary, arguments);
			});
			return returned;
		}
	});
	replicas.forEach(function(replica){
		if(replica.subscribe){
			replica.subscribe("", function(action){
				primary[action.event](action.body);
			});
		}
	});
	return store;
};
/**
 * This should wrap data stores that connect to a central repository, in order
 * to distribute data change notifications to all store subscribers.
 */
var getChildHub = require("tunguska/hub").getChildHub,
	when = require("promised-io/promise").when;

exports.Notifying = function(store, options){
	if(store.subscribe){
		// already notifying
		return store;
	}
	var hub;
	var localHub;
	var originalSetPath = store.setPath;
	store.setPath = function(id){
		hub = getChildHub(id);
		localHub = hub.fromClient("local-store");
		if(originalSetPath){
			originalSetPath(id);
		}
	};
	store.subscribe = function(path, directives){
		var clientHub = hub;
		if(directives && directives['client-id']){
			clientHub = hub.fromClient(directives['client-id']);
		}
		return clientHub.subscribe(path, /*directives.body || */["put", "delete"]);
	};
	store.unsubscribe = function(path, directives){
		var clientHub = hub;
		if(directives['client-id']){
			clientHub = hub.fromClient(directives['client-id']);
		}
		return clientHub.unsubscribe(path, ["put", "delete"]);
	};
	var originalPut = store.put;
	if(originalPut){
		store.put= function(object, directives){
			if(options && options.revisionProperty){
				object[options.revisionProperty] = (object[options.revisionProperty] || 0) + 1; 
			}
			var result = originalPut(object, directives) || object.id;
			if(directives && directives.replicated){
				return result;
			}
			return when(result, function(id){
				localHub.publish({
					channel: id,
					result: object,
					type: "put"
				});
				return id;
			});
		};
	}
	var originalAdd = store.add;
	if(originalAdd){
		store.add= function(object, directives){
			var result = originalAdd(object, directives) || object.id;
			if(directives.replicated){
				return result;
			}		
			return when(result, function(id){
				localHub.publish({
					channel: id,
					result: object,
					type: "put"
				});
				return id;
			});
		};
	}
	var originalDelete = store["delete"];
	if(originalDelete){
		store["delete"] = function(id, directives){
			var result = originalDelete(id, directives);
			if(directives.replicated){
				return result;
			}
			return when(result, function(){
				localHub.publish({
					channel: id,
					type: "delete"
				});
			});
		};
	}
	return store;
};

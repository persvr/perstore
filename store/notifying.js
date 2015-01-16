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
		return clientHub.subscribe(path, /*directives.body || */["add", "put", "delete"]);
	};
	store.unsubscribe = function(path, directives){
		var clientHub = hub;
		if(directives && directives['client-id']){
			clientHub = hub.fromClient(directives['client-id']);
		}
		return clientHub.unsubscribe(path, ["add", "put", "delete"]);
	};
	var originalPut = store.put;
	if(originalPut){
		store.put= function(object, directives){
			if(options && options.revisionProperty){
				object[options.revisionProperty] = (object[options.revisionProperty] || 0) + 1;
			}
			var result = originalPut.call(this, object, directives) || object.id;
			if(directives && directives.replicated){
				return result;
			}

			var publishHub = localHub;
			if(directives && directives['client-id']){
				publishHub = hub.fromClient(directives['client-id']);
			}

			return when(result, function(id){
				publishHub.publish({
					channel: id,
					result: object,
					type: directives && directives.overwrite === false ? "add" : "put"
				});
				return id;
			});
		};
	}
	var originalAdd = store.add;
	if(originalAdd){
		store.add= function(object, directives){
			var result = originalAdd.call(this, object, directives) || object.id;
			if(directives && directives.replicated){
				return result;
			}

			var publishHub = localHub;
			if(directives && directives['client-id']){
				publishHub = hub.fromClient(directives['client-id']);
			}

			return when(result, function(id){
				publishHub.publish({
					channel: id,
					result: object,
					type: "add"
				});
				return id;
			});
		};
	}
	var originalDelete = store["delete"];
	if(originalDelete){
		store["delete"] = function(id, directives){
			var result = originalDelete.call(this, id, directives);
			if(directives && directives.replicated){
				return result;
			}

			var publishHub = localHub;
			if(directives && directives['client-id']){
				publishHub = hub.fromClient(directives['client-id']);
			}

			return when(result, function(){
				publishHub.publish({
					channel: id,
					type: "delete"
				});
			});
		};
	}
	return store;
};

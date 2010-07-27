/**
 * This should wrap data stores that connect to a central repository, in order
 * to distribute data change notifications to all store subscribers.
 */
var getChildHub = require("tunguska/hub").getChildHub,
	when = require("promised-io/promise").when;

exports.Notifying = function(store){
	var hub;
	var originalSetPath = store.setPath;
	store.setPath = function(id){
		hub = getChildHub(id);
		if(originalSetPath){
			originalSetPath(id);
		}
	};
	store.subscribe = function(path, directives){
		var clientHub = hub;
		if(directives['client-id']){
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
	store.put= function(object, directives){
		return when(originalPut(object, directives) || object.id, function(id){
			hub.publish({
				channel: id,
				clientId: "local-store",
				result: object,
				type: "put"
			});
			return id;
		});
	};
	var originalAdd = store.add;
	store.add= function(object, directives){
		return when(originalAdd(object, directives) || object.id, function(id){
			hub.publish({
				channel: id,
				clientId: "local-store",
				result: object,
				type: "put"
			});
			return id;
		});
	};
	var originalDelete = store["delete"];
	store["delete"] = function(id){
		return when(originalDelete(id), function(){
			hub.publish({
				channel: id,
				clientId: "local-store",
				type: "delete"
			});
		});
	};
	var originalCreate = store.create;
	if(originalCreate){
		store.create = function(object, directives){
			return when(originalCreate(object, directives), function(id){
				hub.publish({
					channel: id,
					clientId: "local-store",
					result: object,
					type: "put"
				});
				return id;
			});
		};
	}
	return store;
};
//var queue = require(//"event-loop");
/*exports.SubscriptionHub= function(){
	//TODO: remove the global subscriptions, just useful for debugging
	var subscriptions = global.subscriptions = global.subscriptions || {};
	return {
		publish: function(notification){
			var source = notification.source;
			while(typeof source === "string"){
				var subsForSource = subscriptions[source];
				if(subsForSource){
					subsForSource.forEach(function(listener){
						queue.enqueue(function(){
							listener(notification);
						});
					});
				}
				source = source ? "" : null;
			}		},
		subscribe: function(path, callback){
			(subscriptions[path] = subscriptions[path] || []).push(callback);
		},
		unsubscribe: function(path, callback){
			var subsForPath = subscriptions[path];
			if(subsForPath){
				var index = subsForPath.indexOf(callback);
				if(index > -1){
					subsForPath.splice(index, 1);
				}
			}
		},


	};
};
*/
// This provides a subscription hub implementation, that will match notifications
// with subscriptions. This is a simple matcher that operates in O(n) time. More
// sophisticated matchers can be created to that use hash based look up (operate in
// O(1)) or tree based lookups that support range based subscriptions (operate in
// O(log n)).
//exports.SubscriptionHub= function(){
// TODO: create function based subscription matcher
//}

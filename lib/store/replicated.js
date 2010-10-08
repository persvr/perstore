/**
*Replicates this store based on incoming data change messages from the pubsub hub. 
*/
var Notifying = require("./notifying").Notifying,
	when = require("promised-io/promise").when,
	connector = require("tunguska/connector");
	
exports.Replicated = function(store, options){
	var originalPut = store.put;
	var originalDelete = store["delete"];
	var notifyingStore = Notifying(store);
	options = options || {};
	var originalSetPath = store.setPath;
	notifyingStore.setPath = function(path){
		if(originalSetPath){
			originalSetPath.call(store, path);
		}
		var subscription = notifyingStore.subscribe("**", {"client-id": "local-store"});
		when(subscription, function(){
			if(store.getRevision){
				// if the store supports indicating its revision, than we can try to query it's 
				// replicas for revisions since the last time it was synced 
				var revision = store.getRevision();
				var revisionPath = path + "/?revisions(" + revision + ")"; 
				connector.on("connection", function(connection){
					// request the revisions since last sync
					connection.send({
						method: "get",
						to: revisionPath 
					});
					var listener = connection.on("message", function(message){
						if(message.from == revisionPath){
							// got the response, don't need to listen anymore
							listener.dismiss();
							// iterate through the results, making updates to our underlying store.
							message.result.forEach(function(revision){
								if(revision.__deleted__){
									store["delete"](revision.__deleted__);
								}
								else{
									store.put(revision);
								}
							});
						}
					});
				});
			}
			subscription.on("message" , function(message){
				// listen for subscriptions to update our local store
				if(options.checkUpdate){
					options.checkUpdate(message);
				}
				if(message.type == "put"){
					return originalPut.call(store, message.result, {id: message.channel, replicated: true});	
				}else if(message.type == "delete"){
					return originalDelete.call(store, message.channel, {replicated: true});
				}else{
					throw new Error("unexpected message type");
				}
			});
		});
	};
	return notifyingStore;
};
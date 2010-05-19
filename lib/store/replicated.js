/**
*Replicates this store based on incoming data change messages from the pubsub hub. 
*/
var Notifying = require("./notifying").Notifying;
exports.Replicated = function(store, options){
	var notifyingStore = Notifying(store);
	onPut.clientId = "local-store"; // or ["local-store", "local-workers"] if machine replication (without worker replication)
	notifyingStore.subscribe("**", "put", onPut);
	onDelete.clientId = "local-store";
	notifyingStore.subscribe("**", "delete", onDelete);
	
	function onPut(message){
		return store.put(message.result, {id:message.channel});
	}
	function onDelete(){
		return store["delete"](message.channel);
	}
	return notifyingStore;
};
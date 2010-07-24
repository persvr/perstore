/**
 * This is manager for the interaction between faceted data in the form of JavaScript
 * objects and the underlying data stores. 
 */
exports.DefaultStore = function(){
	return require("./store/memory").Persistent();
};

var stores = {};
var storesForDefault = {};
var defaultDatabase = {
	transaction: function(){
		// these for independent stores, and the main transaction handler calls the commit and abort for us
		//TODO: Should this functionality be switched the main transaction handler?
		return {
			commit: function(){},
			abort: function(){},
			resume: function(){},
			suspend: function(){}
		};
	},
	id:0
};
var NotFoundError = require("./errors").NotFoundError;
	
var nextDatabaseId = 1;
exports.registerDatabase = function(database, storeNames){
	var previousDatabase = defaultDatabase;
	while(previousDatabase.nextDatabase){
		previousDatabase = previousDatabase.nextDatabase
	}
	previousDatabase.nextDatabase = database;
	database.id = nextDatabaseId++; 
};

var transactions = {};

exports.transaction = function(){
	var database = defaultDatabase;
	do{
		transactions[database.id] = database.transaction();
	}while(database = database.nextDatabase);
	var transaction, usedStores = [];
	return transaction = exports.currentTransaction = {
		usedStores: usedStores,
		commit: function(){
			try{
				for(var i in transactions){
					if(transactions[i].requestCommit){
						transactions[i].requestCommit();
					}
				}
				for(var i in usedStores){
					if(usedStores[i].requestCommit){
						transactions[i].requestCommit();
					}
				}
				for(var i in transactions){
					transactions[i].commit();
				}
				for(var i in usedStores){
					if(usedStores[i].commit){
						usedStores[i].commit();
					}
				}
				var success = true;
				exports.currentTransaction = null;
			}finally{
				if(!success){
					this.abort();
				}
			}				
		},
		abort: function(){
			try{
				for(var i in transactions){
					transactions[i].abort();
				}
				for(var i in usedStores){
					if(usedStores[i].abort){
						usedStores[i].abort();
					}
				}
			}
			finally{
				exports.currentTransaction = null;
			}
		},
		suspend: function(){
			try{
				for(var i in transactions){
					transactions[i].suspend();
				}
				for(var i in usedStores){
					if(usedStores[i].suspend){
						usedStores[i].suspend();
					}
				}
			}
			finally{
				exports.currentTransaction = null;
			}
		},
		resume: function(){
			exports.currentTransaction = transaction; 
			for(var i in transactions){
				transactions[i].resume();
			}
			for(var i in usedStores){
				if(usedStores[i].resume){
					usedStores[i].resume();
				}
			}
		}
	};
};
var nextStoreId = 0;
exports.AutoTransaction = function(store, database){
	database = database || defaultDatabase;
	for(var i in store){
		if(typeof store[i] === "function" && i != "transaction" && i != "setSchema"){
			(function(i, defaultMethod){
				store[i] = function(){
					if(!exports.currentTransaction){
						var autoTransaction = exports.transaction();
					}
					try{
						if(!store.id){
							store.id = "__auto__" + (nextStoreId++);
						}
						if(!exports.currentTransaction.usedStores[store.id] && store.transaction){
							exports.currentTransaction.usedStores[store.id] = store.transaction();
						}
						var returnValue = defaultMethod.apply(store, arguments);
						var finished = true;
					}
					finally{
						if(autoTransaction){
							autoTransaction[finished ? "commit" : "abort"]();
						}
					}
					return returnValue;
				};
			})(i, store[i]);
		}
	}
	return store;
}


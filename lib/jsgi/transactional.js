/**
 * This executes the next app in a transaction, adding a transaction object
 * as the interface for accessing persistent and commiting the transaction
 * if successful, otherwise if an error is thrown, the transaction will be aborted
 */
exports.Transactional = Transactional;
var promiseModule = require("promised-io/promise"),
	when = promiseModule.when,
	model = require("../model");

function Transactional(database, nextApp){
	return function(request){
		if(request.jsgi.multithreaded){
			print("Warning: Running in a multithreaded environment may cause non-deterministic behavior");
		}
		var transaction = request.transaction = model.transaction();
		var context = request.context;
		if(!context){
			context = promiseModule.currentContext = request.context = {};
		}
		context.resume = function(){
			// getters and setters on the database should intercept this and trigger per-database transaction changes
			model.currentTransaction = transaction;
		};
		context.suspend = function(){
			model.currentTransaction = null;
		};
		
		try{
			var response = when(nextApp(request), function(response){
				return response;
			}, function(e){
				transaction.abort();
				throw e;
			});
			return response;
		}
		finally{
			if(response){
				transaction.commit();
			}
			else{
				transaction.abort();
			}
		}
	};
}


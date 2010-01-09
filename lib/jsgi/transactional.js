/**
 * This executes the next app in a transaction, adding a transaction object
 * as the interface for accessing persistent and commiting the transaction
 * if successful, otherwise if an error is thrown, the transaction will be aborted
 */
exports.Transactional = Transactional;
var when = require("promise").when,
	contextModule = require("../util/context");

function Transactional(database, nextApp){
	return function(request){
		if(request.jsgi.multithreaded){
			print("Warning: Running in a multithreaded environment may cause non-deterministic behavior");
		}
		var transaction = request.transaction = database.transaction();
		var context = request.context;
		if(!context){
			context = contextModule.currentContext = request.context = {};
		}
		context.onResume = function(){
			database.currentTransaction = transaction;
		};
		context.onSuspend = function(){
			database.currentTransaction = null;
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
		
		return response;
	};
}


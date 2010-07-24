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
		context.resume = transaction.resume;
		context.suspend = transaction.suspend;
		var committing;
		function done(){
			delete context.resume;
			delete context.suspend;
		}
		try{
			var response = when(nextApp(request), function(response){
				committing = true;
				done();
				transaction.commit();
				return response;
			}, function(e){
				done();
				transaction.abort();
				throw e;
			});
			return response;
		}
		finally{
			if(response){
				if(!committing){
					transaction.suspend();
				}
			}
			else{
				done();
				transaction.abort();
			}
		}
	};
}


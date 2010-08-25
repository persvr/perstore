/**
 * This executes the next app in a transaction, adding a transaction object
 * as the interface for accessing persistent and commiting the transaction
 * if successful, otherwise if an error is thrown, the transaction will be aborted
 */
exports.Transactional = Transactional;
var transaction = require("../transaction").transaction;

function Transactional(nextApp){
	return function(request){
		if(request.jsgi.multithreaded){
			print("Warning: Running in a multithreaded environment may cause non-deterministic behavior");
		}
		return transaction(function(){
			return nextApp(request);
		});
	};
}


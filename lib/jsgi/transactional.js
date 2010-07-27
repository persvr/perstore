/**
 * This executes the next app in a transaction, adding a transaction object
 * as the interface for accessing persistent and commiting the transaction
 * if successful, otherwise if an error is thrown, the transaction will be aborted
 */
exports.Transactional = Transactional;
var stores = require("../stores");

function Transactional(database, nextApp){
	return function(request){
		if(request.jsgi.multithreaded){
			print("Warning: Running in a multithreaded environment may cause non-deterministic behavior");
		}
		return stores.transaction(function(){
			return nextApp(request);
		});
	};
}


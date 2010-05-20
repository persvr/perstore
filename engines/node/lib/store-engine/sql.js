/**
 * This is an SQL database engine for Node
 * based on http://www.w3.org/TR/webdatabase/
 * Currently only supports Postgres
 */

var defer = require("promise").defer;
exports.SQLDatabase = function(parameters){
	var connectionProvider;
	if(parameters.type == "postgres"){
		currentConnection = require("postgres").createConnection; 
	}
	else if(parameters.type == "mysql"){
		currentConnection = new (require("jar:http://github.com/masuidrive/node-mysql/zipball/master!/lib/mysql.js")
			.Connection)(parameters.host, parameters.name, parameters.username, parameters.password); 
	}
	else if(parameters.type == "sqlite"){
		currentConnection = new (require("jar:http://github.com/orlandov/node-sqlite/zipball/master!/lib/sqlite.js")
			.Connection)(parameters.host, parameters.name, parameters.username, parameters.password); 
	}
	else{
		throw new Error("Unsupported database engine");
	}
	var currentConnection;
	return {
		executeSql: function(query, parameters){
			var deferred = defer();
			// should roughly follow executeSql in http://www.w3.org/TR/webdatabase/
			currentConnection.query(query,function(results){
					deferred.resolve({
						rows: results
					});
				}, deferred.reject);
			return deferred.promise;
		},
		transaction: function(){
			//currentConnection = connectionProvider(parameters); 
			return {
				commit: function(){
					/*currentConnection.query("COMMIT");
					currentConnection.close();*/
				},
				abort: function(){
					/*currentConnection.query("ABORT");
					currentConnection.close();*/
				}
			};
		}
	};	
}


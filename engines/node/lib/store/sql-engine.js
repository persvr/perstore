/**
 * This is an SQL database engine for Node
 * based on http://www.w3.org/TR/webdatabase/
 * Currently only supports Postgres
 */


exports.SQLDatabase = function(parameters){
	var connectionProvider;
	if(parameters.type == "postgres"){
		connectionProvider = require("postgres").createConnection; 
	}
	else{
		throw new Error("Unsupported database engine");
	}
	var currentConnection;
	return {
		executeSql: function(query, parameters){
			// should roughly follow executeSql in http://www.w3.org/TR/webdatabase/
			currentConnection.query(query).then(function(results){
				return {
					rows: results
				};
			});
		},
		transaction: function(){
			currentConnection = connectionProvider(parameters); 
			return {
				commit: function(){
					currentConnection.query("COMMIT");
					currentConnection.close();
				},
				abort: function(){
					currentConnection.query("ABORT");
					currentConnection.close();
				}
			};
		}
	};	
}


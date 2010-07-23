/**
 * This is an SQL database engine for Node
 * based on http://www.w3.org/TR/webdatabase/
 * Currently only supports Postgres
 */

var defer = require("promised-io/promise").defer,
	LazyArray = require("promised-io/lazy-array").LazyArray,
	valueToSQL = require("perstore/store/sql").valueToSQL;
	
exports.SQLDatabase = function(parameters){
	var connectionProvider;
	if(parameters.type == "postgres"){
		currentConnection = require("postgres").createConnection; 
	}
	else if(parameters.type == "mysql"){
/*		currentConnection = new (require("jar:http://github.com/masuidrive/node-mysql/zipball/master!/lib/mysql.js")
			.Connection)(parameters.host || "localhost", parameters.username, parameters.password, parameters.name, parameters.port || 8889);
		currentConnection.connect();*/ 
		myConn = require("jar:http://github.com/Sannis/node-mysql-libmysqlclient/zipball/master!/mysql-libmysqlclient.js")
				.createConnection(parameters.host || "localhost", parameters.username, parameters.password, parameters.name, parameters.port || 8889, "/Applications/MAMP/tmp/mysql/mysql.sock");
		if(!myConn.connected()){
			throw new Error("Connection error #" + myConn.connectErrno() + ": " + myConn.connectError());
		}
		
		currentConnection = {
			query: function(query, callback, errback){
		require("sys").puts("query" + query);
				var response = myConn.query(query);
		require("sys").puts("response" + response);
			    if(response === false) {
					errback(new Error("Query error #" + myConn.errno() + ": " + myConn.error()));
				}if(response === true){
					callback(true);
				}else{
					callback(LazyArray({
						some: function(callback){
							var object;
							while(object = response.fetchObject()){
								if(callback(object)){
									break;
								}
							}
						}
					}));
				}
			}
		}
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
			var i = 0;
			query = query.replace(/\\?\?/g,function(param){
				if(param == "?"){
					return valueToSQL(parameters[i++]);
				}
			});
			var deferred = defer();
			// should roughly follow executeSql in http://www.w3.org/TR/webdatabase/
			currentConnection.query(query,function(results){
					deferred.resolve({
						rows: results
					});
				}, deferred.reject
				);
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


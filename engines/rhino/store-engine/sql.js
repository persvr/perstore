/**
 * This is an SQL database engine for Rhino
 * based on http://www.w3.org/TR/webdatabase/
 * This relies on the jar file included with Perstore
 */

addToClasspath(module.resolve("../jars/commons-dbcp-1.2.2.jar"));
addToClasspath(module.resolve("../jars/commons-pool-1.5.2.jar"));
addToClasspath(module.resolve("../jars/perstore.jar"));
var LazyArray = require("promised-io/lazy-array").LazyArray;
var drivers = {
	mysql: "com.mysql.jdbc.Driver",
	sqlite: "org.sqlite.JDBC",
	derby: "org.apache.derby.jdbc.EmbeddedDriver",
	hsqldb: "org.hsqldb.jdbcDriver",
	oracle: "oracle.jdbc.driver.OracleDriver",
	postgres: "org.postgresql.Driver",
	mssql: "net.sourceforge.jtds.jdbc.Driver"
}
exports.SQLDatabase = function(parameters){
	var adapter = new Packages.org.persvr.store.SQLStore();
	if(drivers[parameters.type]){
		parameters.driver = drivers[parameters.type]; 
	}
	adapter.initParameters(parameters);
	return {
		executeSql: function(query, parameters, callback, errback){
			// should roughly follow executeSql in http://www.w3.org/TR/webdatabase/
			try{
				var rawResults = adapter.executeSql(query, parameters);
				var results = {rows:LazyArray(rawResults)};
				if(rawResults.insertId){
					results.insertId = rawResults.insertId; 
				}
			}catch(e){
				return errback(e);
			}
			callback(results);
		},
		transaction: function(){
			adapter.startTransaction();
			return {
				commit: function(){
					adapter.commitTransaction();
				},
				abort: function(){
					adapter.abortTransaction();
				}
			};
		}
	};	
}


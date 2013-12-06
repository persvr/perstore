/**
 * This is an SQL database engine for Node
 * based on http://www.w3.org/TR/webdatabase/
 * Currently only supports MySQL.
 */

var DatabaseError = require('perstore/errors').DatabaseError,
	DuplicateEntryError = require('perstore/errors').DuplicateEntryError;

var engines = {
	mysql: MysqlWrapper
};

exports.SQLDatabase = function(params) {
	if (params.type in engines)
		return engines[params.type](params);
	throw new DatabaseError("Unsupported database engine");
};

function MysqlWrapper(params) {
	var currentConnection;
	var x=0;

	return {
		executeSql: function(query, args, callback, errback) {
			var conn = currentConnection;
			if(!conn) {
				errback(new DatabaseError("No transactional context has been created"));
				return;
			}
			var cmd = conn.execute(query,args,function(err,_rows,_fields) {
				if(err) {
					if(errback) {
						var patt=/^duplicate entry/ig;
						if(err && patt.test(err)) {
							errback(new DuplicateEntryError(err));
						} else {
							errback(err);
						}
					}
				} else {
					if(callback) {
						callback({
							insertId: conn.insertId,
							rowsAffected: conn.affectedRows,
							rows: _rows
						});
					}
				}
			});
		},
		transaction: function() {
			var conn = connectMysql(params);
			currentConnection = conn;
			conn.query('SET autocommit=0;', function(err) {
				if(err) throw new DatabaseError(err);
			});
			conn.query('BEGIN', function(err) {
				if(err) throw new DatabaseError(err);
			});

			return {
				commit: function() {
					conn.query("COMMIT", function(err) {
						if(err) throw new DatabaseError(err);
					});
					conn.end();
				},
				abort: function() {
					conn.query("ROLLBACK", function(err) {
						if(err) throw new DatabaseError(err);
					});
					conn.end();
				},
				suspend: function(){
					currentConnection = null;
				},
				resume: function(){
					currentConnection = conn;
				}
			};
		}
	};

	function connectMysql(params) {
		// retain compatibility, database property shouldn't be overwritten
		params.database = params.name;
		if(params.pass) params.password = params.pass;
		var ret = require("mysql2").createConnection(params);
		ret.connect(function(err) {
			if(err) throw new DatabaseError(err);
		});
		return ret;
	}
}

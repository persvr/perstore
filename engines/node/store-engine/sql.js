/**
 * This is an SQL database engine for Node
 * based on http://www.w3.org/TR/webdatabase/
 * Currently only supports MySQL.
 */

var DatabaseError = require('perstore/errors').DatabaseError;

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

	// adapted from http://github.com/sidorares/nodejs-mysql-native/lib/mysql-native/websql.js
	return {
		executeSql: function(query, args, callback, errback) {
            var conn = currentConnection;
            if(!conn) {
                errback(new DatabaseError("No transactional context has been created"));
                return;
            }
			if (!conn.clean) {
				errback(new DatabaseError("Cannot commit a transaction with an error"));
				return;
			}
			var charset = require("mysql-native/lib/mysql-native/charset").Charset.by_name(conn.get("charset"));
			if(charset && charset.name=="utf8") conn.execute("SET NAMES utf8");
			var cmd = conn.execute(query,args);

			cmd.on('result', function() {
				if (conn.clean && callback) {
					callback({
						insertId: cmd.result.insert_id,
						rowsAffected: cmd.result.affected_rows,
						rows: cmd.result.rows
					});
				}
			});
			cmd.on('error', function(err) {
				conn.clean = false;
				if (errback)
					errback(err);
			});
		},
		transaction: function() {
			var conn = connectMysql(params);
            currentConnection = conn;
			throwOnError(conn.query('SET autocommit=0;'), 'disable autocommit');
			throwOnError(conn.query('BEGIN'), 'initialize transaction');

			return {
				commit: function() {
					throwOnError(conn.query("COMMIT"), 'commit SQL transaction');
					throwOnError(conn.close(), 'close connection');
				},
				abort: function() {
					throwOnError(conn.query("ROLLBACK"), 'rollback SQL transaction');
					throwOnError(conn.close(), 'close connection');
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

	function throwOnError(cmd, action) {
		cmd.on('error', function(err) {
			console.log('Failed to ' + action +
				(err && err.message ? ': ' + err.message : ''));
			throw new DatabaseError('Failed to ' + action +
				(err && err.message ? ': ' + err.message : ''));
		});
	}

	function connectMysql(params) {
		var ret = require("mysql-native/lib/mysql-native/client").createTCPClient(params.host, params.port);
		ret.auto_prepare = true;
		ret.row_as_hash = true;
		ret.clean = true;

		throwOnError(ret.connection, 'connect to DB');
		throwOnError(ret.auth(params.name, params.username, params.password), 'authenticate');

		return ret;
	}
}

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
	var conn;

	// adapted from http://github.com/sidorares/nodejs-mysql-native/lib/mysql-native/websql.js
	return {
		executeSql: function(query, args, callback, errback) {
			if (!conn.clean) {
				errback(new DatabaseError("Cannot commit a transaction with an error"));
				return;
			}
			var cmd = conn.query(query, args),
				results = { rows: [] };

			cmd.on('row', function(r) {
				results.rows.push(r);
			});
			cmd.on('result', function() {
				if (conn.clean && callback) {
					results.insertId = cmd.insert_id;
					results.rowsAffected = cmd.affected_rows;
					callback(results);
				}
			});
			cmd.on('error', function(err) {
				conn.clean = false;
				if (errback)
					errback(err);
			});
		},
		transaction: function() {
			conn = connectMysql(params);
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
				}
			};
		}
	};

	function throwOnError(cmd, action) {
		cmd.on('error', function(err) {
			throw new DatabaseError('Failed to ' + action +
				(err && err.message ? ': ' + err.message : ''));
		});
	}

	function connectMysql(params) {
		var ret = require("mysql-native/client").createTCPClient(params.host, params.port);
		ret.auto_prepare = true;
		ret.row_as_hash = true;
		ret.clean = true;

		throwOnError(ret.connection, 'connect to DB');
		throwOnError(ret.auth(params.name, params.user, params.pass), 'authenticate');

		return ret;
	}
}

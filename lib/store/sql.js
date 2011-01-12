/**
 * This is an SQL store that (partially) implements: 
 * http://www.w3.org/TR/WebSimpleDB/
 * and wraps an SQL database engine based on: 
 * based on http://www.w3.org/TR/webdatabase/
 */
var first = require("promised-io/lazy-array").first,
	AutoTransaction = require("../transaction").AutoTransaction,
	parseQuery = require("rql/parser").parseQuery,
	print = require("promised-io/process").print,
	defineProperty = require("commonjs-utils/es5-helper").defineProperty,
	when = require("promised-io/promise").when,
	defer = require("promised-io/promise").defer,
	sqlOperators = require("rql/parser").commonOperatorMap;
var valueToSql = exports.valueToSql = function(value){
	if(typeof value == "string"){
		return "'" + value.toString().replace(/'/g,"''") + "'";
	}
	return value + '';
} 
try{
	var SQLDatabase = require("store-engine/sql").SQLDatabase;
}catch(e){
	// outside of nodules this may fail
	var SQLDatabase = require("../../engines/node/lib/store-engine/sql").SQLDatabase;
}


exports.SQLStore = function(config){
	var database = config.database || exports.openDatabase(config);
	var idColumn = config.idColumn = config.idColumn || "id";
	config.indexPrefix = config.indexPrefix || "idx_";
	var store = { 
		selectColumns: ["*"],
		get: function(id){
			return when(store.executeSql("SELECT * FROM " + config.table + " WHERE " + idColumn + "=?", [id]), function(result){
				return first(result.rows);
			});
		},
		getId: function(object){
			return object[idColumn];
		},
		"delete": function(id){
			var deferred = defer();
			store.executeSql("DELETE FROM " + config.table + " WHERE " + idColumn + "=?", [id], deferred.resolve, deferred.reject);
			return deferred.promise;
		},
		add: function(object, directives){
			var first = true;
			var valuesPlacement = "";
			var columnsString = "";
			var params = [];
			for(var i in object){
				if(object.hasOwnProperty(i)){
					params.push(object[i]);
					valuesPlacement += first ? "?" : ",?";
					columnsString += (first ? "" : ",") + i;
					first = false;
				}
			}
			params.idColumn = config.idColumn;
			var results = store.executeSql("INSERT INTO " + config.table + " (" + columnsString + ") values (" + valuesPlacement + ")", params);
			id = results.insertId;
			object[idColumn] = id;
			return id;
			
		},
		put: function(object, directives){
			id = directives.id || object[config.idColumn];
			var overwrite = directives.overwrite;
			if(overwrite === undefined){
				overwrite = this.get(id);
			}

			if(!overwrite){
				store.add(object, directives);
			}
			var sql = "UPDATE " + config.table + " SET ";
			var first = true;
			var params = [];
			for(var i in object){
				if(object.hasOwnProperty(i)){
					if(first){
						first = false;
					}
					else{
						sql += ",";
					}
					sql += i + "=?";
					params.push(object[i]);
				}
			}
			sql += " WHERE " + idColumn + "=?";
			params.push(object[idColumn]);
			store.executeSql(sql, params);
		},
		query: function(query, options){
			options = options || {};
			query = parseQuery(query);
			var limit, count, offset;
			var where = "";
			var select = this.selectColumns;
			var order = [];
			var params = (options.parameters = options.parameters || []);
			function convertRql(query){
				var conjunction = query.name;
				query.args.forEach(function(term, index){
					var column = term.args[0];
					switch(term.name){
						case "eq": case "ne": case "lt": case "le": case "gt": case "ge": 
							addClause(config.table + '.' + column + sqlOperators[term.name] + valueToSql(term.args[1]));
							break;
						case "sort":
							if(term.args.length === 0)
								throw new URIError("Must specify a sort criteria");
							term.args.forEach(function(sortAttribute){
								var firstChar = sortAttribute.charAt(0);
								var orderDir = "ASC";
								if(firstChar == "-" || firstChar == "+"){
									if(firstChar == "-"){
										orderDir = "DESC";
									}
									sortAttribute = sortAttribute.substring(1);
								}
								order.push(config.table + "." + sortAttribute + " " + orderDir);
							});
							break;
						case "and": case "or":
							where += "(";
							convertRql(term);
							where += ")";
							break;
						case "in":
							if(term.args[1].length == 0){
								// an empty IN clause is considered invalid SQL
								if(index > 0){
									where += " " + conjunction + " ";
								}
								where += "0=1";
							}
							else{
								addClause(column, column + " IN " + valueToSql(term.args[1]));
							}
							break;
						case "select":
							term.args.forEach(function(part){
								if(part.match(/[^\w]/)){
									throw new Error("Illegal character in select");
								}
							});
							select = term.args.join(",");
							break;
						case "distinct":
							select = "DISTINCT " + select;
							break;
						case "limit":
							limit = term.args[0];
							offset = term.args[1];
							count = term.args[2] > limit; 
							break;
						default:
							throw new URIError("Invalid query syntax, " + term.name+ " not implemented");
					}
					function addClause(sqlClause){
						if(where){
							where += " " + conjunction + " ";
						}
						where += sqlClause;
					}
				});
			}
			convertRql(query);
			var structure = {
				select: select,
				where: where,
				from: config.table,
				order: order,
				config: config
			};
			if(count){
				count = when(store.executeSql(store.generateSqlCount(structure)), function(results){
					return first(results.rows).count;
				});
			}
			var results = store.executeSql(limit ? store.generateSqlWithLimit(structure, limit, offset || 0) :
				store.generateSql(structure));
			return when(results, function(results){
				results = results.rows;
				if(count){
					results.totalCount = count;
				}
				return results;
			});
		},
		generateSql: function(structure){
			return "SELECT " + structure.select + " FROM " + structure.from +
				(structure.where && (" WHERE " + structure.where)) + (structure.order.length ? (" ORDER BY " + structure.order.join(", ")): "");
		},	
		generateSqlCount: function(structure){
			return "SELECT COUNT(*) as count FROM " + structure.from +
				(structure.where && (" WHERE " + structure.where));
		},	
		generateSqlWithLimit: function(structure, limit, offset){
			return store.generateSql(structure) + " LIMIT " + limit + " OFFSET " + offset;
		},	
		executeSql: function(sql, parameters){
			var deferred = defer();
			var result, error;
			database.executeSql(sql, parameters, function(value){
				deferred.resolve(result = value);
			}, function(e){
				deferred.reject(error = e);
			});
			// return synchronously if the data is already available.
			if(result){
				return result;
			}
			if(error){
				throw error;
			}
			return deferred.promise;
		},
		getSchema: function(){
			return {properties:{}};
		},
		setIndex: function(column) {
			var sql = "CREATE INDEX " + config.indexPrefix + column + " ON " + config.table + " (" + column + ")";
			print(sql);
			//print( first(this.executeSql(sql).rows) );
			
		}
	};
	var dialect = exports.dialects[config.type];
	for(var i in dialect){
		store[i] = dialect[i]
	}
	for(var i in config){
		store[i] = config[i];
	}
	
	return AutoTransaction(store, database);
}

try{
	var DATABASE = require("commonjs-utils/settings").database;
}catch(e){
	print("No settings file defined for a database " + e);
}

exports.openDatabase = function(parameters){
	parameters = parameters || {};
	for(var i in DATABASE){
		if(!(i in parameters)){
			parameters[i] = DATABASE[i];
		}
	}

	var db = SQLDatabase(parameters);
	require("../transaction").registerDatabase(db);
	return db;
};

exports.dialects = {
	mysql:{
		getSchema: function(){
			this.startTransaction();
			var results = this.executeSql("DESCRIBE " + config.table, {});
			this.commitTransaction();
			var schema = {properties:{}};
			results.some(function(column){
				schema.properties[column.Field] = {
					"default": column.Default,
					type: [column.Type.match(/(char)|(text)/) ? "string" :
						column.Type.match(/tinyint/) ? "boolean" :
						column.Type.match(/(int)|(number)/) ? "number" :
						"any", "null"]
				};
				if(column.Key == "PRI"){
					schema.links = [{
						rel: "full",
						hrefProperty: column.Field
					}];
				}
			});
			return schema;
		}
	},
	mssql:{
		generateSqlWithLimit: function(structure, limit, offset){
            sql = "SELECT " + structure.select;
            sql += " FROM (SELECT ROW_NUMBER() OVER (ORDER BY ";
            if (structure.order.length) {
                sql += structure.order.join(", ");
            }
            else {
                sql += structure.from + "." + structure.config.idColumn;
            }
            sql += ") AS __rownum__, " + structure.select;
            sql += " FROM " + structure.from;
            sql += structure.where && " WHERE " + structure.where;
            sql += ") AS " + structure.from;
            if (offset)
                sql += " WHERE __rownum__ > " + offset;
            if (limit)
                sql += (offset && " AND" || " WHERE") + " __rownum__ <= " + (limit + offset);
            return sql;
		}
	}
}
/**
 * This is an SQL store that (partially) implements: 
 * http://www.w3.org/TR/WebSimpleDB/
 * and wraps an SQL database engine based on: 
 * based on http://www.w3.org/TR/webdatabase/
 */
var SQLDatabase = require("store-engine/sql").SQLDatabase,
	first = require("commonjs-utils/lazy-array").first,
	AutoTransaction = require("../stores").AutoTransaction,
	parseQuery = require("../resource-query").parseQuery,
	print = require("commonjs-utils/system").print,
	defineProperty = require("commonjs-utils/es5-helper").defineProperty,
	sqlOperators = require("../resource-query").commonOperatorMap;
exports.SQLStore = function(config){
	var database = config.database || exports.defaultDatabase();
	var idColumn = config.idColumn || "id";
	config.indexPrefix = config.indexPrefix || "idx_";
	var store = { 
		indexedProperties: {id: true},
		selectColumns: ["*"],
		get: function(id){
			var object = first(store.executeSql("SELECT * FROM " + config.table + " WHERE " + idColumn + "=?", [id]).rows);
			if(object){
				defineProperty(object.__proto__ = {
					getId: function(object){
						return this[idColumn];
					}
				}, "getId", {enumerable: false});
			}
			return object;
		},
		"delete": function(id){
			store.executeSql("DELETE FROM " + config.table + " WHERE " + idColumn + "=?", [id]);
		},
		put: function(object, directives){
			id = directives.id || object[config.idColumn];
			var overwrite = directives.overwrite;
			if(overwrite === undefined){
				overwrite = this.get(id);
			}
			var params = [];
			var valuesPlacement = "";
			var columnsString = "";
			if(!overwrite){
				var first = true;
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
			}
			var sql = "UPDATE " + config.table + " SET ";
			var first = true;
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
			return this.executeQuery("SELECT " + this.selectColumns + " FROM " + config.table +
				" WHERE " + this.getWhereClause(query, options), options);		
		},
		getWhereClause: function(query, options){
			if(typeof query === "string"){
				query = parseQuery(query);
			}
			var sql = "";
			if(!options){
				throw new Error("Values must be set as parameters on the options argument, which was not provided");
			}
			var indexedProperties = this.indexedProperties;
			var params = (options.parameters = options.parameters || []);
			function generateSql(query){
				var conjunction = query.name;
				query.args.forEach(function(term, index){
					var column = term.args[0];
					switch(term.name){
						case "eq": case "ne": case "lt": case "le": case "gt": case "ge": 
							addClause(column, config.table + '.' + column + sqlOperators[term.name] + "?", term.args[1]);
							break;
						case "sort":
							if(term.args.length === 0)
								throw new URIError("Must specify a sort criteria");
							if(!sql) sql += "1=1";
							
							sql += " ORDER BY ";
							term.args.forEach(function(sortAttribute){
								var firstChar = sortAttribute.charAt(0);
								var orderDir = "ASC";
								if(firstChar == "-" || firstChar == "+"){
									if(firstChar == "-"){
										orderDir = "DESC";
									}
									sortAttribute = sortAttribute.substring(1);
								}
								if(!indexedProperties[sortAttribute]){
									throw new URIError("Can only sort by " + Object.keys(indexedProperties));
								}
								sql += " " + config.table + "." + sortAttribute + " " + orderDir + ",";
							});
							// slice off the trailing ","
							sql = sql.slice(0, -1);
							break;
						case "and": case "or":
							sql += "(";
							generateSql(term);
							sql += ")";
							break;
						case "in":
							if(term.args[1].length == 0){
								// an empty IN clause is considered invalid SQL
								if(index > 0){
									sql += " " + conjunction + " ";
								}
								sql += "0=1";
							}
							else{
								addClause(column, column + " IN (" + term.args[1].map(function(param){ 
									params.push(param);
									return "?";
								}).join(",") + ")");
							}
							break;
						default:
							throw new URIError("Invalid query syntax, " + term.name+ " not implemented");
					}
					function addClause(name, sqlClause, value){
						if(!indexedProperties[name]){
							throw new URIError("Can only query by " + Object.keys(indexedProperties));
						}
						if(index > 0){
							sql += " " + conjunction + " ";
						}
						sql += sqlClause;
						params.push(value);
					}
				});
			}
			generateSql(query);
			return sql || "1=1";
		},
		
		executeQuery: function(sql, options){
			// executes a query with provide start and end parameters, calculating the total number of rows
			if(options){
				if(typeof options.start === "number"){
					var countSql = sql.replace(/select.*?from/i,"SELECT COUNT(*) as count FROM");
					if(typeof options.end === "number"){
						sql += " LIMIT " + (options.end - options.start + 1);
					}
					sql += " OFFSET " + options.start;
					var results = this.executeSql(sql, options.parameters).rows;
					var lengthObject = first(this.executeSql(countSql, options.parameters).rows);
					
					results.totalCount = lengthObject.count;
					return results; 
				}
			}
			var results = this.executeSql(sql, options.parameters).rows;
			results.totalCount = results.length;
			return results;
		},
		executeSql: function(sql, parameters){
			return database.executeSql(sql, parameters);
		},
		setSchema: function(schema) {
			for(var i in schema.properties) {
				if (schema.properties[i].index) {
					this.indexedProperties[i] = schema.properties[i].index;
				}
			}
		},
		getSchema: function(){
			if(config.type == "mysql"){
				store.startTransaction();
				var results = store.executeSql("DESCRIBE " + config.table, {});
				store.commitTransaction();
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
			return {properties:{}};
		},
		setIndex: function(column) {
			var sql = "CREATE INDEX " + config.indexPrefix + column + " ON " + config.table + " (" + column + ")";
			print(sql);
			//print( first(this.executeSql(sql).rows) );
			
		}
	};
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

var defaultDatabase;
exports.defaultDatabase = function(parameters){
	parameters = parameters || {};
	for(var i in DATABASE){
		if(!(i in parameters)){
			parameters[i] = DATABASE[i];
		}
	}
	
	if(defaultDatabase){
		return defaultDatabase;
	}
	defaultDatabase = SQLDatabase(parameters);
	require("../stores").registerDatabase(defaultDatabase);
	return defaultDatabase;
};
exports.openDatabase = function(name){
	throw new Error("not implemented yet"); 	
};

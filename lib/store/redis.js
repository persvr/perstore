/**
 * Redis data store. Depends on
 * http://github.com/fictorial/redis-node-client
 * This can be automatically resolved by adding the following line to your 
 * package.json "mappings" object if you are using a package mapping aware module
 * loader (like Nodules):
 * "redis": "jar:http://github.com/fictorial/redis-node-client/zipball/master!/lib/",
 */
// candidate for commonjs-utils?
function dir(x){var sys=require('sys');sys.debug(sys.inspect(x));}

// this will return a data store 
exports.Redis = function(options){
	require('redis/redis-client').debugMode = true;
	// TODO: fetch real settings
	var dbOptions = require('commonjs-utils/settings').database || {};
	// mimic documents collection
	var collection = options.collection || 'doc';

	// connect to DB
	var db = require('redis/redis-client').createClient();//dbOptions.port, dbOptions.host, {});
	var ready = require('promise').defer();
	db.addListener('connected', function(){
		ready.resolve();
	});

	// async helper
	function callAsync(method, args){
		return require('promise').convertNodeAsyncFunction(method, true).apply(db, args);
	}

	// return DB proxy object
	return {
		ready: function(){
			return ready.promise;
		},
		get: function(id){
			// get <collection>:<id> key and parse it to JSON object
			return callAsync(db.get, [collection+':'+id]).then(function(result){
				if (result) { // TODO: do we support empty strings or boolean false here?!
					result = result.toString('utf8');
//dir(['GET:', result]);
					return JSON.parse(result);
				}
			});
		},
		put: function(object, directives){
			// set <collection>:<id> key to stringified object
			function _put(id, object){
				var search = collection+':'+id;
				object = JSON.stringify(object);
				return callAsync(directives.overwrite ? db.set : db.setnx, [search, object]);
			}
			// ID can come from URI, from object.id property or be autogenenerated
			var id = directives.id;
			if (!id) id = object.id;
			if (!id) {
				// get a fresh ID from ids:<collection> key
				return callAsync(db.incr, ['ids:'+collection]).then(function(result){
					id = object.id = result;
					return _put(id, object);
				});
			}
			return _put(id, object);
		},
		"delete": function(id){
			// drop <collection>:<id> key
			callAsync(db.del, [collection+':'+id]);
		},
		query: function(query, directives){
			return callAsync(db.get, [collection+':*']).then(function(result){
dir(['QUERY:', result]);
				if (result) {
					result = result.toString('utf8');
					return JSON.parse(result);
				}
			});
		},
		query1: function(query, directives){
			if(typeof query === "string"){
				var RQ = require("perstore/resource-query");
				//RQ.converters["default"] = exports.converters.auto;
				RQ.converters['re'] = function(x){
					return new RegExp(x, 'i');
				};
				query = RQ.parseQuery(query);
			}
			var options = {};

			function walk(name, terms) {
				// valid funcs
				var valid_funcs = ['lt','lte','gt','gte','ne','in','nin','not','mod','all','size','exists','type','elemMatch'];
				// funcs which definitely require array arguments
				var requires_array = ['in','nin','all','mod'];
				// funcs acting as operators
				var valid_operators = ['or', 'and'];//, 'xor'];
				// compiled search conditions
				var search = {};
				// iterate over terms
				terms.forEach(function(term){
					var func = term.name;
					var args = term.args;
					// ignore bad terms
					// N.B. this filters quirky terms such as for ?or(1,2) -- term here is a plain value
					if (!func || !args) return;
					//dir(['W:', func, args]);
					// process well-known functions
					// http://www.mongodb.org/display/DOCS/Querying
					if (func == "sort" && args.length > 0) {
						options.sort = args.map(function(sortAttribute){
							var firstChar = sortAttribute.charAt(0);
							var orderDir = "ascending";
							if (firstChar == "-" || firstChar == "+") {
								if (firstChar == "-") {
									orderDir = "descending";
								}
								sortAttribute = sortAttribute.substring(1);
							}
							return [sortAttribute, orderDir];
						});
					} else if (func == "select") {
						options.fields = args;
					// grouping
					// nested terms? -> recurse
					} else if (args[0] && typeof args[0] === 'object') {
						if (valid_operators.indexOf(func) > -1)
							search['$'+func] = walk(func, args);
						// N.B. here we encountered a custom function
						// ...
					}
					// structured query syntax
					// http://www.mongodb.org/display/DOCS/Advanced+Queries
					else {
						//dir(['F:', func, args]);
						// mongo specialty
						if (func == 'le') func = 'lte';
						else if (func == 'ge') func = 'gte';
						// the args[0] is the name of the property
						var key = args.shift();
						// the rest args are parameters to func()
						// N.B. mongodb primary keys are special
						if (key == '_id') {
							args = args.map(function(x){return to_id(x);});
						}
						// FIXME: do we really need to .join()?!
						if (requires_array.indexOf(func) == -1)
							args = args.length == 1 ? args[0] : args.join();
						// regexp inequality means negation of equality
						if (func == 'ne' && args instanceof RegExp) {
							func = 'not';
						}
						// TODO: contains() can be used as poorman regexp
						// E.g. contains(prop,a,bb,ccc) means prop.indexOf('a') >= 0 || prop.indexOf('bb') >= 0 || prop.indexOf('ccc') >= 0
						//if (func == 'contains') {
						//	// ...
						//}
						// valid functions are prepended with $
						if (valid_funcs.indexOf(func) > -1) {
							func = '$'+func;
						}
						// $or requires an array of conditions
						// N.B. $or is said available for mongodb >= 1.5.1
						if (name == 'or') {
							if (!(search instanceof Array))
								search = [];
							var x = {};
							x[func == 'eq' ? key : func] = args;
							search.push(x);
						// other functions pack conditions into object
						} else {
							// several conditions on the same property is merged into one object condition
							if (search[key] === undefined)
								search[key] = {};
							if (search[key] instanceof Object && !(search[key] instanceof Array))
								search[key][func] = args;
							// equality cancels all other conditions
							if (func == 'eq')
								search[key] = args;
						}
					}
				// TODO: add support for query expressions as Javascript
				});
				return search;
			}

			// compose search conditions
			//dir(['Q:',query]);
			var search = walk(query.name, query.args);
			//dir(['S:',search]);

			// respect directives
			if(directives.start >= 0 || directives.end >= 0){
				var totalCountPromise = callAsync(db.llen, [search]);	
			}
			return callAsync(db.lrange, [search, directives.start || 0, (directives.end >= 0) ? directives.end - (directives.start || 0) : -1]).then(function(results){
				var resultsPromise = convertNodeAsyncFunction(results.toArray).call(results);
				return resultsPromise.then(function(results){
					// N.B. results here can be [{$err: 'err-message'}]
					// the only way I see to distinguish from quite valid result [{_id:..., $err: ...}] is to check for absense of _id
					if (results && results[0] && results[0].$err !== undefined && results[0]._id === undefined)
						// N.B. wiser not be verbose
						throw new URIError("Search error");// + results[0].$err);
					var fields = options.fields;
					var len = results.length;
					// damn ObjectIDs!
					for (var i = 0; i < len; i++) {
						// _id is special -- it should be serialized manually
						var id = results[i]._id;
						if (id.toJSON)
							results[i]._id = id.toJSON();
					}
dir(options, results[0]);
					// kick out unneeded fields
					if (fields) {
						if (fields.length === 1) {
							var column = fields[0];
							for (var i = 0; i < len; i++) {
								results[i] = results[i][column] || {};
							}
						}
						// _id field is always returned from db.coll.find(),
						// so we need to delete it unless it's exlicitly specified in fields
						if (fields.indexOf("_id") == -1) {
							for (var i = 0; i < len; i++) {
								delete results[i]._id;
							}
						}
					}
					// total count
					if (totalCountPromise) {
						return totalCountPromise.then(function(totalCount){
							results.totalCount = totalCount;
							return results;
						});
					}
					else {
						return results;
					}
				});
				return resultsPromise;
			});
		}
	}
};

/**
 * MongoDB data store. Depends on
 * http://github.com/christkv/node-mongodb-native
 * This can be automatically resolved by adding the following line to your
 * package.json "mappings" object if you are using a package mapping aware module
 * loader (like Nodules):
 * "mongodb": "jar:http://github.com/christkv/node-mongodb-native/zipball/master!/lib/mongodb/"
 */

//
// N.B. for the latest RQL parser for mongo please refer to https://github.com/dvv/underscore.query
//

var convertNodeAsyncFunction = require('promised-io/promise').convertNodeAsyncFunction,
	//Connection = require("mongodb/connection").Connection,
	mongo = require('mongodb'),
	ObjectID = require('bson/lib/bson/objectid').ObjectID,
	Server = mongo.Server,
	sys = require('util'),
	defer = require("promised-io/promise").defer,
	when = require("promised-io/promise").when,
	jsArray = require("rql/js-array"),
	PreconditionFailed = require("../errors").PreconditionFailed;

var RQ = require("rql/parser");
//RQ.converters["default"] = exports.converters.auto;

// candidate for commonjs-utils?
function dir(){var sys=require('sys');for(var i=0,l=arguments.length;i<l;i++)sys.debug(sys.inspect(arguments[i]));}

	function parse(query, directives){
//dir('MONGO:', query);//, directives);
			// parse string to parsed terms
			if(typeof query === "string"){
				// handle $-parameters
				// TODO: consider security issues
				//// N.B. considered, treated as evil, bump
				//throw new URIError("Sorry, we don't allow raw querystrings. Please, provide the parsed terms instead");
				if (directives && directives.parameters) {
					query = query.replace(/\$[1-9]/g, function(param){
						return directives.parameters[param.substring(1) - 1];
					});
				}
				// poorman regexp? *foo, bar*
				/***v = (v.charAt(0) != '*') ? '^' + v : v.substring(1);
				v = (v.slice(-1) != '*') ? v + '$' : v.substring(0, v.length-1);***/
				query = RQ.parseQuery(query);
			}
			var options = {
				skip: 0,
				limit: +Infinity,
				lastSkip: 0,
				lastLimit: +Infinity
			};
			var search = {};
//			var needBulkFetch = directives && directives.postprocess; // whether to fetch whole dataset to process it here
//if (!needBulkFetch) {

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
					if (func == 'sort' && args.length > 0) {
						options.sort = args.map(function(sortAttribute){
							var firstChar = sortAttribute.charAt(0);
							var orderDir = 'ascending';
							if (firstChar == '-' || firstChar == '+') {
								if (firstChar == '-') {
									orderDir = 'descending';
								}
								sortAttribute = sortAttribute.substring(1);
							}
							return [sortAttribute, orderDir];
						});
					} else if (func == 'select') {
						options.fields = args;
					} else if (func == 'values') {
						options.unhash = true;
						options.fields = args;
					// N.B. mongo has $slice but so far we don't allow it
					/*} else if (func == 'slice') {
						//options[args.shift()] = {'$slice': args.length > 1 ? args : args[0]};*/
					} else if (func == 'limit') {
						// we calculate limit(s) combination
						options.lastSkip = options.skip;
						options.lastLimit = options.limit;
						// TODO: validate args, negative args
						var l = args[0] || Infinity, s = args[1] || 0;
						// N.B: so far the last seen limit() contains Infinity
						options.totalCount = args[2];
						if (l <= 0) l = 0;
						if (s > 0) options.skip += s, options.limit -= s;
						if (l < options.limit) options.limit = l;
//dir('LIMIT', options);
					// grouping
					} else if (func == 'group') {
						// TODO:
					// nested terms? -> recurse
					} else if (args[0] && typeof args[0] === 'object') {
						if (valid_operators.indexOf(func) > -1)
							search['$'+func] = walk(func, args);
						// N.B. here we encountered a custom function
						// ...
					// structured query syntax
					// http://www.mongodb.org/display/DOCS/Advanced+Queries
					} else {
						//dir(['F:', func, args]);
						// mongo specialty
						if (func == 'le') func = 'lte';
						else if (func == 'ge') func = 'gte';
						// the args[0] is the name of the property
						var key = args.shift();
						// the rest args are parameters to func()
						if (requires_array.indexOf(func) >= 0) {
							args = args[0];
						} else {
							// FIXME: do we really need to .join()?!
							args = args.length == 1 ? args[0] : args.join();
						}
						// regexps:
						if (typeof args === 'string' && args.indexOf('re:') === 0)
							args = new RegExp(args.substr(3), 'i');
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
			//dir(['Q:',query]);
			search = walk(query.name, query.args);
			//dir(['S:',search]);
			return [options, search];
	}

// this will return a data store
module.exports = function(options){
	var ready = defer();
	var collection, schema;

	function getCollection(db){
		db.collection(options.collection, function(err, coll){
			if(err){
				sys.puts("Failed to load mongo database collection " + dbOptions.name + " collection " + options.collection + " error " + err.message);
				ready.reject(err);
			}else{
				collection = coll;
				ready.resolve(coll);
			}
		});
	}

	var dbOptions = require("../util/settings").database;
	var url = options.url || dbOptions.url;
	if(url){
		sys.puts(url);
		mongo.connect(url, function(err, db){
			if(err){
				sys.puts('Failed to connect to mongo database ' + url + ' - error: ' + err.message);
				ready.reject(err);
			}
			else {
				getCollection(db);
			}
		});
	}
	else {
		var database = options.database || new mongo.Db(dbOptions.name, 
				new Server(dbOptions.host, dbOptions.port, {}), {});
		database.open(function(err, db){
			if(err){
				sys.puts("Failed to load mongo database " + dbOptions.name + " error " + err.message);
				ready.reject(err);
			}
			else{
				getCollection(db);
			}
		});
	}

	// async helper
	function callAsync(method, args){
		return convertNodeAsyncFunction(method, true).apply(collection, args);
	}

	// interface
	return {
		ready: function(){
			return ready;
		},
		setSchema: function(arg){
			schema = arg;
		},
		get: function(id){
			var deferred = defer();
			collection.findOne({id: id}, function(err, obj){
				if (err) return deferred.reject(err);
				if (obj) delete obj._id;
				if(obj === null){
					obj = undefined;
				}
//dir('GOT:', id, obj, query);
				//if (???.queryString) {
				//	var query = ???.queryString;
				//	if (query)
				//		obj = jsArray.executeQuery(query, {}, [obj])[0];
				//}
				deferred.resolve(obj);
			});
			return deferred;
		},
		put: function(object, directives){
			var deferred = defer();
			// N.B. id may come from directives (the primary valid source),
			// and from object.id
			directives = directives || {};
			var id = directives.id || object.id;
			if (!object.id) object.id = id;
			var search = {id: id};

//dir('PUT:', object, directives.overwrite === false, !id);
			if (directives.overwrite === false || !id) {// === undefined) {
				// do an insert, and check to make sure no id matches first
				collection.findOne(search, function(err, found){
					if (err) return deferred.reject(err);
					if (found === null) {
						if (!object.id) object.id = ObjectID.createPk().toJSON();
						collection.insert(object, function(err, obj){
							if (err) return deferred.reject(err);
							// .insert() returns array, we need the first element
							obj = obj && obj[0];
							if (obj) delete obj._id;
							deferred.resolve(obj.id);
						});
					} else {
						deferred.reject(id + " exists, and can't be overwritten");
					}
				});
			} else {
				collection.update(search, object, {upsert: directives.overwrite}, function(err, obj){
					if (err) return deferred.reject(err);
					if (obj) delete obj._id;
					deferred.resolve(id);
				});
			}
			return deferred;
		},
		"delete": function(id, directives){
			var deferred = defer();
			// compose search conditions
			//if (id === undefined) id = '?' + (this.req.queryString || '');
			//if (id.charAt(0) === '?') {
			//	var x = parse(id.substring(1), metadata);
			//	var options = x[0], search = x[1];
			//} else {
				var search = {id: id};
			//}
			// remove matching documents
			collection.remove(search, function(err, result){
				if (err) return deferred.reject(err);
				deferred.resolve(undefined);
			});
			return deferred;
		},
		query: function(query, directives){
//dir('QRY:', query);
			var deferred = defer();
			// compose search conditions
			var x = parse(query, directives);
			var meta = x[0], search = x[1];

			// range of non-positive length is trivially empty
			//if (options.limit > options.totalCount)
			//	options.limit = options.totalCount;
			if (meta.limit <= 0) {
				var results = [];
				results.totalCount = 0;
				return results;
			}

			// request full recordset length
//dir('RANGE', options, directives.limit);
			// N.B. due to collection.count doesn't respect meta.skip and meta.limit
			// we have to correct returned totalCount manually.
			// totalCount will be the minimum of unlimited query length and the limit itself
			var totalCountPromise = (meta.totalCount) ?
				when(callAsync(collection.count, [search]), function(totalCount){
					totalCount -= meta.lastSkip;
					if (totalCount < 0)
						totalCount = 0;
					if (meta.lastLimit < totalCount)
						totalCount = meta.lastLimit;
					// N.B. just like in rql/js-array
					return Math.min(totalCount, typeof meta.totalCount === "number" ? meta.totalCount : Infinity);
				}) : undefined;
//}

			// request filtered recordset
//dir('QRY:', search);
			collection.find(search, meta, function(err, cursor){
				if (err) return deferred.reject(err);
				cursor.toArray(function(err, results){
					if (err) return deferred.reject(err);
					// N.B. results here can be [{$err: 'err-message'}]
					// the only way I see to distinguish from quite valid result [{_id:..., $err: ...}] is to check for absense of _id
					if (results && results[0] && results[0].$err !== undefined && results[0]._id === undefined) {
						return deferred.reject(results[0].$err);
					}
					var fields = meta.fields;
					var len = results.length;
					// damn ObjectIDs!
					for (var i = 0; i < len; i++) {
						delete results[i]._id;
					}
					// kick out unneeded fields
					if (fields) {
						// unhash objects to arrays
						if (meta.unhash) {
							results = jsArray.executeQuery('values('+fields+')', directives, results);
						}
					}
					// total count
					when(totalCountPromise, function(result){
						results.count = results.length;
						results.start = meta.skip;
						results.end = meta.skip + results.count;
						results.schema = schema;
						results.totalCount = result;
//dir('RESULTS:', results.slice(0,0));
						deferred.resolve(results);
					});
				});
			});
			return deferred;
		}
	}
}
module.exports.MongoDB = module.exports;

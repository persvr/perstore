/**
 * MongoDB data store. Depends on
 * http://github.com/christkv/node-mongodb-native
 * This can be automatically resolved by adding the following line to your
 * package.json "mappings" object if you are using a package mapping aware module
 * loader (like Nodules):
 * "mongodb": "jar:http://github.com/christkv/node-mongodb-native/zipball/master!/lib/mongodb/"
 */
var mongo = require('mongodb/db'),
	BSON = require('mongodb/bson/bson'),
	Server = require("mongodb/connection").Server,
	sys = require('sys'),
	convertNodeAsyncFunction = require("promised-io/promise").convertNodeAsyncFunction,
	defer = require("promised-io/promise").defer,
	when = require("promised-io/promise").when,
	jsArray = require("rql/js-array"),
	PreconditionFailed = require("../errors").PreconditionFailed;

var RQ = require("rql/parser");
//RQ.converters["default"] = exports.converters.auto;
RQ.converters['re'] = function(x){
dir('RECONV:', x);
	return new RegExp(x, 'i');
};

// candidate for commonjs-utils?
function dir(){var sys=require('sys');for(var i=0,l=arguments.length;i<l;i++)sys.debug(sys.inspect(arguments[i]));}

// this will return a data store
exports.MongoDB = function(options){
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

	var dbOptions = require("commonjs-utils/settings").database;
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
		var database = options.database || new mongo.Db(dbOptions.name, new Server(dbOptions.host, dbOptions.port, {}), {});
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

	function callAsync(method, args){
		return convertNodeAsyncFunction(method, true).apply(collection, args);
	}
	function to_id(id){
		// TODO: fix one time forever whether we support ObjectID?!
		return id;
		// we consider 24-octet strings as probably HEX representation of ObjectID
		if (typeof id === 'string' && id.length == 12*2) try {
			id = BSON.ObjectID.createFromHexString(id);
		} catch (ex) {}
		return id;
	}
	function from_id(data){
		if (data) {
			data.id = data._id;
			delete data._id;
		}
		return data;
	}
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
								if (sortAttribute === 'id') sortAttribute = '_id';
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
						// N.B. mongodb primary keys are special
						if (key === 'id') {
							key = '_id';
							args = args.map(function(x){return to_id(x);});
						}
						// FIXME: do we really need to .join()?!
						if (requires_array.indexOf(func) == -1)
							args = args.length == 1 ? args[0] : args.join();
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

	return {
		ready: function(){
			return ready;
		},
		setSchema: function(arg){
			schema = arg;
		},
		get: function(id){
			return callAsync(collection.findOne, [{_id:to_id(id)}]).then(from_id);
		},
		put: function(object, directives){
			// N.B. id may come from directives (the primary valid source),
			//   object.id (bad, because mongo uses _id for primary key!),
			//   object._id
			var id = directives.id || object.id || object._id;
			if (!object._id) object._id = id;
			// N.B. we delete erroneously set .id
			delete object.id;
			var search = {_id:to_id(id)};

			if (directives.overwrite === false) {
				// do an insert, and check to make sure no id matches first
				return callAsync(collection.findOne, [search]).then(function(found){
					if (found === undefined) {
						if (!object._id) object._id = BSON.ObjectID.createPk().toJSON();
						return callAsync(collection.insert, [object]).then(from_id);
					} else {
						// TODO: this error is unhandled and dumps node! May be silently ignore it?!
						throw new PreconditionFailed(object._id + " exists, and can't be overwritten");
					}
				});
			}
			return callAsync(collection.update, [search, object, !directives.overwrite]);
		},
		"delete": function(id, directives){
			// compose search conditions
			if (id.charAt(0) === '?') {
				var x = parse(id.substring(1), directives);
				var options = x[0], search = x[1];
			} else {
				var search = {_id:to_id(id)};
			}
//dir('D:',options, search);
			callAsync(collection.remove, [search]);
		},
		query: function(query, directives){
			// compose search conditions
			var x = parse(query, directives);
			var options = x[0], search = x[1];

			// range of non-positive length is trivially empty
			//if (options.limit > options.totalCount)
			//	options.limit = options.totalCount;
			if (options.limit <= 0) {
				var results = [];
				results.totalCount = 0;
				return results;
			}

			// request full recordset length
//dir('RANGE', options, directives.limit);
			// N.B. due to collection.count doesn't respect options.skip and options.limit
			// we have to correct returned totalCount manually!
			// totalCount will be the minimum of unlimited query length and the limit itself
			var totalCountPromise = (options.totalCount) ?
				when(callAsync(collection.count, [search]), function(totalCount){
					totalCount -= options.lastSkip;
					if (totalCount < 0)
						totalCount = 0;
					if (options.lastLimit < totalCount)
						totalCount = options.lastLimit;
//dir('QQQ:', totalCount);
					// N.B. just like in rql/js-array
					return Math.min(totalCount, typeof options.totalCount === "number" ? options.totalCount : Infinity);
				}) : undefined;
/*			if (directives.limit) {
				var s = options.skip, l = options.limit;
				var totalCountPromise = when(callAsync(collection.count, [search]), function(totalCount){
					totalCount -= s;
					if (totalCount < 0)
						totalCount = 0;
					if (l < totalCount)
						totalCount = l;
//dir('QQQ:', totalCount);
					return totalCount;
				});
				options.skip += directives.limit.skip, options.limit -= directives.limit.skip;
				if (directives.limit.limit < options.limit) options.limit = directives.limit.limit;
			}*/
//}

			// request filtered recordset
			return callAsync(collection.find, [search, options]).then(function(results){
				var resultsPromise = convertNodeAsyncFunction(results.toArray).call(results);
				return when(resultsPromise, function(results){
					// N.B. results here can be [{$err: 'err-message'}]
					// the only way I see to distinguish from quite valid result [{_id:..., $err: ...}] is to check for absense of _id
					if (results && results[0] && results[0].$err !== undefined && results[0]._id === undefined) {
						return results[0].$err;
						// N.B. wiser not be verbose
						throw new URIError("Search error" + results[0].$err);
					}
					var fields = options.fields;
					var len = results.length;
					// damn ObjectIDs!
					for (var i = 0; i < len; i++) {
						// _id is special -- it should be serialized manually
						var id = results[i]._id;
						if (id.toJSON)
							results[i]._id = id.toJSON();
						// rename _id to id to be uniform
						results[i].id = results[i]._id;
						delete results[i]._id;
					}
					// kick out unneeded fields
					if (fields) {
						// _id field is always returned from db.coll.find(),
						// so we need to delete it unless it's exlicitly specified in fields
						if (fields.indexOf("id") == -1) {
							for (var i = 0; i < len; i++) {
								delete results[i].id;
							}
						}
						// unhash objects to arrays
						if (options.unhash) {
							results = jsArray.executeQuery('values('+fields+')', directives, results);
						}
					}
					// process advanced query?
					/*if (needBulkFetch) {
						// pass the lazy array to RQ executor
						results = jsArray.executeQuery(query, directives, results);
					} else*/ {
						// total count
						results.totalCount = totalCountPromise;
					}
					return results;
				});
			});
		}
	}
}

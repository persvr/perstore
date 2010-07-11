/**
 * Redis data store. Depends on
 * http://github.com/fictorial/redis-node-client
 * This can be automatically resolved by adding the following line to your
 * package.json "mappings" object if you are using a package mapping aware module
 * loader (like Nodules):
 * "redis": "jar:http://github.com/fictorial/redis-node-client/zipball/master!/lib/",
 */
var convertNodeAsyncFunction = require('promised-io/promise').convertNodeAsyncFunction,
	when = require("promised-io/promise").when,
	jsValues = require("rql/js-array").operators.values,
	redis = require('redis/redis-client');

var RQ = require('rql/parser');
//RQ.converters['default'] = exports.converters.auto;

// candidate for commonjs-utils?
function dir(){var sys=require('sys');for(var i=0,l=arguments.length;i<l;i++)sys.debug(sys.inspect(arguments[i]));}

// this will return a data store
exports.Redis = function(options){
	redis.debugMode = false;//true;
	// TODO: fetch real settings
	var dbOptions = require('commonjs-utils/settings').database || {};
	// mimic documents collection
	var collection = options.collection || 'doc';
	var schema;

	// connect to DB
	var db = redis.createClient();//dbOptions.port, dbOptions.host, {});
	var ready = require('promised-io/promise').defer();
	db.addListener('connected', function(){
		ready.resolve();
	});

	// async helper
	function callAsync(method, args){
		return convertNodeAsyncFunction(method, true).apply(db, args);
	}

	// make a flat array from object
	function objToFlatArray(obj){
		var a = [];
		for (var i in obj) if (obj.hasOwnProperty(i)) {
			a.push(i);
			a.push(obj[i]);
		}
		return a;
	}

	function fieldToHashField(field){
		var coll = collection;
		// TODO: collection.field -> collection+':*->'+field
		var parts = field.split('.');
		if (parts.length > 1) {
			coll = parts.shift();
			if (coll.indexOf(':') < 0) {
				coll = collection.substring(0, collection.indexOf(':')+1) + coll.substring(coll.indexOf(':'));
			}
			field = parts.join('.');
		}
		// # -> ID
		result = (field === 'id' ? (coll != collection ? coll + ':*->' : '') + '#' : (coll + ':*->' + field));
//dir('FTHF:', field, result);
		return result;
	}

	// return DB proxy object
	return {
		ready: function(){
			return ready;
		},
		setSchema: function(arg){
			schema = arg;
		},
		get: function(id){
			return callAsync(db.hgetall, [collection+':'+id]).then(function(result){
				if (result) {
					redis.convertMultiBulkBuffersToUTF8Strings(result);
//dir(['GET:', result]);
					if (!result.id) result.id = id;
					return result;
				}
			});
		},
		put: function(object, directives){
			function _put(id, object){
				// reduce object to flat array (hash)
				var args = [collection+':'+id];
				args = args.concat(objToFlatArray(object));
//dir(['PUT:', args]);
				// store the hash
				return callAsync(db.hmset, args);
			}
			// ID can come from URI, from object.id property or be autogenenerated
			var id = directives.id;
			if (!id) id = object.id;
			if (!id) {
				// get a fresh ID from <collection>:id key
				// TODO: make use of UUIDs
				return callAsync(db.incr, [collection+':id']).then(function(result){
					id = object.id = result;
					return _put(id, object).then(function(result){
						// update collection index
						var score = id; // TODO: more advanced score?
						return callAsync(db.zadd, [collection, score, id]);
					});
				});
			}
			return _put(id, object);
		},
		'delete': function(id){
			// drop <collection>:<id> key
			callAsync(db.del, [collection+':'+id]).then(function(x){
				// and remove id from the index
				return callAsync(db.zrem, [collection, id]);
			});
		},
		query: function(query, directives){
			if(typeof query === 'string'){
				query = RQ.parseQuery(query);
			}
			// compile search conditions
			var options = {
				skip: 0,
				limit: +Infinity,
				lastSkip: 0,
				lastLimit: +Infinity
			};
			var needBulkFetch = false; // whether to fetch whole dataset to process it here
			query && query.args.forEach(function(term){
				var func = term.name;
				var args = term.args;
				// ignore bad terms
				if (!func || !args) return;
				//dir(['W:', func, args]);
				// process well-known functions
				if (func == 'sort' && args.length == 1) {
					options.sort = args[0];
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
				} else if (func == 'select') {
					options.fields = args;
				} else if (func == 'values') {
					options.unhash = true;
					options.fields = args;
				// process basic criteria
				} else if (RQ.knownOperators.indexOf(func)) {
					needBulkFetch = true;
				}
			});

			var args = [collection];

			// range of non-positive length is trivially empty
			if (options.limit > options.totalCount)
				options.limit = options.totalCount;
			if (options.limit <= 0) {
				var results = [];
				results.totalCount = 0;
				return results;
			}

			// request full recordset length
//dir('RANGE', options);
			// N.B. due to collection.count doesn't respect options.skip and options.limit
			// we have to correct returned totalCount manually!
			// totalCount will be the minimum of unlimited query length and the limit itself
			var totalCountPromise = (needBulkFetch || options.totalCount !== Infinity) ?
				options.totalCount :
				when(callAsync(db.zcard, args), function(totalCount){
					totalCount -= options.lastSkip;
					if (totalCount < 0)
						totalCount = 0;
					if (options.lastLimit < totalCount)
						totalCount = options.lastLimit;
					return totalCount;
				});

			// apply sort
			args.push('by');
			if (!needBulkFetch && options.sort) {
				var field = options.sort;
				var firstChar = field.charAt(0);
				if (firstChar == '-' || firstChar == '+') {
					var descending = firstChar == '-';
					field = field.substring(1);
				}
				args.push(fieldToHashField(field));
				if (descending) args.push('desc');
				args.push('alpha');
			} else {
				args.push('nosort');
			}

			// apply limit
			if (!needBulkFetch) {
				args.push('limit');
				args.push(options.skip);
				args.push(options.limit === Infinity ? -1 : options.limit);
			}

			// request lookup fields
			(options.fields||[]).forEach(function(field){
				args.push('get');
				args.push(fieldToHashField(field));
			});

			// real request
			return callAsync(db.sort, args).then(function(results){
				// FIXME: should be async?
				redis.convertMultiBulkBuffersToUTF8Strings(results);
				if (!results) results = [];
//dir(['RES:', results]);
				// convert flat array into array of objects
				var fields = options.fields || ['id'];
				var flen = fields.length;
				var len = results.length;
				var hash = {};
				var r = [];
				for (var i = 0, j = 0; i < results.length; ++i) {
					var value = results[i];
					// TODO: apply auto-conversions (number, boolean) here?
					// TODO: make use of schema
					/*if (flen == 1) {
						r.push(value);
					} else*/ {
						hash[fields[j++]] = value;
						if (j == flen) {
							r.push(hash);
							j = 0;
							hash = {};
						}
					}
				}
				results = r;
				if (options.unhash) {
					// TODO: we hashed above!
					results = jsValues.apply(results, fields);
				}
				// process advanced query?
				if (needBulkFetch) {
					// pass the lazy array to RQ executor
					results = RQ.executeQuery(query, directives, results);
				} else {
					results.totalCount = totalCountPromise;
				}
				return results;
			});
		}
	}
};

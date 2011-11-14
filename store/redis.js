/**
 * Redis data store. Depends on
 * http://github.com/fictorial/redis-node-client
 * This can be automatically resolved by adding the following line to your
 * package.json "mappings" object if you are using a package mapping aware module
 * loader (like Nodules):
 * "redis": "jar:http://github.com/fictorial/redis-node-client/zipball/master!/lib/",
 */
var convertNodeAsyncFunction = require('promised-io/promise').convertNodeAsyncFunction,
	when = require('promised-io/promise').when,
	defer = require('promised-io/promise').defer,
	jsArray = require('rql/js-array'),
	JSONExt = require('../util/json-ext'),
	redis = require('redis/redis-client');

var RQ = require('rql/parser');
//RQ.converters['default'] = exports.converters.auto;

// candidate for commonjs-utils?
function dir(){var sys=require('sys');for(var i=0,l=arguments.length;i<l;i++)sys.debug(sys.inspect(arguments[i]));}

// this will return a data store
exports.Redis = function(options){
	redis.debugMode = false;
	// TODO: fetch real settings
	var dbOptions = require('../util/settings').database || {};
	// mimic documents collection
	var collection = options.collection || 'doc';
	var schema;

	// connect to DB
	var db = redis.createClient();//dbOptions.port, dbOptions.host, {});
	var ready = defer();
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
			var o = obj[i];
			//a.push(o);
			a.push(typeof o !== 'string' ? JSON.stringify(o) : o);
		}
		return a;
	}

	// json-parses each property of passed object
	function redisHashToRealHash(obj){
		for (var i in obj) try {obj[i] = JSON.parse(obj[i]);} catch (x) {}
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
//dir('GET', arguments);
			var path = id.split('.');
			var promise = defer();
////
//			db.get(collection+':'+path.shift(), function(err, obj){
////
			db.hgetall(collection+':'+path.shift(), function(err, obj){
				if (err) {promise.reject(err); throw new URIError(err);}
				if (obj) {
					redis.convertMultiBulkBuffersToUTF8Strings(obj);
					redisHashToRealHash(obj);
//dir('GET', obj);
					if (!obj.id) obj.id = id;
					for (var i = 0; i < path.length; i++) {
						var p = decodeURIComponent(path[i]);
						if (!obj) break;
						obj = obj.get ? obj.get(p) : obj[p];
					}
				}
				promise.resolve(obj||undefined);
			});
			return promise;
		},
		put: function(object, directives){
			var promise = defer();
			function _put(id, object){
				// store the object
////
//				db.set(collection+':'+id, JSONExt.stringify(object), function(err, result){
////
				var args = [collection+':'+id];
				args = args.concat(objToFlatArray(object));
				args.push(function(err, result){
					if (err) {promise.reject(err); throw new URIError(err);}
					// update collection index
					var score = isNaN(id) ? 0 : id; // TODO: more advanced score?
					db.zadd(collection, score, id, function(err, result){
						if (err) {promise.reject(err); throw new URIError(err);}
						promise.resolve(id);
					});
				});
				db.hmset.apply(db, args);
			}
			// ID can come from URI, from object.id property or be autogenenerated
			var id = directives.id || object.id;
			if (!id) {
				// get a fresh ID from <collection>:id key
				// TODO: make use of UUIDs
				db.incr(collection+':id', function(err, result){
					if (err) {promise.reject(err); throw new URIError(err);}
					id = object.id = result;
					_put(id, object);
				});
			} else {
				_put(id, object);
			}
			return promise;
		},
		'delete': function(id, directives){
			var promise = defer();
			/*if (id.charAt(0) === '?') {
				// FIXME: never happens -- redis won't accept ?name=value
				var ids = this.query(id.substring(1) + '&values(id)', directives);
				dir('IDS:', ids);
				// TODO: ids.map(function(id){remove id like below})
			} else*/ {
				// drop <collection>:<id> key
				db.del(collection+':'+id, function(err, result){
					if (err) {promise.reject(err); throw new URIError(err);}
					// and remove id from the index
					db.zrem(collection, id, function(err, result){
						if (err) {promise.reject(err); throw new URIError(err);}
						promise.resolve(undefined);
					});
				});
			}
			return promise;
		},
		query: function(query, directives){
			if(typeof query === 'string'){
				query = RQ.parseQuery(query);
			}
//dir('QRYYY!', query);
			// compile search conditions
			var options = {
				skip: 0,
				limit: +Infinity,
				lastSkip: 0,
				lastLimit: +Infinity
			};
			var jsArrayQuery = ''; // whether to fetch whole dataset to process it here
////
//jsArrayQuery = query, query = '';
////
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
				} else if (RQ.commonOperatorMap[func]) {
					// N.B. set directives.allowBulkFetch to allow
					// decent filtering in redis at the expense of slowdown
					if (directives.allowBulkFetch)
						jsArrayQuery += term;
				} else {
					// NYI: what to do?
				}
			});

			var args = [collection];

			// range of non-positive length is trivially empty
			//if (options.limit > options.totalCount)
			//	options.limit = options.totalCount;
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
			var totalCountPromise = (!jsArrayQuery && options.totalCount) ?
				when(callAsync(db.zcard, args), function(totalCount){
					totalCount -= options.lastSkip;
					if (totalCount < 0)
						totalCount = 0;
					if (options.lastLimit < totalCount)
						totalCount = options.lastLimit;
					return Math.min(totalCount, typeof options.totalCount === "number" ? options.totalCount : Infinity);
				}) : undefined;

			// apply sort
			args.push('by');
			if (!jsArrayQuery && options.sort) {
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
			if (!jsArrayQuery) {
				args.push('limit');
				args.push(options.skip);
				args.push(options.limit === Infinity ? -1 : options.limit);
			}

			// request lookup fields
			(options.fields||[]).forEach(function(field){
				args.push('get');
				args.push(fieldToHashField(field));
			});
////
//args.push('get', collection + ':*');
////

			// real request
//dir('REQ:', args);
			return callAsync(db.sort, args).then(function(results){
				// FIXME: should be async?
				redis.convertMultiBulkBuffersToUTF8Strings(results);
				if (!results) results = [];
////
				/*results = results.toString('UTF8');
				if (jsArrayQuery) results = JSONExt.parse('['+results+']');*/
////
//dir('RES?:', results);
				// convert flat array into array of objects
				var fields = options.fields || ['id'];
				var flen = fields.length;
				var len = results.length;
				var hash = {};
				var r = [];
				for (var i = 0, j = 0; i < len; ++i) {
					var value = results[i];
					// TODO: apply auto-conversions (number, boolean) here?
					// TODO: make use of schema
					/*if (flen == 1) {
						r.push(value);
					} else*/ {
						hash[fields[j++]] = value;
						if (j == flen) {
							redisHashToRealHash(hash);
							r.push(hash);
							j = 0;
							hash = {};
						}
					}
				}
				results = r;
//dir('RES!:', results);
				if (options.unhash) {
					results = jsArray.executeQuery('values('+fields+')', directives, results);
				}
				// process advanced query?
				if (jsArrayQuery) {
					// pass the lazy array to RQ executor
//dir('RQL?:', query, results, jsArrayQuery);
					results = jsArray.executeQuery(jsArrayQuery, directives, results);
//dir('RQL!:', query, results);
				} else {
					results.totalCount = totalCountPromise;
				}
				return results;
			});
		}
	}
};

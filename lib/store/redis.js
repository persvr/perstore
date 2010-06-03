/**
 * Redis data store. Depends on
 * http://github.com/fictorial/redis-node-client
 * This can be automatically resolved by adding the following line to your
 * package.json "mappings" object if you are using a package mapping aware module
 * loader (like Nodules):
 * "redis": "jar:http://github.com/fictorial/redis-node-client/zipball/master!/lib/",
 */
var convertNodeAsyncFunction = require('promise').convertNodeAsyncFunction,
	redis = require('redis/redis-client');

// candidate for commonjs-utils?
function dir(x){var sys=require('sys');sys.debug(sys.inspect(x));}

// this will return a data store
exports.Redis = function(options){
	redis.debugMode = false;//true;
	// TODO: fetch real settings
	var dbOptions = require('commonjs-utils/settings').database || {};
	// mimic documents collection
	var collection = options.collection || 'doc';

	// connect to DB
	var db = redis.createClient();//dbOptions.port, dbOptions.host, {});
	var ready = require('promise').defer();
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

	// return DB proxy object
	return {
		ready: function(){
			return ready.promise;
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
						return callAsync(db.zadd, [collection, id, id]);
					});
				});
			}
			return _put(id, object);
		},
		"delete": function(id){
			// drop <collection>:<id> key
			callAsync(db.del, [collection+':'+id]);
		},
		query: function(query, directives){
			if(typeof query === 'string'){
				var RQ = require('perstore/resource-query');
				//RQ.converters['default'] = exports.converters.auto;
				query = RQ.parseQuery(query);
			}
			// compile search conditions
			var options = {
				offset: 0,
				limit: +Infinity
			};
			query.args.forEach(function(term){
				var func = term.name;
				var args = term.args;
				// ignore bad terms
				if (!func || !args) return;
				//dir(['W:', func, args]);
				// process well-known functions
				if (func == 'sort' && args.length == 1) {
					options.sort = args[0];
				} else if (func == 'slice') {
					// we calculate slice(s) combination
					// TODO: validate args, negative args
					var s = +args[0], e = +args[1], l = e-s;
					if (l <= 0) l = 0;
					if (s > 0) options.offset += s, options.limit -= s;
					if (l < options.limit) options.limit = l;
				} else if (func == 'range') {
					var s = +args[0], e = +args[1], l = e-s;
					if (l <= 0) l = 0;
					if (s > 0) options.offset += s, options.limit -= s;
					if (l < options.limit) options.limit = l;
				} else if (func == 'select') {
					options.fields = args;
				}
			});

			var args = [collection];
			//return [];
			args.push('by');
			if (options.sort) {
				var field = options.sort;
				var firstChar = field.charAt(0);
				if (firstChar == '-' || firstChar == '+') {
					var descending = firstChar == '-';
					field = field.substring(1);
				}
				args.push(field === 'id' ? '#' : (collection+':*->'+field)); // # means ID
				if (descending) args.push('desc');
				args.push('alpha');
			} else {
				args.push('nosort');
			}
			// apply slice(s)
			args.push('limit');
			args.push(options.offset);
			args.push(options.limit === Infinity ? -1 : options.limit);
//dir(['COUNT-:',query, args, options, directives]);
			// request full recordset length
			if (directives.range !== undefined) {
			//var totalCountPromise = callAsync(db.zcard, [collection]);
				var totalCountPromise = callAsync(db.sort, args);
				// apply the final slice from directives.range
				// FIXME: shouldn't it be uniformly done at upper level?
				// replace offset and limit in args
				args.pop(); args.pop();
				var s = directives.range.start, e = directives.range.end, l = e-s;
				if (l <= 0) l = 0;
				if (s > 0) options.offset += s, options.limit -= s;
				if (l < options.limit) options.limit = l;
				args.push(options.offset);
				args.push(options.limit === Infinity ? -1 : options.limit);
//dir(['COUNT+:',query, args, options]);
			}
			// request lookup fields
			(options.fields||[]).forEach(function(field){
				args.push('get');
				args.push(field === 'id' ? '#' : (collection+':*->'+field)); // # means ID
			});
//dir(['D0:',query,args,options]);
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
					// TODO: apply auto-conversions (number, boolean) here?
					hash[fields[j++]] = results[i];
					if (j == flen) {
						r.push(hash);
						j = 0;
						hash = {};
					}
				}
				results = r;
				// total count
				if (totalCountPromise) {
					return totalCountPromise.then(function(ids){
						results.totalCount = ids ? ids.length : 0;
						return results;
					});
				} else {
					return results;
				}
			});
		}
	}
};

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
		result = (field === 'id' ? '#' : (coll+':*->'+field));
dir([field, result]);
		return result;
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
						var score = id; // TODO: more advanced score?
						return callAsync(db.zadd, [collection, score, id]);
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
			var needBulkFetch = false; // whether to fetch whole dataset to process it here
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
					var s = args[0], e = args[1], l = e-s;
					if (l <= 0) l = 0;
					if (s > 0) options.offset += s, options.limit -= s;
					if (l < options.limit) options.limit = l;
				} else if (func == 'select') {
					options.fields = args;
				// process basic criteria
				} else if (RQ.knownOperators.indexOf(func)) {
					needBulkFetch = true;
				}
			});

			var args = [collection];

			// request full recordset length
			if (!needBulkFetch && directives.range && directives.range.calculateTotalCount) {
				// N.B. due to zcard() doesn't respect options.offset and options.limit
				// we have to correct returned totalCount manually!
				// cache slice offset and length
				var sliceOffset = options.offset;
				var sliceLimit = options.limit;
				// totalCount will be the minimum of unsliced query length and slice length
				var totalCountPromise = callAsync(db.zcard, args).then(function(totalCount){
					totalCount -= sliceOffset;
					if (totalCount < 0)
						totalCount = 0;
					if (sliceLimit < totalCount)
						totalCount = sliceLimit;
					return totalCount;
				});
				// apply the final slice due to Range:
				var offset = directives.range.start, limit = directives.range.limit;
				if (limit <= 0) limit = 0;
				if (offset > 0) options.offset += offset, options.limit -= offset;
				if (limit < options.limit) options.limit = limit;
			}

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

			// apply slice(s)
			if (!needBulkFetch) {
				args.push('limit');
				args.push(options.offset);
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
					if (flen == 1) {
						r.push(value);
					} else {
						hash[fields[j++]] = value;
						if (j == flen) {
							r.push(hash);
							j = 0;
							hash = {};
						}
					}
				}
				results = r;
				// process advanced query?
				if (needBulkFetch) {
					// pass the lazy array to RQ executor
					//query = {func: 'and', args: [{func: 'eq', args: ['author', 'Vladimir1']}]};
					//query = 'eq(author%22,Vladimir1%22%7c%7c%28delete1%20this%29%7c%7c%22)';
					//query = 'eq(author,Vladimir1)';
					results = RQ.executeQuery(query, directives, results);
				} else {
					results.totalCount = totalCountPromise;
				}
				return results;
			});
		}
	}
};

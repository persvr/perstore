/**
 * TODO: Integrate this with tlrobinson's json-rpc project
 * Module for interacting with a WebWorker through JSON-RPC.
 * You can make a module accessible through JSON-RPC as easily as:
 * some-module.js:
 * require("./json-rpc-worker").server(exports);
 *
 * And to create this worker and fire it off:
 * var Worker = require("worker"),
 *     client = require("./json-rpc-worker").client;
 * var workerInterface = client(new Worker("some-module"));
 * workerInterface.call("foo", [1, 3]).then(function(result){
 * 	... do something with the result ...
 * });
 *
 */
var observe = require("promised-io/observe").observe,
	print = require("promised-io/process").print,
	when = require("promised-io/promise").when,
	currentMetadata;

var invoke = exports.invoke = function(target, rpc, metadata){
	currentMetadata = metadata;
	try{
		return when(when(target, function(target){
			var result;
			if(target[rpc.method] || !target.__noSuchMethod__){
				return target[rpc.method].apply(target, rpc.params);
			}
			else{
				return target.__noSuchMethod__.call(target, rpc.method, rpc.params);
			}
		}), function(result){
				if(result instanceof Response){
					result.body = {
						result: result.body,
						error: null,
						id: rpc.id
					}
					return result;
				}
				return {
					result: result,
					error: null,
					id: rpc.id
				};
			}, error);
	}
	catch(e){
		return error(e);
	}
	function error(e){
		print(e.stack || (e.rhinoException && e.rhinoException.printStackTrace()) || (e.name + ": " + e.message));
		return {
			result: null,
			error: e.message,
			id: rpc.id
		};

	};
};

exports.server = function(rpcObject){
        Titanium.API.debug("json-rpc  exports.server global");
	if (global.onmessage) // dedicated worker
		observe(global, "onmessage", handleMessage);
	else // shared worker
		observe(global, "onconnect", function (e) { e.port.onmessage = handleMessage; });

	function handleMessage(event){
		var data = event.data;
		if("id" in data && "method" in data && "params" in data){
			postMessage(invoke(rpcObject, event.data));
		}
	}
};

var nextId = 1;
exports.client = function(worker){
	if(worker.port){
		worker = worker.port;
	}
	var requestsWaiting = {};
	observe(worker, "onmessage", function(event){
		var data = event.data;
		if(requestsWaiting[data.id]){
			if(data.error === null){
				requestsWaiting[data.id].fulfill(data.result);
			}
			else{
				requestsWaiting[data.id].error(data.error);
			}
			delete requestsWaiting[data.id];
		}
	});
	return {
		call: function(method, params){
			var id = nextId++;

			worker.postMessage({
				id: id,
				method: method,
				params: params
			});
			promise = new Promise();
			requestsWaiting[id] = promise;
			return promise;
		}
	};
};
try{
	var Response = require("pintura/jsgi/response").Response;
}catch(e){
	Response = function(){};
}

exports.getMetadata = function(){
	return currentMetadata;
};

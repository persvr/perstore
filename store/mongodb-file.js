// a simple extension of a the mongodb object store adaptor to handle saving binary
// content incoming from pintura

var MongoDB = require('./mongodb'),
	mongoDriver = require('mongodb'),
	fs = require("promised-io/fs");

module.exports = function(options){
	var store = MongoDB(options);
	var originalPut = store.put;
	function convertObjectToStream(object){
		if(object){
			var contents = object.contents;
			//delete object.contents;
			// a very simple stream
			object.forEach = function(each){
				each(contents.buffer);
			};
			object["content-type"] = object.type;
			var disposition = 'attachment';
			if (object.filename) {
				disposition += ';filename="' + object.filename + '"';
			}
			var metadata = {
				"content-type": object.type,
				"content-length": contents.buffer.length,
				"content-disposition": disposition,
				"filename": object.filename
			};
			metadata.alternates = [object];
			object.forEach.binary = true;
			object.getMetadata = function(){
				return metadata;
			}
			return object;
		}
	}
	store.put = function(object, directives){
		var contents = fs.read(object.path, 'binary');
		object.contents = new mongoDriver.Binary(new Buffer(contents, "binary"));
		var returnValue = originalPut.call(this, object, directives);
		convertObjectToStream(object);
		return returnValue;
	};
	var originalGet = store.get;
	store.get = function(id, directives){
		return originalGet.call(this, id, directives).then(convertObjectToStream);
	};
	return store;
}
/**
 * A very simple filesystem based storage
 */
var fs = require("promised-io/fs"),
	MIME_TYPES = require("jack/mime").MIME_TYPES,
	when = require("promised-io/promise").when,
	AutoTransaction = require("../stores").AutoTransaction;

function BinaryFile(){
}

var FileSystem = exports.FileSystem = function(options){
	var fsRoot = require("commonjs-utils/settings").dataFolder || "data"
	if(options.dataFolder){
		fsRoot = options.dataFolder.charAt(0) == '/' ? options.dataFolder : fsRoot + '/' + options.dataFolder;
	}
	
	var store = AutoTransaction({
		get: function(id, metadata){
			//print("FileSystem get(): " + id);
			var filename,extraParts;
			var parts = getFilePathAndMetadata(id);
			extraParts = parts.extra;
			var fp= parts.file; 
			if (fs.statSync(fp).isFile()) {
				filename = fp;
			}else {
				fp = fp + (options.defaultExtension ? ("."+options.defaultExtension):"");
				if (fs.statSync(fp).isFile()) {
					filename = fp;
				}
			}

			if (!filename){
				return;
			}

			var extension = filename.match(/\.[^\.]+$/);
			var f = new BinaryFile();

			f.forEach = function(callback){
				var file = fs.open(filename, "br");
				return file.forEach(callback);
			};
				
			f.getMetadata = function(){
				return f;
			}
			var pathParts = filename.split("/")
			var fname = pathParts[pathParts.length-1];
			f.alternates = [f];
			f['content-type']= (extraParts && extraParts[0]) ? extraParts[0] : MIME_TYPES[extension] ;

			f['content-disposition']= ((extraParts && extraParts[1] && (extraParts[1].charAt(0)=="a")) ? "attachment" : "inline") + "; filename=" + fname;
			f["content-length"]=fs.statSync(filename).size;

			return f;
		},
		put: function(object, directives){
			var id = object.id = directives.id || generateId(object);
			var filename = getFilePathAndMetadata(id).file;
			return when(fs.stat(filename),
				function(){
					if(directives.overwrite === false){
						throw new Error("Can not overwrite existing file");
					}
					return writeFile();
				},
				function(){
					if(directives.overwrite === true){
						throw new Error("No existing file to overwrite");
					}
					return writeFile();
				});
			function writeFile(){
				var path = object.path || object.tempfile, forEach = object.forEach;
				store.addToTransactionQueue(function(){
					fs.makeTree(filename.substring(0, filename.lastIndexOf("/")));
					if(path){
						return when(fs.move(path, filename), function(){
							return id;
						});
					}
					var file = fs.open(filename, "wb");
					return when(forEach.call(object, function(buffer){
						file.write(buffer);
					}), function(){
						file.close();
						return id;
					});
				});
			}
		},
		"delete": function(id, directives){
			var path = getFilePathAndMetadata(id).file;
			store.addToTransactionQueue(function(){
				fs.remove(path);
			});
		}
	});
	return store;
	function getFilePathAndMetadata(id){
		var extra = id.split("$");

		if (extra[1]){
			var extraParts = extra[1].split(",");
		}

		var fp= fsRoot + "/" + extra[0]; 
		return {
			file:fp,
			extra: extraParts
		};
	}
		
}
var REVERSE_MIME_TYPES = {};
for(var i in MIME_TYPES){
	REVERSE_MIME_TYPES[MIME_TYPES[i]] = i;
}
exports.depth = 1; // depth of file directory paths to use 

function generateId(object){
	var id = [];
	for(var i = 0; i < exports.depth; i++){
		id.push(Math.random().toString().substring(2,6));
	}
	var filename = object.filename || Math.random().toString().substring(2);
	id.push(filename);
	id = id.join("/");
	var extension = filename.match(/\.[^\.]+$/);
	var checkedAttachment;
	if(object["content-type"] && object["content-type"] !== MIME_TYPES[extension && extension[0]]){
		if(object.filename || !REVERSE_MIME_TYPES[object["content-type"]]){
			id += "$" + object["content-type"];
			checkedAttachment = true;
			if(object["content-disposition"] == "attachment"){
				id += ",attachment";
			}
		}else{
			id += REVERSE_MIME_TYPES[object["content-type"]];
		}
	}
	if(!checkedAttachment && object["content-disposition"] == "attachment"){
		id += "$attachment";
	}
	return id;
}

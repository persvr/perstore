/**
 * A very simple filesystem based storage 
 */
var File = require("file");
var fs = require("fs-promise"),
        MIME_TYPES = require("jack/mime").MIME_TYPES,
        when = require("promise").when;
function BinaryFile(){
}

BinaryFile.prototype.getMetadata = function(){
        // TODO: copy all properties except "serialize" and "getMetadata"
        return this;
};


var Directory = exports.FileSystem = function(path, options){
	print("new Directory: " + path);
	path = path.split("/");
	var fsRoot = (options.dataFolder || (require("commonjs-utils/settings").dataFolder || "data")).split("/"); 
	return {
		get: function(id, metadata){
			var parts;
			print("id: " + id);
			print("path: " + path);
			print("metadata: " , metadata);

			var filename;
			if (!metadata){ //if not metadata, this must be part of the path, only allow directories
                        	parts = path.concat(id.split("/"));
				return Directory(parts.join("/"),options);
			}else{
				var last=path.pop();
				parts = path;
				if (metadata.id == (last + "." + id)) {
					parts.push(metadata.id);
				}else{
					parts.push(last);
					parts.push(id);
				}
				var fullPath = fsRoot.concat(parts);	
				var fp = fullPath.join("/");	
	
			}

			for (var i in metadata){
				print("metadata[i]: " + i + ": " + metadata[i]);
			}

			var fp = fullPath.join("/");	
			print("Looking for File: " + fp);

			if (File.isFile(fp)) {
				print("Found File: " + fp);
				filename = fp;
			}else {
				fp = fp + (options.defaultExtension ? ("."+options.defaultExtension):"");
				print("Looking for file with defaultExtension. " + fp);
				if (File.isFile(fp)){
					print("Found file with default extension: " + fp);
					filename = fp;
				}
			}

			print("Have Filename?: " + filename);
			if (!filename){
				print("!filename");
				return;
			}	
	
                        var extension = filename.match(/\.[^\.]+$/);
			var f = new BinaryFile();

                        Object.defineProperty(f,"forEach", {
                                value: function(callback){
                                        // TODO: read the file in blocks for better scalability
					print("reading file: " + filename);
                                        var resultPromise = fs.read(filename,'b');
                                        callback(resultPromise);
                                        //resultPromise.then(callback);
                                        return resultPromise;
                                },
                                enumerable: false
                        });

			//is this correct? doesn't appear to me to be so according to rfc
			//f.alternates = f;

			var fparts = filename.split("/");
			fparts.shift();
			var f2 = fparts.join("/");
			print("FileSystem get():  Found file " + filename);
			f['content-type'] = MIME_TYPES[extension];
			f['content-disposition']=(id.charAt(0) == "a" ? "attachment" : "inline") + "; filename=" + f2;
			//f["content-length"]=fs.statSync(filename).size;

			for (var i in f){print(" f:" + i + " = " + f[i]);}
                        return f;
                },

		put: function(obj, metadata){
			print("obj: " + obj);
			for (var x in obj) {
				print("     x: " + x + ": " + obj[x]);
			}
			print("metadata: " + metadata);
			for (var x in metadata) {
				print("     x: " + x + ": " + metadata[x]);
			}
			
			var filename;
                        var filePath =  path+"/"+(obj.id?obj.id:metadata.id); 
			var dataFolder= options.dataFolder || (require("commonjs-utils/settings").dataFolder || "data/"); 
			var parts = (dataFolder + '/' + filePath).split("/")

			//make sure the directory exists or create it if not, piece by piece
			parts= parts.slice(0,parts.length-1);
			var p="";
			parts.forEach(function(dir){
				p = p + dir + "/";
				if (!File.isDirectory(p)){
					File.mkdir(p);
				}
			});

			filename = dataFolder + "/" + filePath + "." + options.defaultExtension;
			print("Put(): " + obj.id + ", path: " + path + ", dataFolder: " + dataFolder + ", filePath: " + filePath + " filename: " + filename); 
			File.write(filename, obj.content);
	
			return obj;
		}

	}
}


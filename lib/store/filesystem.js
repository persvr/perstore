/**
 * A very simple filesystem based storage
 */
var fs = require("promised-io/fs"),
        MIME_TYPES = require("jack/mime").MIME_TYPES,
        when = require("promised-io/promise").when;
function BinaryFile(){
}

BinaryFile.prototype.getMetadata = function(){
        // TODO: copy all properties except "serialize" and "getMetadata"
        return this;
};

var FileSystem = exports.FileSystem = function(path, options){
	path = path.split("/");
	var fsRoot = (options.dataFolder || (require("commonjs-utils/settings").dataFolder || "data")).split("/");
	return {
		get: function(id, metadata){
			print("FileSystem.get(" + id + "," + metadata + ")");
			var parts;
			var filename;
			if (!metadata){ //if not metadata, append to the path
                        	parts = path.concat(id.split("/"));
				return FileSystem(parts.join("/"),options);
			}else{
				var last=path.pop();
				var extraParts = last.split("~",2);
				parts = path;
				if (metadata.id == (last + "." + id)) {
					parts.push(extraParts[0] + "." + id);
				}else{
					parts.push(extraParts[0]);
					parts.push(id);
				}
				var fullPath = fsRoot.concat(parts);
				var fp = fullPath.join("/");

			}

			var fp = fullPath.join("/");

			if (fs.isFile(fp)) {
				filename = fp;
			}else {
				fp = fp + (options.defaultExtension ? ("."+options.defaultExtension):"");
				if (fs.isFile(fp)) {
					filename = fp;
				}
			}

			if (!filename){
				print("File Not Found: " + filename);
				return;
			}

                        var extension = filename.match(/\.[^\.]+$/);
			var f = new BinaryFile();

                        Object.defineProperty(f,"forEach", {
                                value: function(callback){
                                        // TODO: read the file in blocks for better scalability
                                        var resultPromise = fs.read(filename,'b');
                                        callback(resultPromise);
                                        return resultPromise;
                                },
                                enumerable: false
                        });

			//is this correct? doesn't appear to me to be so according to rfc
			//f.alternates = f;

			var fparts = filename.split("/");
			fparts.shift();
			var f2 = fparts.join("/");
			print("FileSystem get(): " + filename);
			f['content-type'] = MIME_TYPES[extension];

			var extraInfo = extraParts[1] && last.substring(last.indexOf("~") + 1).split("_");
			if(extraInfo){
				print("Request for file has embedded data: " + extraInfo);
				if(extraInfo[0]){
					f["content-type"] = extraInfo[0].replace(/~/,'/');
				}
				if(extraInfo[1]){
					f["content-disposition"] = "attachment";
				}
			}
			f['content-disposition']=(id.charAt(0) == "a" ? "attachment" : "inline") + "; filename=" + f2;
			f["content-length"]=fs.statSync(filename).size;
                        return f;
                },

		put: function(obj, metadata){
			var filename;
                        var filePath =  path+"/"+metadata.id; 
			var dataFolder= options.dataFolder || (require("commonjs-utils/settings").dataFolder || "data/");
			var parts = (dataFolder + '/' + filePath).split("/")

			//make sure the directory exists or create it if not, piece by piece
			parts= parts.slice(0,parts.length-1);
			var p="";
			parts.forEach(function(dir){
				p = p + dir + "/";
				if (!fs.isDirectory(p)){
					fs.mkdir(p);
				}
			});

			filename = dataFolder + "/" + filePath + "." + options.defaultExtension;
			//print("Put(): " + obj.id + ", path: " + path + ", dataFolder: " + dataFolder + ", filePath: " + filePath + " filename: " + filename); 
			File.write(filename, obj.content);

			return obj;
		}

	}
}

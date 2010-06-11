/**
 * A very simple filesystem based storage 
 */
var fs = require("file");
var FileSystem = exports.FileSystem = function(path, options){
	this.id = path;
	this.isDirectory = true;

	return {
		get: function(id, metadata){
			var filename;
			var dataFolder= (require("commonjs-utils/settings").dataFolder || "data/"); 
                        var filePath =  path  + '/' + id;

			if (fs.isDirectory(dataFolder + "/" + filePath) && !metadata){
				return FileSystem(filePath, options);
			}else{
				if (fs.isFile(dataFolder +"/" + filePath + "." + options.defaultExtension)) {
					filename = dataFolder + "/" + filePath + "." + options.defaultExtension;
				}
			}

			if (!filename){
				return;
				throw NotFoundError(filename);
			}	

			return {
				id: filePath,
				content: fs.read(filename)
			}
		},

		put: function(obj, metadata){
			print("Put() " + obj.id);
			var filename;
			var dataFolder= (require("commonjs-utils/settings").dataFolder || "data/"); 

                        var filePath =  obj.id;

			if (fs.isFile(dataFolder +"/" + filePath + "." + options.defaultExtension)) {
				filename = dataFolder + "/" + filePath + "." + options.defaultExtension;
			}

			if (!filename){
				throw NotFoundError(filename);
			}	

			print("Saving File: " + filename);
			fs.write(filename, obj.content);

			return obj;
		}

	}
}

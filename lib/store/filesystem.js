/**
 * A very simple filesystem based storage 
 */
var fs = require("file");
var FileSystem = exports.FileSystem = function(path, options){
	this.isDirectory=true;
	
	return {
		get: function(id, metadata){
			var filename;
                        var filePath =  path  + '/' + id;

			var dataFolder= options.dataFolder || (require("commonjs-utils/settings").dataFolder || "data/"); 
			//print("get(): " + id + ", path: " + path + " dataFolder: " + dataFolder + ", filePath: " + filePath); 
			//print("is directory: " +dataFolder + "/" + filePath +  fs.isDirectory(dataFolder + "/" + filePath));
		
			if (fs.isDirectory(dataFolder + "/" + filePath) && !metadata){
				return FileSystem(filePath, options);
			}else{
				//print("    - looking for: " + dataFolder +"/" + filePath + "." + options.defaultExtension);
				if (fs.isFile(dataFolder + "/" + filePath)) {
					filename = dataFolder + "/" + filePath;
				}else if (fs.isFile(dataFolder +"/" + filePath + "." + options.defaultExtension)) {
					filename = dataFolder + "/" + filePath + "." + options.defaultExtension;
				}
			}

			if (!filename){
				return;
			}	
			print("FileSystem get():  Found file " + filename);
			return {
				id: filePath,
				content: fs.read(filename)
			}
		},

		put: function(obj, metadata){
			var filename;
                        var filePath =  path+'/'+obj.id;
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
			print("Put(): " + obj.id + ", path: " + path + ", dataFolder: " + dataFolder + ", filePath: " + filePath + " filename: " + filename); 
			fs.write(filename, obj.content);
	
			return obj;
		}

	}
}

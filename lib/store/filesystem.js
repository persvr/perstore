/**
 * A very simple filesystem based storage 
 */
var FS = require("file");

print("Setup Filesystem");
var FileSystem = exports.FileSystem = function(path, options){
	this.id = path; 
	return {
		get: function(id,request){
			print("FileSystem Store Get called on " + this.id + " for " + id);
			print("Current Path: " + path);
			var filename;
			var dataFolder= (require("commonjs-utils/settings").dataFolder || "data/") ;
                        var filePath =  this.id + '/' + id;
			if (FS.isDirectory(dataFolder +"/" + filePath)){
				print ("Is Directory: " + filePath);
				//return FileSystem(filePath, options);
				return {
					id: filePath,
					directory: true
				}
				//return this;
			}else{
				var x = dataFolder + "/" + filePath;
				if (FS.isFile(x)){
					filename = x;
				}else if (FS.isFile(x + ".rst")){
					filename = x + ".rst";	
				}
			}

			if (!filename){
				print("Filename: " + filename + " NOT FOUND");
				return NotFoundError(filename);
			}	

			print("Final FileName: " + filename);
			return {
				content: FS.read(filename)
			}

		}/*,
		openObjectStore: function(storeName){
			print("openObjectStore: " + storeName);
		}*/

	}
}

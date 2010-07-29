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

var FileSystem = exports.FileSystem = function(options){

	var fsRoot = (options.dataFolder || (require("commonjs-utils/settings").dataFolder || "data")); 
	return {
		get: function(id, metadata){
			//print("FileSystem get(): " + id); 
			var filename,extraParts;
			var extra = id.split("$");

			if (extra[1]){
				var extraParts = extra[1].split(",");
			}

			var fp= fsRoot + "/" + extra[0]; 
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

                        Object.defineProperty(f,"forEach", {
                                value: function(callback){
                                        // TODO: read the file in blocks for better scalability
                                        var resultPromise = fs.read(filename,'b');
                                        callback(resultPromise);
                                        return resultPromise;
                                },
				enumerable: true,
                        });

			var pathParts = filename.split("/")
			var fname = pathParts[pathParts.length-1]; 
			f['content-type']= (extraParts && extraParts[0]) ? extraParts[0] : MIME_TYPES[extension] ;

			f['content-disposition']= ((extraParts && extraParts[1] && (extraParts[1].charAt(0)=="a")) ? "attachment" : "inline") + "; filename=" + fname;
			f["content-length"]=fs.statSync(filename).size;

                        return f;
                }
	}
}


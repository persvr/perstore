/**
 * A very simple file-based storage of JSON
 */
 
//TODO:
// * Switch to full async-ready file access
// * Index (on-demand) different object properties
// * Provides random access in-place record updates and append-only mode updates (rather than fully rewriting the file)
var Memory = require("./memory").Memory;
var JSONExt = require("json-ext");
var AutoTransaction = require("stores").AutoTransaction;
var File = require("file");
exports.JSFile = function(filename){
	var lastMod = 0;
	var store = Memory();
	store.transaction= function(){
		try{
			var stat = File.stat(filename);
		}catch(e){
		}
		if((stat && stat.mtime)){
			// only narwhal in get in this branch
			var fileTime = stat.mtime.getTime();
			if(fileTime > lastMod){
				lastMod = fileTime;
				store.index = JSONExt.parse(File.read(filename));
			}
		}
		else if(lastMod === 0){
			// node goes in here right now
			try{
				store.index = JSONExt.parse(File.read(filename).wait());
			}catch(e){
				// if it doesn't exist, node throws an error
			}
			lastMod = 1; // just read it once in node
		}
		
		return {
			commit: function(){
				File.write(filename, JSONExt.stringify(store.index));
			},
			abort: function(){
			}
		};
	};
	store.getLastModified = function(){
		try{
			var stat = File.stat(filename);
		}catch(e){
			print(e);
		}
		if(stat && stat.mtime){
			return stat.mtime;
		}
	};
	store.getETag = function(){
		var lastModified = store.getLastModified();
		return lastModified && lastModified.getTime();
	};
	return AutoTransaction(store);
};
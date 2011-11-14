try{
	var read = require("fs").readFileSync;
}catch(e){
}
if(!read){
	read = require("fs").read;
}
if(!read){
	read = require("file").read;
}
try{
	var settings = JSON.parse(read("local.json").toString("utf8"));
	for(var i in settings){
		exports[i] = settings[i];
	}
}catch(e){
	e.message += " trying to load local.json, make sure local.json is in your current working directory";
	throw e;
}
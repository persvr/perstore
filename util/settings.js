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
}catch(e){
	settings = require("rc")("persvr",{
		"processes": 2,
		"port": 8082,
		"repl": true,
		"replPort": 5555,
		"security":{
		},
		"dataFolder": "data"
	});
}
for(var i in settings){
	exports[i] = settings[i];
}

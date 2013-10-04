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
	try{
		settings = require("rc")("persvr",{
			"processes": 2,
			"port": 8082,
			"repl": true,
			"replPort": 5555,
			"security":{
			},
			"dataFolder": "data"
		});
	}catch(e2){
		console.error("A local.json file could not be found or parsed, and rc was not available to load configuration settings", e);		
	}
}
for(var i in settings){
	exports[i] = settings[i];
}

var fs = require("fs");
exports.read = fs.readFileSync;
exports.write = fs.writeFileSync;
exports.isFile = function(path){
	try{
		return fs.statSync(path).isFile();
	}catch(e){
		return false;
	}
};
exports.stat = function(path){
	try{
		return fs.statSync(path);
	}catch(e){
		return {size:0};
	}
};
exports.join = function () {
    if (arguments.length == 1 && arguments[0] == "") {
        return '/';
    }
    return Array.prototype.join.call(arguments, '/');
};
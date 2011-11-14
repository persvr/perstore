exports.deepCopy = function deepCopy(source, target, overwrite){
	for(var i in source){
		if(source.hasOwnProperty(i)){
			if(typeof source[i] === "object" && typeof target[i] === "object"){
				deepCopy(source[i], target[i], overwrite);
			}
			else if(overwrite || !target.hasOwnProperty(i)){
				target[i] = source[i];
			}
		}
	}
	return target;
};

//TODO: should branch to using Object.keys if a native version is available. The
// native version is slightly faster than doing a for-in loop (but a simulated version
// wouldn't be) for rhino (but not v8). We could also have a branch for java-based copier that would
// certainly be much faster
exports.copy = function(source, target){
	for(var i in source){
		if(source.hasOwnProperty(i)){
			target[i] = source[i];
		}
	}
	return target;
}

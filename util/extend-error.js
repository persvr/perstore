({define:typeof define!="undefined"?define:function(factory){module.exports=factory(require)}}).
define(function(require){
	// Creates a custom error that extends JS's Error
function ErrorConstructor(name, superError){
	superError = superError || Error;
	function ExtendedError(message){
		var e = new Error(message);
		e.name = name;
		var ee = Object.create(ExtendedError.prototype);
		ee.stack = e.stack;
		ee.message = e.message;
		return ee;
	}
	ExtendedError.prototype = Object.create(superError.prototype);
	ExtendedError.prototype.name = name;
	return ExtendedError;
};
return ErrorConstructor.ErrorConstructor = ErrorConstructor;
});
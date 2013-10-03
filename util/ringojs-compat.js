// Polyfill for  __proto__ and Object.setPrototypeOf
// see http://stackoverflow.com/questions/10476560/proto-when-will-it-be-gone-alternatives
// and https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/setPrototypeOf
// and https://github.com/ringo/ringojs/issues/181
var testobj = {};
Object.setPrototypeOf = Object.setPrototypeOf || function ( obj, proto ) {
	if ( testobj.__proto__ ) {
		obj.__proto__ = proto;
		return obj;
	}
    var type = typeof proto;
    if ( ( typeof obj == "object" || typeof obj == "function" ) && ( type == "object" || type == "function" ) ) {
        var constructor = function ( obj ) {
            var ownPropertyNames = Object.getOwnPropertyNames ( obj );
            var length = ownPropertyNames.length;
            for ( var i = 0; i < length; i++ ) {
                var ownPropertyName = ownPropertyNames[i];
                this[ownPropertyName] = obj[ownPropertyName];
            }
        };
        constructor.prototype = proto;
        return new constructor(obj);
    } else throw new TypeError ( "Expected both the arguments to be objects." );
}
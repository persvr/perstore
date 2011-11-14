/**
* Declarative subset of JavaScript with a few extras beyond JSON, including
* dates, non-finite numbers, etc.
* Derived from and uses:
http://www.JSON.org/json2.js
    2008-11-19

    Public Domain.

    NO WARRANTY EXPRESSED OR IMPLIED. USE AT YOUR OWN RISK.
 
 */

if(typeof JSON === "undefined"){
	require("json");
}

var nativeJson = !!JSON.parse.toString().match(/native code/);
exports.parse = function (text) {

// The parse method takes a text and an optional reviver function, and returns
// a JavaScript value if the text is a valid JSON text.

    var j;

    function walk(value) {

// The walk method is used to recursively walk the resulting structure so
// that modifications can be made.

        var k;
        if (value && typeof value === 'object') {
            for (k in value) {
            	var v = value[k];
		        if (typeof v === 'string') {
		            var a =
		/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d*)?)Z$/.exec(v);
		            if (a) {
		                value[k] = new Date(Date.UTC(+a[1], +a[2] - 1, +a[3], +a[4],
		                    +a[5], +a[6]));
		            }
		        }
            	else if (typeof v === 'object') {
                	walk(v);
            	}
            }
        }
    }


// Parsing happens in four stages. In the first stage, we replace certain
// Unicode characters with escape sequences. JavaScript handles many characters
// incorrectly, either silently deleting them, or treating them as line endings.

    cx.lastIndex = 0;
    if (cx.test(text)) {
        text = text.replace(cx, function (a) {
            return '\\u' +
                ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        });
    }

// In the second stage, we run the text against regular expressions that look
// for non-JSON patterns. We are especially concerned with '()' and 'new'
// because they can cause invocation, and '=' because it can cause mutation.
// But just to be safe, we want to reject all unexpected forms.

// We split the second stage into 4 regexp operations in order to work around
// crippling inefficiencies in IE's and Safari's regexp engines. First we
// replace the JSON backslash pairs with '@' (a non-JSON character). Second, we
// replace all simple value tokens with ']' characters. Third, we delete all
// open brackets that follow a colon or comma or that begin the text. Finally,
// we look to see that the remaining characters are only whitespace or ']' or
// ',' or ':' or '{' or '}'. If that is so, then the text is safe for eval.
var backSlashRemoved = text.replace(/\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g, '@');
    if (/^[\],:{}\s]*$/.
test(backSlashRemoved.
replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, ']').
replace(/(?:^|:|,)(?:\s*\[)+/g, ''))) {
    	// it is pure JSON
    	if(nativeJson){
    		// use the native parser if available
    		j = JSON.parse(text);
    	}
    	else{
    		// revert to eval
    		j = eval('(' + text + ')');
    	}
		walk(j);
        return j;
    }
    else if (/^[\],:{}\s]*$/.
test(backSlashRemoved.
replace(/"[^"\\\n\r]*"|'[^'\\\n\r]*'|\(?new +Date\([0-9]*\)+|[\w$]+\s*:(?:\s*\[)*|true|false|null|undefined|-?Infinity|NaN|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, ']').
replace(/(?:^|:|,|&&)(?:\s*\[)+/g, ''))) {
    	// not pure JSON, but safe declarative JavaScript
		j = eval('(' + text + ')');
		walk(j);
        return j;
    }

// If the text is not JSON parseable, then a SyntaxError is thrown.

    throw new SyntaxError('JSON.parse');
};

var cx = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;

var nativeConstructors = {"String":String, "Object":Object, "Number":Number, "Boolean":Boolean, "Array":Array, "Date":Date};
exports.stringify = ({}).toSource ?
	// we will use toSource if it is available
	(function(){
		Object.keys(nativeConstructors).forEach(function(name){
			(global[name] || global()[name]).toSource = function(){ // you have to call global() in Rhino. Why?!? 
				return name;
			};
		});
		return function(value){
			if(value && typeof value == "object" || typeof value == "function"){
				var source = value.toSource();
				if(source.charAt(0) == "("){
					// remove the surrounding paranthesis that are produced
					source = source.substring(1, source.length - 1);
				}
				return source;
			}
			if(typeof value === "number" && !isFinite(value)){
				return value.toString();
			}
			if(typeof value === "undefined"){
				return "undefined";
			}
			return JSON.stringify(value);
		};
	})() : 
	(function(){

    var cx = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        escapable = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        gap,
        indent,
        meta = {    // table of character substitutions
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '"' : '\\"',
            '\\': '\\\\'
        },
        rep;


    function quote(string) {

// If the string contains no control characters, no quote characters, and no
// backslash characters, then we can safely slap some quotes around it.
// Otherwise we must also replace the offending characters with safe escape
// sequences.

        escapable.lastIndex = 0;
        return escapable.test(string) ?
            '"' + string.replace(escapable, function (a) {
                var c = meta[a];
                return typeof c === 'string' ? c :
                    '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
            }) + '"' :
            '"' + string + '"';
    }


    function str(key, holder) {

// Produce a string from holder[key].

        var i,          // The loop counter.
            k,          // The member key.
            v,          // The member value.
            length,
            mind = gap,
            partial,
            value = holder[key];


// If we were called with a replacer function, then call the replacer to
// obtain a replacement value.

        if (typeof rep === 'function') {
            value = rep.call(holder, key, value);
        }

// What happens next depends on the value's type.

        switch (typeof value) {
        case 'function':
        	if(nativeConstructors[value.name] === value){
        		return value.name;
        	}
        	value = value.toString();

        case 'string':
            return quote(value);

        case 'number':
        case 'boolean':
        case 'undefined':
        case 'null':

            return String(value);

// If the type is 'object', we might be dealing with an object or an array or
// null.

        case 'object':

// Due to a specification blunder in ECMAScript, typeof null is 'object',
// so watch out for that case.

            if (!value) {
                return 'null';
            }

// Make an array to hold the partial results of stringifying this object value.

            gap += indent;
            partial = [];

// Is the value an array?

            if (Object.prototype.toString.apply(value) === '[object Array]') {

// The value is an array. Stringify every element. Use null as a placeholder
// for non-JSON values.

                length = value.length;
                for (i = 0; i < length; i += 1) {
                    partial[i] = str(i, value) || 'null';
                }

// Join all of the elements together, separated with commas, and wrap them in
// brackets.

                v = partial.length === 0 ? '[]' :
                    gap ? '[\n' + gap +
                            partial.join(',\n' + gap) + '\n' +
                                mind + ']' :
                          '[' + partial.join(',') + ']';
                gap = mind;
                return v;
            }
			if (value instanceof Date){
				return "new Date(" + value.getTime() + ")";
			}
			
            for (k in value) {
                if (Object.hasOwnProperty.call(value, k)) {
                    v = str(k, value);
                    partial.push(quote(k) + (gap ? ': ' : ':') + v);
                }
            }

// Join all of the member texts together, separated with commas,
// and wrap them in braces.

            v = partial.length === 0 ? '{}' :
                gap ? '{\n' + gap + partial.join(',\n' + gap) + '\n' +
                        mind + '}' : '{' + partial.join(',') + '}';
            gap = mind;
            return v;
        }
    }

// If the JSON object does not yet have a stringify method, give it one.

    return function (value, replacer, space) {

// The stringify method takes a value and an optional replacer, and an optional
// space parameter, and returns a JSON text. The replacer can be a function
// that can replace values, or an array of strings that will select the keys.
// A default replacer method can be provided. Use of the space parameter can
// produce text that is more easily readable.

            var i;
            gap = '';
            indent = '';

// If the space parameter is a number, make an indent string containing that
// many spaces.

            if (typeof space === 'number') {
                for (i = 0; i < space; i += 1) {
                    indent += ' ';
                }

// If the space parameter is a string, it will be used as the indent string.

            } else if (typeof space === 'string') {
                indent = space;
            }

// If there is a replacer, it must be a function or an array.
// Otherwise, throw an error.

            rep = replacer;
            if (replacer && typeof replacer !== 'function' &&
                    (typeof replacer !== 'object' ||
                     typeof replacer.length !== 'number')) {
                throw new Error('JSON.stringify');
            }

// Make a fake root object containing our value under the key of ''.
// Return the result of stringifying the value.

            return str('', {'': value});
        };
    
})();
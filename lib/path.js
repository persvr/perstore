/**
 * Module for looking up objects by path-based identifiers
 */
var all = require("promised-io/promise").all;

exports.resolve = function(model, id, metadata){
	metadata = metadata || {};
	id = '' + id;
	var parts = id.split("/");
	for(var i = 1; i < parts.length; i++){
		model = model.get(decodeURIComponent(parts[i]));
	}
	id = parts[0];
	
	if(id.indexOf('.') > -1 && (id.indexOf('?') == -1 || id.indexOf('.') < id.indexOf('?'))){
		var parts = id.split('.');
		var value = model.get(parts[0]);
		for(var i = 1; i < parts.length; i++){
			value = value && (value.get ? value.get(decodeURIComponent(parts[i])) : value[decodeURIComponent(parts[i])]);
		}
		return value;
	}
	if(id === '' || id.match(/\?|\[/)){
		return model.query(id, metadata);
	}
	var parts = id.match(/[\.#][^\.#]+/g);
	if(parts){
		var value = model.get(id.match(/^([^\.#]*)[\.#]/)[0]);
		for(var i = 0; i < parts.length; i++){
			var part = parts[i];
			value = part[0] === '.' ? value.get(decodeURIComponent(part.substring(1))) : value[decodeURIComponent(part.substring(1))];
		}
		return value;
	}
	if(id.match(/^\(.*\)$/)){
		// handle paranthesis embedded, comma separated ids
		if(id.length == 2){ // empty array
			return [];
		}
		var parts = id.substring(1, id.length -1).split(',');
		return all(parts.map(function(part){
			return model.get(decodeURIComponent(part), metadata);
		}));
	}
	return model.get(decodeURIComponent(id), metadata);
};

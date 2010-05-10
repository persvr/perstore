/**
 * This module provides querying functionality 
 */
 

exports.jsonQueryCompatible = true;
var parseQuery = exports.parseQuery = function(/*String*/query, parameters){
	if(exports.jsonQueryCompatible){
		query = query.replace(/%3C=/g,"=le=").replace(/%3E=/g,"=ge=").replace(/%3C/g,"=lt=").replace(/%3E/g,"=gt=");
	}
	if(query.charAt(0)=="?"){
		query = query.substring(1);
	}
	var terms = [];
	var originalTerms = terms;
	if(query.replace(/([&\|,])?(([\+\*\-:\w%\._]+)(=[a-z]*=|=|=?<|=?>|!=)([\+\*\$\-:\w%\._,]+)|(([\+\*\\$\-:\w%\._]+)(\(?))|(\))|(.+))/g,
		 //      <-delim-> <--- name ---------  comparator   -----   value  ---->|<-function/value -- openParan->|<-closedParan->|<-illegalCharacter->
		function(t, termDelimiter, expression, name, comparator, value, call, functionOrValue, openParan, closedParan, illegalCharacter){
			if(comparator){
				var comparison = {
					type:"comparison", 
					comparator: convertComparator(comparator), 
					name: convertPropertyName(name),
					value: stringToValue(value, parameters),
					logic: termDelimiter
				};
				terms.push(comparison);
			}
			else if(call){
				if(openParan){
					// a function call
					var callNode = {
						type:"call", 
						parameters:[],
						name: convertPropertyName(functionOrValue),
						logic: termDelimiter
					};
					terms.push(callNode);
					callNode.parameters.parent = terms;
					terms = callNode.parameters;
				}
				else{
					// a value
					terms.push(stringToValue(functionOrValue, parameters));
				}
			}
			else if(closedParan){
				if(!terms.parent){
					throw new URIError("Closing paranthesis without an opening paranthesis");
				}
				terms = terms.parent;
			}
			else if(illegalCharacter){
				throw new URIError("Illegal character in query string encountered " + illegalCharacter);
			}
			return "";
		})){
		// any extra characters left over from the replace indicates invalid syntax
		throw new URIError("Invalid query syntax");
	}
	terms.toString = function() {
		var qs = "?";
		for (var i = 0; i < this.length; i++) {
			var term = this[i];
			qs += term.logic || "";
			if (term.type == "comparison") {
				qs += term.name + term.comparator + term.value;
			}
			else if (term.type == "call") {
				qs += term.name + "(" + term.parameters + ")"
			}
			else {
				// FIXME should we throw here?
			}
		}
		if (qs == "?") return "";
		return qs;
	}
	return terms;
	/*
	var TOKEN = /\(|[\w%\._]+/g;
var OPERATOR = /[-=+!]+|\(/g;
var NEXT = /[&\|\)]/g;
	
	TOKEN.lastIndex = 0;
	function group(){
		var ast = [];
		var match = TOKEN.exec(query);
		if(match === '('){ 
			ast.push(group());
		}
		else{
			OPERATOR.lastIndex = TOKEN.lastIndex;
			var operator = OPERATOR.exec(query);
			var comparison = {};
			ast.push(comparison);
			if(operator == '('){
				comparison.type = "call";
				comparison.parameters = 
			}
			comparison.type = operator;
			
		}
		return ast;
	}
	return group();*/
}
exports.QueryFunctions = function(){
	
}
exports.QueryFunctions.prototype = {
	sort: function(){
		var terms = [];
		for(var i = 0; i < arguments.length; i++){
			var sortAttribute = arguments[i]; 
			var firstChar = sortAttribute.charAt(0);
			var term = {attribute: sortAttribute, ascending: true};
			if (firstChar == "-" || firstChar == "+") {
				if(firstChar == "-"){
					term.ascending = false;
				}
				term.attribute = term.attribute.substring(1);
			}
			terms.push(term);
		}
		this.sort(function(a, b){
			for (var i = 0; i < terms.length; i++) {
				var term = terms[i];
				if (a[term.attribute] != b[term.attribute]) {
					return term.ascending == a[term.attribute] > b[term.attribute] ? 1 : -1;
				}
			}
			return true; //undefined?
		});
		return this;
	},
	"in": function(){
		var indexOf = Array.indexOf;
		return this.some(function(item){
			return indexOf(arguments, item) > -1;
		});
	},
	select: function(first){
		if(arguments.length == 1){
			return this.map(function(object){
				return object[first];
			});
		}
		var args = arguments;
		return this.map(function(object){
			var selected = {};
			for(var i = 0; i < args.length; i++){
				var propertyName= args[i];
				if(object.hasOwnProperty(propertyName)){
					selected[propertyName] = object[propertyName];
				}
			}
			return selected;
		});
	},
	slice: function(){
		return this.slice.apply(this, arguments);
	}
};
exports.executeQuery = function(query, options, target){
	if(typeof query === "string"){
		query = parseQuery(query, options && options.parameters);
	}
	var functions = options.functions || exports.QueryFunctions.prototype;
	var inComparision = false;
	var js = "";
	query.forEach(function(term){
		if(term.type == "comparison"){
			if(!options){
				throw new Error("Values must be set as parameters on the options argument, which was not provided");
			}
			if(!inComparision){
				inComparision = true;
				js += "target = target.filter(function(item){return ";
			}
			else{
				js += term.logic + term.logic;
			}
			var index = (options.parameters = options.parameters || []).push(term.value);
			if(term.comparator == "="){
				term.comparator = "==";
			}
			js += "item." + term.name + term.comparator + "options.parameters[" + (index -1) + "]";
			
		}
		else if(term.type == "call"){
			if(inComparision){
				js += "});";
				inComparision = false;
			}
			if(functions[term.name]){
				var index = (options.parameters = options.parameters || []).push(term.parameters);
				js += "target = functions." + term.name + ".apply(target,options.parameters[" + (index -1) + "]);";
			}
			else{
				throw new URIError("Invalid query syntax, " + term.name + " not implemented");
			}
		}
		else{
			throw new URIError("Invalid query syntax, unknown type");
		}
	});
	if(inComparision){
		js += "});";
		first = false;
	}
	var results = eval(js + "target;"); 
	if(options.start || options.end){
		var totalCount = results.length;
		results = results.slice(options.start || 0, (options.end || Infinity) + 1);
		results.totalCount = totalCount;
	}
	return results;
}
function throwMaxIterations(){
	throw new Error("Query has taken too much computation, and the user is not allowed to execute resource-intense queries. Increase maxIterations in your config file to allow longer running non-indexed queries to be processed.");
}
exports.maxIterations = 10000;

exports.convertors = {
	"number" : function(x){
		var n = +x;
		return (!isNaN(n)) ? n : x;
	},
	"date"   : function(x){
		var date = x + "0000-01-01T00:00:00Z".substring(x.length);
		date.replace(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d*)?)Z$/, function(dummy, y, mp1, d, h, m, s){
			x = new Date(Date.UTC(+y, +mp1 - 1, +d, +h, +m, +s));
		});
		return x;
	},
	/*"array"  : function(x){
		// TODO: arrays should be enclosed with braces!
		if (x.indexOf(',') > -1) {
			var array = [];
			string.split(',').forEach(function(i){
				array.push(stringToValue(i)); // TODO: , parameters));
			});
			return array;
		}
	},*/
	"re"     : function(x){
		// poorman regexp? *foo, bar*
		/***v = (v.charAt(0) != '*') ? '^' + v : v.substring(1);
		v = (v.slice(-1) != '*') ? v + '$' : v.substring(0, v.length-1);***/
		return new RegExp(x, 'i');
	},
	"RE"     : function(x){return new RegExp(x)},
	"boolean": function(x){return Boolean(x)},
	"string" : function(x){return x},
};
function stringToValue(string, parameters){
	function tryConvertor(type, value){
		value = (value instanceof Array) ? value[0] : value;
		var t = exports.convertors[type]; // TODO: how to disallow possible access intrinsic object props here!
		if (t)
			return (t instanceof Function) ? t(value) : t;
		else
			throw new URIError("Unknown type " + type); // TODO: should we throw or just ignore?
	}


		// TODO: arrays should be enclosed with braces!
		if (string.indexOf(',') > -1) {
			var array = [];
			string.split(',').forEach(function(x){
				array.push(stringToValue(x)); // TODO: , parameters));
			});
			return array;
		}


	// try process explicit modifier
	if(string.indexOf(":") > -1){
		var parts = string.split(":");
		return tryConvertor(parts.shift(), decodeURIComponent(parts));
	}
	// substitute positional parameter, if any
	if(string.charAt(0) == "$"){
		return parameters[parseInt(string.substring(1)) - 1];
	}
	// decode the string
	string = decodeURIComponent(string);
	// guess datatype, iterating by convertors
	switch(string){
		case "true": return true;
		case "false": return false;
		case "null": return null;
		case "undefined": return undefined;
	}
	for (var t = ["number","date"], l = t.length, i = 0; i < l; ++i) {
		var v = tryConvertor(t[i], string);
		if (!(typeof v === 'string'))
			return v;
	}
	//
	if(exports.jsonQueryCompatible){
		if(string.charAt(0) == "'" && string.charAt(string.length-1) == "'"){
			return JSON.parse('"' + string.substring(1,string.length-1) + '"');
		}
	}
	return string;
};

function convertComparator(comparator){
	switch(comparator){
		case "=lt=" : return "<";
		case "=gt=" : return ">";
		case "=le=" : return "<=";
		case "=ge=" : return ">=";
		case "==" : return "=";
		case "=in=" : return "<<";
	}
	return comparator;
}

function convertPropertyName(property){
	if(property.indexOf(".") > -1){
		return property.split(".").map(function(part){
			return decodeURIComponent(part);
		});
	}
	return decodeURIComponent(property);
}

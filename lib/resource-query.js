/**
 * This module provides querying functionality 
 */
 

exports.jsonQueryCompatible = true;
var operatorMap = {
	"=": "eq",
	"==": "eq",
	">": "gt", 
	">=": "ge",
	"<": "lt", 
	"<=": "le",
	"!=": "ne"
};

var parseQuery = exports.parseQuery = function(/*String|Object*/query, parameters){
	var term = new Query();
	var topTerm = term;
	if(typeof query === "object"){
		if(query instanceof Array){
			return query;
		}
		for(var i in query){
			var term = new Query();
			topTerm.args.push(term);
			term.name = "eq";
			term.args = [i, query[i]];
		}
		return topTerm;
	}
	if(query.charAt(0) == "?"){
		throw new Error("Query must not start with ?");
	}
	if(exports.jsonQueryCompatible){
		query = query.replace(/%3C=/g,"=le=").replace(/%3E=/g,"=ge=").replace(/%3C/g,"=lt=").replace(/%3E/g,"=gt=");
	}
	// convert FIQL to normalized call syntax form 
	query = query.replace(/([\+\*\-:\w%\._]+)(>|<|[<>!]?=([\w]*=)?)([\+\*\$\-:\w%\._]+|\([\+\*\$\-:\w%\._,]+\))/g, function(t, property, operator, operatorSuffix, value){
		if(operator.length < 3){
			if(!operatorMap[operator]){ 
				throw new Error("Illegal operator " + operator);
			}
			operator = operatorMap[operator];
		}
		else{
			operator = operator.substring(1, operator.length - 1);
		}
		return operator + '(' + property + "," + value + ")";
	});
	if(query.charAt(0)=="?"){
		query = query.substring(1);
	}
	var leftoverCharacters = query.replace(/(\))|([&\|,])?([\+\*\$\-:\w%\._]*)(\(?)/g,
	                       //    <-closedParan->|<-delim-- propertyOrValue -----(> |
		function(t, closedParan, delim, propertyOrValue, openParan){
			if(delim){
				if(delim === "&"){
					forceOperator("and");
				}
				if(delim === "|"){
					forceOperator("or");
				}
			}
			if(openParan){
				var newTerm = new Query();
				newTerm.name = propertyOrValue,
				newTerm.parent = term;
				call(newTerm);
			}
			else if(closedParan){
				var isArray = !term.name;
				term = term.parent;
				if(!term){
					throw new URIError("Closing paranthesis without an opening paranthesis");
				}
				if(isArray){
					term.args.push(term.args.pop().args);
				}
			}
			else if(propertyOrValue){
				term.args.push(stringToValue(propertyOrValue, parameters));
			}
			return "";
		});
	if(term.parent){
		throw new URIError("Opening paranthesis without a closing paranthesis");
	}
	if(leftoverCharacters){
		// any extra characters left over from the replace indicates invalid syntax
		throw new URIError("Illegal character in query string encountered " + leftoverCharacters);
	}
	
	function call(newTerm){
		term.args.push(newTerm);
		term = newTerm;
	}
	function forceOperator(operator){
		if(!term.name){
			term.name = operator;
		}
		else if(term.name !== operator){
			var last = term.args.pop();
			var newSet = new Query(operator);
			newSet.parent = term.parent;
			call(newSet);
			term.args.push(last);
		}
	}
    function removeParentProperty(obj) {
    	if(obj && obj.args){
	    	delete obj.parent;
	    	obj.args.forEach(removeParentProperty);
    	}
        return obj;
    };
    removeParentProperty(topTerm);
    return topTerm;
};

function queryToString(part) {
    if (Array.isArray(part)) {
        return part.map(function(arg) {
            return queryToString(arg);
        }).join(",");
    }
    if (part && part.name && part.args) {
        return [
            part.name,
            "(",
            part.args.map(function(arg) {
                return queryToString(arg);
            }).join(","),
            ")"
        ].join("");
    }
    if (part !== exports.converters["default"]('' + (
        part.toISOString && part.toISOString() || part.toString()
    ))) {
        var type = typeof part;
        if(type === "object"){
            type = "epoch";
            part = part.getTime();
        }
        if(type === "string"){
        	part = encodeURIComponent(part);
        }
        part = [type, part].join(":");
    }
    return part;
};

exports.jsOperatorMap = {
	"eq" : "===",
	"ne" : "!==",
	"le" : "<=",
	"ge" : ">=",
	"lt" : "<",
	"gt" : ">"
}
exports.commonOperatorMap = {
	"and" : "&",
	"or" : "|",
	"eq" : "=",
	"ne" : "!=",
	"le" : "<=",
	"ge" : ">=",
	"lt" : "<",
	"gt" : ">"
}
exports.operators = {
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
	"in": filter(function(value, values){
		return values.indexOf(value) > -1;
	}),
	contains: filter(function(array, value){
		if(value instanceof Array){
			return value.some.call(arguments, function(value){
				return array.indexOf(value) > -1;
			});
		}
		else{
			return array.indexOf(value) > -1;
		}
	}),
	or: function(){
		var items = [];
		//TODO: remove duplicates and use condition property
		for(var i = 0; i < arguments.length; i++){
			items = items.concat(arguments[i].call(this));
		}
		return items;
	},
	and: function(){
		var items = this;
		// TODO: use condition property
		for(var i = 0; i < arguments.length; i++){
			items = arguments[i].call(items);
		}
		return items;
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
exports.filter = filter; 
function filter(condition){
	var filter = function(property){
		var args = arguments;
		var filtered = [];
		for(var i = 0, length = this.length; i < length; i++){
			var item = this[i];
			arguments[0] = evaluateProperty(item, property);
			if(condition.apply(this, arguments)){
				filtered.push(item);
			}
		}
		return filtered;
	};
	filter.condition = condition;
	return filter;
};
exports.evaluateProperty = evaluateProperty;
function evaluateProperty(object, property){
	if(property.indexOf(".") === -1){
		return object[decodeURIComponent(property)];
	}
	else{
		property.split(".").forEach(function(part){
			object = object[decodeURIComponent(part)];
		});
		return object;
	}
};
var conditionEvaluator = exports.conditionEvaluator = function(condition){
	var jsOperator = exports.jsOperatorMap[term.name];
	if(jsOperator){
		js += "(function(item){return item." + term[0] + jsOperator + "parameters[" + (index -1) + "][1];});";
	}
	else{
		js += "operators['" + term.name + "']";
	}
	return eval(js);
};
exports.executeQuery = function(query, options, target){
	return exports.query(query, options, target);
}
exports.query = function(query, options, target){
	query = parseQuery(query, options && options.parameters);
	function t(){}
	t.prototype = exports.operators;
	var operators = new t;
	// inherit from exports.operators
	for(var i in options.operators){
		operators[i] = options.operators[i];
	}
	var parameters = options.parameters || [];
	var js = "";
	function queryToJS(value){
		if(value && typeof value === "object" && !(value instanceof Array)){
			var jsOperator = exports.jsOperatorMap[value.name];
			if(jsOperator){
				return "(function(){var filtered = []; for(var i = 0, length = this.length; i < length; i++){var item = this[i];if(item." + value.args[0] + jsOperator + queryToJS(value.args[1]) + "){filtered.push(item);}} return filtered;})";
			}else{
				return "(function(){return operators['" + value.name + "'].call(this" +
					(value && value.args && value.args.length > 0 ? (", " + value.args.map(queryToJS).join(",")) : "") +
					")})";
			}
		}else{
			return JSON.stringify(value);
		}
	}
	var evaluator = eval("(function(target){return " + queryToJS(query) + ".call(target);})");
	if(options.start || options.end){
		var totalCount = results.length;
		results = results.slice(options.start || 0, (options.end || Infinity) + 1);
		results.totalCount = totalCount;
	}
	return target ? evaluator(target) : evaluator;
}
function throwMaxIterations(){
	throw new Error("Query has taken too much computation, and the user is not allowed to execute resource-intense queries. Increase maxIterations in your config file to allow longer running non-indexed queries to be processed.");
}
exports.maxIterations = 10000;
function stringToValue(string, parameters){
	var converter = exports.converters['default'];
	if(string.charAt(0) === "$"){
		var param_index = parseInt(string.substring(1)) - 1;
		return param_index >= 0 && parameters ? parameters[param_index] : undefined;
	}
	if(string.indexOf(":") > -1){
		var parts = string.split(":",2);
		converter = exports.converters[parts[0]];
		if(!converter){
			throw new URIError("Unknown converter " + parts[0]);
		}
		string = parts[1];
	}
	return converter(string);
};
var autoConverted = exports.autoConverted = {
	"true": true,
	"false": false,
	"null": null,
	"undefined": undefined,
	"Infinity": Infinity,
	"-Infinity": -Infinity
};

exports.converters = {
	auto: function(string){
		if(autoConverted.hasOwnProperty(string)){
			return autoConverted[string];
		}
		var number = +string;
		if(isNaN(number) || number.toString() !== string){
/*			var isoDate = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d*)?)Z$/.exec(date);
			if (isoDate) {
				return new Date(Date.UTC(+isoDate[1], +isoDate[2] - 1, +isoDate[3], +isoDate[4], +isoDate[5], +isoDate[6]));
			}*/
			string = decodeURIComponent(string);
			if(exports.jsonQueryCompatible){
				if(string.charAt(0) == "'" && string.charAt(string.length-1) == "'"){
					return JSON.parse('"' + string.substring(1,string.length-1) + '"');
				}
			}
			return string;
		}
		return number;
	},
	number: function(x){
		var number = +x;
		if(isNaN(number)){
			throw new URIError("Invalid number " + number);
		}
		return number;
	},
	epoch: function(x){
		var date = new Date(+x);
		if (isNaN(date.getTime())) {
			throw new URIError("Invalid date " + x);
		}
		return date;		
	},
	date: function(x){
		var isoDate = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d*)?)Z$/.exec(date);
		if (isoDate) {
			date = new Date(Date.UTC(+isoDate[1], +isoDate[2] - 1, +isoDate[3], +isoDate[4], +isoDate[5], +isoDate[6]));
		}else{
			date = new Date(date);
		}
		if (isNaN(date.getTime())){
			throw new URIError("Invalid date " + x);
		}
		return date;
		
	},
	"boolean": function(x){
		return x === "true";
	},
	string: function(string){
		return decodeURIComponent(string);
	}
};

// exports.converters["default"] can be changed to a different converter if you want
// a different default converter, for example:
// RQ = require("resource-query");
// RQ.converters["default"] = RQ.converter.string;
exports.converters["default"] = exports.converters.auto;

try{
	var when = require("promise").when;
}catch(e){
	when = function(value, callback){callback(value)};
}

var knownOperators = ["and", "or", "eq", "ne", "le", "lt", "gt", "ge", "sort", "in", "select", "contains"];
var arrayMethods = ["forEach", "reduce", "map", "filter", "indexOf", "some", "every"]; 
exports.Query = function(seed, params){
	if (seed) return exports.parseQuery(seed, params);
	return new Query();
};
function Query(name){
	this.name = name || "and";
	this.args = [];
}
exports.Query.prototype = Query.prototype;
Object.defineProperty(Query.prototype, "toString", {
	value: function(){
		return this.name === "and" ? 
			this.args.map(queryToString).join("&") :
			queryToString(this);
	},
	enumerable: false
});
exports.updateQueryMethods = function(){
	knownOperators.forEach(function(name){
		Object.defineProperty(Query.prototype, name, {
				value: function(){
					var newQuery = new Query();
					newQuery.executor = this.executor;
					var newTerm = new Query(name);
					newTerm.args = Array.prototype.slice.call(arguments);
					newQuery.args = this.args.concat([newTerm]);
					return newQuery;
				},
				enumerable: false
		});
	});
	arrayMethods.forEach(function(name){
		Object.defineProperty(Query.prototype, name, {
			value: function(){
				var args = arguments;
				return when(this.executor(this), function(results){
					return results[name].apply(results, args);
				});
			},
			enumerable: false
		});
	});

};
exports.updateQueryMethods();

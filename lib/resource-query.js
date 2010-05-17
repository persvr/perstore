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
	var topTerms = [];
	var term = {name:"and", args: topTerms};
	if(typeof query === "object"){
		if(query instanceof Array){
			return query;
		}
		for(var i in query){
			topTerms.push({
				property: i,
				name: "eq",
				args:[property[i]]
			});
		}
		return topTerms;
	}
	if(query.charAt(0) == "?"){
		throw new Error("Query must not start with ?");
	}
	if(exports.jsonQueryCompatible){
		query = query.replace(/%3C=/g,"=le=").replace(/%3E=/g,"=ge=").replace(/%3C/g,"=lt=").replace(/%3E/g,"=gt=");
	}
	// convert FIQL to normalized call syntax form 
	query = query.replace(/([\+\*\-:\w%\._]+)(>|<|[<>!]?=([\w]*=)?)([\+\*\-:\w%\._]+|\([\+\*\-:\w%\._,]+\))/g, function(t, property, operator, operatorSuffix, value){
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
				var paths = propertyOrValue.split(".");
				var newTerm = {
					name: paths[paths.length - 1],
					parent: term
				};
				if(paths.length > 2){
					newTerm.property = paths.slice(0, -1);
				}
				else if(paths.length === 2){
					newTerm.property = paths[0];
				}
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
	
	function call(newTerm, parent){
		newTerm.args = [];
		term.args.push(newTerm);
		term = newTerm;
	}
	function forceOperator(operator){
		if(!term.name){
			term.name = operator;
		}
		else if(term.name !== operator){
			var last = term.args.pop();
			call({
				name:operator,
				parent: term.parent
			});
			term.args.push(last);
		}
	}
	Object.defineProperty(topTerms, "toString", {
		enumerable: false,
		value: queryToString
	});
    function removeParentProperty(obj) {
    	if(obj && obj.args){
	    	delete obj.parent;
	    	obj.args.forEach(removeParentProperty);
    	}
        return obj;
    };
    removeParentProperty({args:topTerms});
    return topTerms;
};

function queryToString(){
	var qs = "";
	for (var i = 0; i < this.length; i++) {
		var term = this[i];
		qs += term.conjunction || "";
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
	return qs;
}
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
					(value ? (", " + value.args.map(queryToJS).join(",")) : "") + 
					")})";
			}
		}else{
			return JSON.stringify(value);
		}
	}
	var evaluator = eval("(function(target){return " + queryToJS({name:"and", args: query}) + ".call(target);})"); 
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
	var converterName = "default";
	if(string.charAt(0) === "$"){
		return parameters[parseInt(string.substring(1)) - 1];
	}
	if(string.indexOf(":") > -1){
		var date = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d*)?)Z$/.exec(string);
        if (date) {
            return new Date(Date.UTC(+date[1], +date[2] - 1, +date[3], +date[4],
                +date[5], +date[6]));
        }
		var parts = string.split(":",2);
		converterName = parts[0];
		string = parts[1];
	}
	var converter = exports.convertors[converterName];
	if(!converter){
		throw new URIError("Unknown type " + parts[0]);
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

exports.convertors = {
	auto: function(string){
		if(autoConverted.hasOwnProperty(string)){
			return autoConverted[string];
		}
		var number = Number(string);
		if(isNaN(number) || number.toString() !== string){
			if(string.match(/\d{1-4}\/\d{1-2}\/\d{1-4}/)){
				return new Date(string);
			}
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
		var number = Number(x);
		if(isNaN(number)){
			throw new URIError("Invalid number " + number);
		}
		return number;
	},
	year: function(x){
		var date = new Date(stringToValue(x), 0);
		if(isNaN(date.getTime())){
			throw new URIError("Invalid date " + x);
		}
		return date;		
	},
	date: function(x){
		var date = new Date(stringToValue(x));
		if(isNaN(date.getTime())){
			throw new URIError("Invalid date " + x);
		}
		return date;
	},
	re: function(x){
		// poorman regexp? *foo, bar*
		/***v = (v.charAt(0) != '*') ? '^' + v : v.substring(1);
		v = (v.slice(-1) != '*') ? v + '$' : v.substring(0, v.length-1);***/
		return new RegExp(x, 'i');
	},
	RE: function(x){
		return new RegExp(x)
	},
	"boolean": function(x){
		return x === "true";
	},
	string: function(string){
		return decodeURIComponent(string);
	}
};

// exports.convertors["default"] can be changed to a different converter if you want
// a different default converter, for example:
// RQ = require("resource-query");
// RQ.convertors["default"] = RQ.converter.string;
exports.convertors["default"] = exports.convertors.auto;

try{
	var when = require("promise").when;
}catch(e){
	when = function(value, callback){callback(value)};
}

var knownOperators = ["and", "or", "eq", "ne", "le", "lt", "gt", "ge", "sort", "in", "select", "contains"];
var arrayMethods = ["forEach", "reduce", "map", "filter", "indexOf", "some", "every"]; 
exports.Query = function(executer){
	function Query(terms){
		this.terms = terms;
	}
	knownOperators.forEach(function(name){
		Query.prototype[name] = function(){
			for(var i = 0; i < arguments.length; i++){
				if(arguments[i] instanceof Query){
					arguments[i] = arguments[i].terms;
				}
			}
			return new Query(this.terms.concat([{
				name: name,
				args: arguments
			}]));
		}
	});
	arrayMethods.forEach(function(name){
		Query.prototype[name] = function(){
			var args = arguments;
			this.terms.toString = queryToString;
			return when(executer(this.terms), function(results){
				return results[name].apply(results, args);
			});
		};
	});
	return new Query([]);
}
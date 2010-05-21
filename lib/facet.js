/**
 * This provides the facet-based programming model for pintura, allowing for different
 * views or forms of accessing the underlying data stores. Different facets can be used
 * for different application access points, different security levels, and different locales. 
 */

var NotFoundError = require("./errors").NotFoundError,
	AccessError = require("./errors").AccessError,
	MethodNotAllowedError = require("./errors").MethodNotAllowedError,
	defineProperties = require("commonjs-utils/es5-helper").defineProperties,
	LazyArray = require("commonjs-utils/lazy-array").LazyArray,
	when = require("promise").when,
	Query = require("./resource-query").Query,
	rpcInvoke = require("./json-rpc").invoke;

exports.Facet = Facet;
Facet.facetFor = function(store, resolver, mediaType){
	var schema = mediaType.match(/schema=(.*)/)[1];
	if(schema){
		return Facet.instances.filter(function(facet){
			return facet.id == schema;
		})[0];
	}
};
try{
	var readonlyEnforced = Object.create(Object.prototype);
	defineProperties(readonlyEnforced,{test:{writable:false, value: false}});
	readonlyEnforced.test = true;
	readonlyEnforced = false;
}
catch(e){
	readonlyEnforced = true;
}
var httpHandlerPrototype = {
	options: function(id){
		return Object.keys(this);
	},
	trace: function(obj){
		return obj;
	},
	wrap: function(instance){
		throw new Error("wrap must be implemented in FacetedStore implementations");
	},
	patch: function(props, id){
		return this.copyProperties(props,{id:id});
	},
	copyProperties: function(props, directives){
		var target = this.get(directives.id);
		for(var i in props){
			if(props.hasOwnProperty(i) && (target[i] !== props[i])){
				target[i] = props[i];	
			}
			
		}
		target.save(directives);
		return target;
	}
	
};
var NEW = {};
function FacetedStore(store, facetClass){
	function constructor(){
		return constructor.construct.apply(constructor, arguments);
	}
	facetClass.prototype = facetClass.prototype || {}; 
	for(var i in facetClass){
		constructor[i] = facetClass[i];
	}
	var constructOnNewPut = !facetClass.noConstructPut;
	var needsOldVersion = constructOnNewPut;
	var properties = constructor.properties;
	for(var i in properties){
		var propDef = properties[i];
		if(propDef.readonly || propDef.blocked){
			needsOldVersion = true;
			break;
		}
	}
	constructor.id = store.id;
	constructor.query= function(query, directives){
		if(arguments.length === 0){
			var query = Query();
			query.executor = function(query){
				return constructor.query(query.toString());
			}
			return query;
		}
		if(typeof facetClass.query !== "function"){
			if(facetClass.__noSuchMethod__){
				return this.wrap(facetClass.__noSuchMethod__("query", [query, directives]), this.transaction);
			}
			throw new MethodNotAllowedError("No query capability provided");
		}
		return this.wrap(facetClass.query(query, directives), this.transaction);
	};
	constructor.get= function(id){
		id = '' + id;
		if(id.charAt(0) == '/'){
			return getFromTransaction(id, this.transaction);
		}
		if(id[0] == '.' && id[1] == '.'){
			return getFromTransaction(id.substring(2), this.transaction);
		}
		function getFromTransaction(id, transaction){
			var parts = id.split("/");
			var store = transaction;
			for(var i = 1; i < parts.length - 1; i++){
				store = store.openObjectStore(parts[i]);
			}
			return store.get(parts[i]);
		}
		if(id.indexOf('.') > -1 && (id.indexOf('?') == -1 || id.indexOf('.') < id.indexOf('?'))){
			var parts = id.split('.');
			var value = this.get(parts[0]);
			for(var i = 1; i < parts.length; i++){
				value = value && (value.get ? value.get(parts[i]) : value[parts[i]]);
				if(value && value.$ref){
					value = facetClass.get(value.$ref);
				}
			}
			return value;
		}
		if(id === '' || id.match(/\?|\[/)){
			return this.query(id,{});
		}
		var parts = id.match(/[\.#][^\.#]+/g);
		if(parts){
			var value = this.get(id.match(/^([^\.#]*)[\.#]/)[0]);
			for(var i = 0; i < parts.length; i++){
				var part = parts[i];
				value = part[0] === '.' ? value.get(part.substring(1)) : value[part.substring(1)];
			}
			return value;
		}
		if(id.match(/^\(.*\)$/)){
			// handle paranthesis embedded, comma separated ids
			if(id.length == 2){ // empty array
				return [];
			}
			var parts = id.substring(1, id.length -1).split(',');
			var self = constructor;
			return parts.map(function(part){
				return self.get(part);
			});
		}
		if(typeof facetClass.get !== "function"){
			if(facetClass.__noSuchMethod__){
				return this.wrap(facetClass.__noSuchMethod__("get", [id]), this.transaction);
			}
			throw new MethodNotAllowedError("No get capability provided");
		}
		return this.wrap(facetClass.get(id), this.transaction);
	};
	constructor.construct = function(instance, directives){
		instance = this.wrap({}, this.transaction, instance, NEW);
		for(var i in properties){
			var propDef = properties[i];
			if("default" in propDef && !(i in instance)){
				var def = propDef["default"];
				instance[i] = typeof def === "function" ? def() : def;
			}
		}
		directives = directives || {};
		directives.overwrite = false;
		if(typeof facetClass.construct === "function"){
			var result = facetClass.construct(instance, directives);
			if(result === undefined){
				result = instance;
			}
			return result;
		}
		if(typeof facetClass.__noSuchMethod__ === "function"){
			var result = facetClass.__noSuchMethod__("construct", [instance, directives], true);
			if(result === undefined){
				result = instance;
			}
			if(result !== null){
				return result;
			}
		}
		// for back-compat:
		if(typeof instance.initialize === "function"){
			instance.initialize.apply(instance, arguments);
		}
		return when(instance.save(directives), function(){
			return instance;
		});
	};
	constructor.put = function(props, directives){
		if(props instanceof Array){
			// bulk operation
			var results = [];
			for(var i = 0, l = props.length; i < l; i++){
				var oneProps = props[i];
				directives.id = oneProps.getId ? oneProps.getId() : oneProps.id || oneProps._id;
				results.push(constructor.put(oneProps, directives));
			}
			return results;
		}
		directives = directives || {};
		if(typeof props.save !== "function"){
			try{
				if(needsOldVersion){
					var instance = this.get(directives.id);
				}
			}
			catch(e){
			}
			var self = this;
			return when(instance, function(instance){
				if(!instance){
					if(constructOnNewPut){
						// we are doing a PUT for a new object
						return self.construct(props, directives);
					}
					// doesn't exist or exists but not loaded, we create a new instance
					var instance = self.wrap({}, self.transaction, instance, NEW);
					return when(instance.save(directives), function(newInstance){
						if(directives.id && ((newInstance.getId ? newInstance.getId() : newInstance.id || newInstance._id) != directives.id)){ 
							throw new Error("Object's id does not match the target URI");
						}
						return newInstance;
					});
				}
				if(props.getMetadata && instance.getMetadata){
					// do conflict detection with the metadata
					var incoming = props.getMetadata();
					var current = instance.getMetadata();
					var ifUnmodifiedSince = Date.parse(incoming["if-unmodified-since"]);
					var lastModified = Date.parse(current["last-modified"]);
					if(ifModifiedSince && lastModified){
						if(lastModified > ifUnmodifiedSince){
							throw new Database(4, "Object has been modified since " + ifUnmodifiedSince);
						}
					}
					var etag = current.etag;
					var ifMatch = incoming["if-match"];
					if(etag && ifMatch){
						if(etag != ifMatch){
							throw new Database(4, "Object does match " + ifMatch);
						} 
					}
					
				}
				return when(instance.save.call(props, directives), function(){
					instance.load();
					return instance;
				});
			});
		}
		else{
			return when(props.save(directives), function(){ 
				props.load();
				return props;
			});
		}
		
	};
	constructor.post = function(props, directives){
		if(props instanceof Array){
			// bulk operation
			var results = [];
			for(var i = 0, l = props.length; i < l; i++){
				results.push(constructor.post(props[i], directives));
			}
			return results;
		}
		if(!directives.id){
			// create a new object
			return this.construct(props);
		}
		else{
			// check to see if it is an RPC object
			// TODO: Do this: if(props instanceof RPC){ // where the media handler creates RPC objects
			if("method" in props && "id" in props && "params" in props){
				// looks like JSON-RPC
				return rpcInvoke(this.get(directives.id), props);
			}
			// doing an incremental update
			return this.copyProperties(props, directives);
		}
	};
	
	constructor.__proto__ = httpHandlerPrototype;
	
	// TODO: handle immutable proto
	return constructor;
}
var checkPropertyChange = require("commonjs-utils/json-schema").checkPropertyChange;
var mustBeValid = require("commonjs-utils/json-schema").mustBeValid;
var validate = require("commonjs-utils/json-schema").validate;
var writableProto = !!({}.__proto__); 
var SchemaControlled = function(facetSchema, sourceClass){
	var properties = facetSchema.properties;
	var idProperty = "id";
	var links = {};
	var schemaLinks = facetSchema.links || sourceClass.links; 
	if(schemaLinks && schemaLinks instanceof Array){
		schemaLinks.forEach(function(link){
/*			// TODO: allow for multiple same-name relations
			if(links[link.rel]){
				if(!(links[link.rel] instanceof Array)){
					links[link.rel] = [links[link.rel]];
				}
			}*/
			links[link.rel] = link.href; 
		});
	}
	var facetPrototype = facetSchema.prototype;
	var needSourceParameter = {};
	for(var i in facetPrototype){
		var value = facetPrototype[i]; 
		if(typeof value == "function"){
			var paramsBeforeSource = value.toString().match(/function \(([\w0-9_$, ]*)source[\),]/);
			if(paramsBeforeSource){
				needSourceParameter[i] = paramsBeforeSource[1].split(",").length - 1;
			}
		}
	}
	var splice = Array.prototype.splice;
	return function createWrap(facetClass){
		return function wrap(source, transaction, wrapped, partial){
			return when(source, function(source){
				if(!source){
					return source;
				}
				if(source instanceof Array){
					// this handles query results, but probably should create a branch for real arrays 
					var results = LazyArray({
						some: function(callback){
							source.some(function(item){
								callback((item && typeof item == "object" && wrap(item, transaction, item, true)) || item);
							});
						},
						length: source.length
					});
					results.totalCount = source.totalCount;
					return results;
				}		
				var instancePrototype = Object.create(facetPrototype);
				defineProperties(instancePrototype, {
					load: {
						value: function(){
							if(facetSchema.allowed && !facetSchema.allowed(transaction.request, source)){
								throw new AccessError("Access denied to " + source);
							}
							if(source.load && this != source){
								var loadingSource = source.load();
							}
							else{
								var loadingSource = sourceClass.get(source.getId ? source.getId() : source.id || source._id);
							}
							return when(loadingSource, function(loadingSource){
								source = loadingSource;
								copyFromSource();
								loaded();
								return wrapped;
							});
						},
						enumerable: false,
						writable: true
					}
				});
				if(partial !== true){
					loaded();
				}
				function loaded(){
					defineProperties(instancePrototype,{
						get: {
							value: function(name){
								if(links[name]){
									var self = this;
									return wrap(facetClass.get(links[name].replace(/\{([^\}]*)\}/g, function(t, property){
											var value = self[decodeURIComponent(property)];
											if(value instanceof Array){
												// the value is an array, it should produce a URI like /Table/(4,5,8) and store.get() should handle that as an array of values
												return '(' + value.join(',') + ')';
											}
											return value;
										})), transaction);
								}
								if(facetPrototype.get){
									if(facetPrototype.get === DELEGATE){
										return sourceClass.prototype.get.call(source, name);
									}
									return facetPrototype.get.call(this, name)
								}
								
								var value = this[name];
								if(value && value.$ref){
									return wrap(facetClass.get(value.$ref), transaction);
								}
								return value;
							},
							enumerable: false
						},
				
						set: {
							value: function(name, value){
								var propDef = properties && properties[name];
								if(propDef){
									mustBeValid(checkPropertyChange(value, propDef, name));
									if(propDef.set){
										value = propDef.set.call(this, name, value);
									}
								}
								sourceClass.get(source.getId ? source.getId() : source.id || source._id).set(name, value);
								this[name] = value;
							},
							enumerable: false
						},
						save: {
							value: function(directives){
								directives = directives || {};
								if(facetPrototype.save){
									facetPrototype.save.call(this, source);
								}
								var validation = validate(this, facetSchema);
								var instance = this;
								for(var i in this){
									if(this.hasOwnProperty(i)){
										transfer(this[i]);
									}
								}
								for (var i in source){
									if(source.hasOwnProperty(i) && !this.hasOwnProperty(i)){
										transfer(undefined);
									}
								}
								mustBeValid(validation);
								try{
									if(typeof facetSchema.put === "function"){
										var id = facetSchema.put(source, directives);
									}
									else{
										if(facetSchema.__noSuchMethod__){
											var id = facetSchema.__noSuchMethod__("put", [source, directives]);
										}
										else{
											throw new MethodNotAllowedError("put is not allowed");
										}
									}
									var self = this;
									/*if(typeof id == "string" || typeof id == "number"){
										source.id = id;
									}*/
									return when(id, function(){
										copyFromSource();
										return self;
									});
								}
								finally{
									if((typeof id == "string" || typeof id == "number") && transaction){
										transaction.generatedId = id;
									}
								}
								function transfer(value){
									var propDef = properties && properties[i];
									propDef = propDef || facetSchema.additionalProperties; 
									var cancelled;
									if(propDef){
										if(propDef.blocked){
											addError("can't save a blocked property");
										}
										if(propDef["transient"]){
											cancelled = true;
										}
										if(source[i] !== value){
											if(propDef.set){
												try{
													var newValue = propDef.set.call(instance, value, source, source[i]);
													if(newValue !== undefined){
														value = newValue;
													}
												}catch(e){
													addError(e.message);
												}
											}
											else if(propDef.get){
												cancelled = true;
											}
											else if(propDef.readonly && source.hasOwnProperty(i)){
												addError("property is read only");
											}
											
										}
									}
									if(!cancelled){
										if(value === undefined){
											delete source[i];
										}
										else{
											source[i] = value;
										}
									}
									function addError(message){
										validation.valid = false;
										validation.errors.push({property: i, message: message});
										cancelled = true;
									}
								}
							},
							enumerable: false
						},
						load: {
							value: function(){
								if(typeof source.load === "function"){
									source.load();
								}
								copyFromSource();
								return wrapped;
							},
							enumerable: false
						}
						
					});
				}
				function copyFromSource(){
					for(var i in source){
						if(source.hasOwnProperty(i)){
							var propDef = properties && properties[i];
							if(!(propDef && propDef.blocked)){
								wrapped[i] = source[i];
							}
						}
					}
					for(var i in properties){
						var propDef = properties[i];
						if(propDef.get){
							wrapped[i] = propDef.get.call(source, i);
						}
					}
				}
				for(var i in needSourceParameter){
					// splice in the source argument for each method that needs it
					(function(param, protoFunc, i){
						instancePrototype[i] = function(){
							splice.call(arguments, param, 0, source);
							return protoFunc.apply(this, arguments);
						};
					})(needSourceParameter[i], facetPrototype[i], i);
				}
				if(writableProto && partial === true){
					source.__proto__ = instancePrototype;
					wrapped = source;
				}
				else{
					if(wrapped){
						wrapped.__proto__ = instancePrototype;
					}
					else{
						wrapped = Object.create(instancePrototype);
					}
					if(partial !== NEW){
						copyFromSource();
					}
				}
				if(facetSchema.onWrap){
					wrapped = facetSchema.onWrap(wrapped) || wrapped;
				}
				return wrapped;	
			});
		};
	};
}
function canFacetBeAppliedTo(appliesTo, store){
	store = store._baseFacetedStore || store;
	if(appliesTo && appliesTo != Object){
		while(store != appliesTo){
			store = store["extends"];
			if(!store){
				return false;		
			}
		}
	}
	return true;	
};

/**
 * Finds the best facet for the given store from the list of provided facets
 */
exports.findBestFacet = function(store, facets){
	var allInstances = Facet.instances;
	// TODO: we may need to index of id for base stores since there can be multiple
	// instances generated from a database
	store = store._baseFacetedStore || store;
	var bestFacet, facet, index, allIndex = -1;
	while(true){
		while((allIndex = appliesTos.indexOf(store, allIndex + 1)) > -1){
			if((index = facets.indexOf(allInstances[allIndex])) > -1){
				var facet = facets[index];
				if(!bestFacet || (facet.quality > (bestFacet.quality || 0.001))){
					bestFacet = facet;
				}
			}
		}
		if(store == Object){
			break;
		}
		store = store["extends"] || Object;
	}
	return bestFacet;
};


function Facet(appliesTo, schema){
	var baseFacetedStore = FacetedStore(appliesTo, schema);
	var createWrap = SchemaControlled(schema, appliesTo);
	baseFacetedStore.wrap = createWrap(baseFacetedStore);
	function FacetForStore(sourceStore, transaction){
		if(!canFacetBeAppliedTo(appliesTo, sourceStore)){
			throw new TypeError("facet can not be applied to " + sourceStore.name);
		}
		if(appliesTo == sourceStore){
			facetedStore = function(){
				return facetedStore.construct.apply(facetedStore, arguments);
			}
			facetedStore.__proto__ = baseFacetedStore;
			facetedStore.wrap = createWrap(facetedStore);
		}
		else{
			facetedStore = FacetedStore(sourceStore, schema);
			facetedStore.wrap = SchemaControlled(schema, sourceStore)(facetedStore);
		}
		facetedStore.transaction = transaction;
		return facetedStore;
	}
	baseFacetedStore.forStore = FacetForStore;
	baseFacetedStore._baseFacetedStore = baseFacetedStore;
	Facet.instances.push(baseFacetedStore);
	appliesTos.push(appliesTo || Object);
	return baseFacetedStore;
};
var appliesTos = [];
Facet.instances = [];

exports.Restrictive = function(appliesTo, schema){
	schema = schema || {quality:0.2};
	schema.__noSuchMethod__ || (schema.__noSuchMethod__ = function(name, args, onlyIfAvailable){
		if(name.substring(0,3) === "get" || name === "query"){
			if(appliesTo[name]){
				return appliesTo[name].apply(appliesTo, args);	
			}
			if(appliesTo.__noSuchMethod__){
				return appliesTo.__noSuchMethod__(name, args);
			}
		}
		if(!onlyIfAvailable){
			throw new MethodNotAllowedError(name + " is not allowed");
		}
		return null;
	});
	var appliesToPrototype = appliesTo.prototype;
	if(appliesToPrototype){
		var schemaPrototype = schema.prototype = schema.prototype || {};
		schemaPrototype.__noSuchMethod__ = function(name, source, args, onlyIfAvailable){
			if(name.substring(0,3) === "get"){
				if(appliesToPrototype[name]){
					return appliesToPrototype[name].apply(source, args);	
				}
				if(appliesToPrototype.__noSuchMethod__){
					return appliesToPrototype.__noSuchMethod__(name, args, onlyIfAvailable);
				}
			}
			if(!onlyIfAvailable){
				throw new MethodNotAllowedError(name + " is not allowed");
			}
			return null;
		}
		if(appliesToPrototype.get){
			schemaPrototype.get = DELEGATE;
		}
	}
	return Facet(appliesTo, schema);
}
var DELEGATE = function(){};
exports.Permissive = function(appliesTo, schema){
	schema = schema || {quality:0.5};
	schema.__noSuchMethod__ || (schema.__noSuchMethod__ = function(name, args, onlyIfAvailable){
		if(appliesTo[name]){
			return appliesTo[name].apply(appliesTo, args);	
		}
		if(appliesTo.__noSuchMethod__){
			return appliesTo.__noSuchMethod__(name, args);
		}
		if(!onlyIfAvailable){
			throw new MethodNotAllowedError(name + " is not allowed");
		}
		return null;
	});
	var appliesToPrototype = appliesTo.prototype;
	if(appliesToPrototype){
		var schemaPrototype = schema.prototype = schema.prototype || {};
		schemaPrototype.__noSuchMethod__ = function(name, source, args, onlyIfAvailable){
			if(appliesToPrototype[name]){
				return appliesToPrototype[name].apply(source, args);	
			}
			if(appliesToPrototype.__noSuchMethod__){
				return appliesToPrototype.__noSuchMethod__(name, args, onlyIfAvailable);
			}
			if(!onlyIfAvailable){
				throw new MethodNotAllowedError(name + " is not allowed");
			}
			return null;
		}
		if(appliesToPrototype.get){
			schemaPrototype.get = DELEGATE;
		}
	}
	return Facet(appliesTo, schema);
};

//TODO: should branch to using Object.keys if a native version is available. The 
// native version is slightly faster than doing a for-in loop (but a simulated version
// wouldn't be). We could also have a branch for java-based copier that would 
// certainly be much faster 
function copy(source, target){
	for(var i in source){
		if(source.hasOwnProperty(i)){
			target[i] = source[i];
		}
	}
	return target;
}

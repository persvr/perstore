/**
 * This provides the facet-based programming model for pintura, allowing for different
 * views or forms of accessing the underlying data stores. Different facets can be used
 * for different application access points, different security levels, and different locales.
 */

var DatabaseError = require("./errors").DatabaseError,
	AccessError = require("./errors").AccessError,
	MethodNotAllowedError = require("./errors").MethodNotAllowedError,
	defineProperties = require("./util/es5-helper").defineProperties,
	LazyArray = require("promised-io/lazy-array").LazyArray,
	promiseModule = require("promised-io/promise"),
	when = promiseModule.when,
	copy = require("./util/copy").copy,
	Query = require("rql/query").Query,
	substitute = require("json-schema/lib/validate").substitute,
	rpcInvoke = require("./json-rpc").invoke;
require("./coerce");// patches json-schema

exports.Facet = Facet;
Facet.facetFor = function(store, resolver, mediaType){
	var schema = mediaType.match(/schema=(.*)/)[1];
	if(schema){
		return Facet.instances.filter(function(facet){
			return facet.id == schema;
		})[0];
	}
};
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
		return when(target, function(target){
			for(var i in props){
				if(props.hasOwnProperty(i) && (target[i] !== props[i])){
					target[i] = props[i];
				}

			}
			target.save(directives);
			return target;
		});
	}

};
var NEW = {};
function FacetedStore(store, facetSchema){
	function constructor(){
		return constructor.construct.apply(constructor, arguments);
	}

	var i;

	facetSchema.prototype = facetSchema.prototype || {};
	for(i in facetSchema){
		constructor[i] = facetSchema[i];
	}
	constructor.instanceSchema = facetSchema;
	var constructOnNewPut = !facetSchema.noConstructPut;
	var needsOldVersion = constructOnNewPut;
	var properties = constructor.properties;
	var indexedProperties = {id: true};
	for(i in properties){
		var propDef = properties[i];
		if(propDef.readonly || propDef.blocked){
			needsOldVersion = true;
		}
		if(propDef.indexed){
			indexedProperties[i] = true;
		}
	}
	constructor.id = store.id;
	constructor.query= function(query, directives){
		if(arguments.length === 0){
			query = Query();
			query.executor = function(query){
				return constructor.query(query.toString());
			};
			return query;
		}
		if(typeof facetSchema.query !== "function"){
			if(typeof store.query !== "function"){
				throw new MethodNotAllowedError("No query capability provided");
			}
			return this.wrap(store.query(query, directives), this.transaction);
		}
		return this.wrap(facetSchema.query(query, directives), this.transaction);
	};

	var allowedOperators = constructor.allowedOperators || store.allowedOperators
		|| {
			select: true,
			limit: true, // required
			ne: true,
			and: true,
			eq: "indexed",
			le: "indexed",
			lt: "indexed",
			ge: "indexed",
			gt: "indexed",
			sort: "indexed"
		};
	var maxLimit = constructor.maxLimit || store.maxLimit || 50;

	constructor.checkQuery = function(query){
		var lastLimit;
		var checkOperator = function(operator, checkLimit){
			var name = operator.name;
			if(!allowedOperators[name]){
				throw new AccessError("Query operator " + name + " not allowed for this user. You can assign allowed operators in the allowedOperators property of the facet or model.");
			}
			if(allowedOperators[name] === "indexed" &&
					!indexedProperties[name === "sort" ? operator.args[0].replace(/^[-\+]/,'') : operator.args[0]]){
				throw new AccessError("Query operator " + name + " not allowed for unindexed property " + operator.args[0] + " for this user. You can assign indexed operators in the indexedProperties property of the facet or model");
			}
			operator.args.forEach(function(value){
				if(value && value.name && value.args){
					if(checkLimit && value.name === "limit"){
						lastLimit = value.args[0];
					}
					checkOperator(value);
				}
			});
		};
		checkOperator(Query(query), true);
		if(!lastLimit && maxLimit != Infinity){
			throw new RangeError("This user is not allowed to execute a query without a range specified through a Range header or a limit operator in the query like ?limit(10)");
		}
		if(lastLimit > maxLimit){
			throw new RangeError("This user is not allowed to execute a query with a limit of " + lastLimit + " the user has maximum range of " + maxLimit);
		}
		// TODO: should we args[0] = parsedQuery to pass on a the parsed query so it doesn't need to be reparsed?
	};

	constructor.construct = function(instance, directives){
		var result;

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
		if(typeof facetSchema.construct === "function"){
			result = facetSchema.construct(instance, directives);
			if(result === undefined){
				result = instance;
			}
			return result;
		}
		if(typeof facetSchema.__noSuchMethod__ === "function"){
			result = facetSchema.__noSuchMethod__("construct", [instance, directives], true);
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
		return instance;
	};
	constructor.get = function(id, directives){
		if(typeof facetSchema.get === "function"){
			return this.wrap(facetSchema.get(id, directives));
		}
		return this.wrap(store.get(id, directives));
	};
	constructor["delete"] = function(id, directives){
		try{
			Object.defineProperty(directives, "previous", {
				get: function(){
					return constructor.get(id);
				}
			});
		}catch(e){
			// silence errors about frozen objects
		}
		if(typeof facetSchema["delete"] === "function"){
			return this.wrap(facetSchema["delete"](id, directives));
		}
		return this.wrap(store["delete"](id, directives));
	};
	constructor.add = function(props, directives){
		return constructor.construct(props).save(directives);
	};
	constructor.put = function(props, directives){
		var instance;

		directives = directives || {};
		if (!directives.id) {
			directives.id = facetSchema.getId(props);
		}
		if(typeof props.save !== "function"){
			try{
				if(needsOldVersion){
					instance = this.get(directives.id);
				}
			}
			catch(e){
			}
			var self = this;
			return when(instance, function(instance){
				if(!instance){
					if(constructOnNewPut){
						// we are doing a PUT for a new object
						return self.add(props, directives);
					}
					// doesn't exist or exists but not loaded, we create a new instance
					instance = self.wrap({}, self.transaction, instance, NEW);
					return when(instance.save(directives), function(newInstance){
						if(directives.id && (facetSchema.getId(newInstance) != directives.id)){
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
					if(ifUnmodifiedSince && lastModified){
						if(lastModified > ifUnmodifiedSince){
							throw new DatabaseError(4, "Object has been modified since " + ifUnmodifiedSince);
						}
					}
					var etag = current.etag;
					var ifMatch = incoming["if-match"];
					if(etag && ifMatch){
						if(etag != ifMatch){
							throw new DatabaseError(4, "Object does match " + ifMatch);
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
		if(typeof facetSchema.post === "function"){
			return this.wrap(facetSchema.post(props, directives));
		}
		if(!directives.id){
			// create a new object
			return this.add(props, directives);
		}
		else{
			// check to see if it is an RPC object
			// TODO: Do this: if(props instanceof RPC){ // where the media handler creates RPC objects
			if(props && "method" in props && "id" in props && "params" in props){
				// looks like JSON-RPC
				return rpcInvoke(this.get(directives.id), props, directives);
			}
			// doing an incremental update
			return this.copyProperties(props, directives);
		}
	};

	constructor.__proto__ = httpHandlerPrototype;

	// TODO: handle immutable proto
	return constructor;
}
var mustBeValid = require("json-schema/lib/validate").mustBeValid;
var validate = require("json-schema/lib/validate").validate;
var writableProto = !!({}.__proto__);
var SchemaControlled = function(facetSchema, sourceClass, permissive){
	var properties = facetSchema.properties;
	var schemaLinks = facetSchema.links || sourceClass.links;
	var idTemplate;
	if(schemaLinks && schemaLinks instanceof Array){
		schemaLinks.forEach(function(link){
/*			// TODO: allow for multiple same-name relations
			if(links[link.rel]){
				if(!(links[link.rel] instanceof Array)){
					links[link.rel] = [links[link.rel]];
				}
			}*/
			if(link.rel == "self"){
				idTemplate = link.href;
			}
		});
	}
	if(!facetSchema.getId){
		if(idTemplate){
			Object.defineProperty(facetSchema, "getId", {
				value: function(object){
					return substitute(idTemplate, object);
				}
			});
		}else{
			Object.defineProperty(facetSchema, "getId", {
				value: function(object){
					return object.id;
				}
			});
		}
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
	return function createWrap(){
		return function wrap(source, transaction, wrapped, partial){
			return when(source, function(source){
				if(!source || typeof source !== "object"){
					return source;
				}
				if(source instanceof Array){
					if(source.observe){
						// if event emitter, just return it
						return source;
					}
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
							var loadingSource;

							if(facetSchema.allowed && !facetSchema.allowed(transaction.request, source)){
								throw new AccessError("Access denied to " + source);
							}
							if(source.load && this != source){
								loadingSource = source.load();
							}
							else{
								loadingSource = sourceClass.get(facetSchema.getId(source));
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
						save: {
							value: function(directives){
								var i, id;

								directives = directives || {};
								if(this != source){
									directives.previous = copy(source, {});
								}
								if(facetPrototype.save){
									facetPrototype.save.call(this, directives);
								}
								var validation = validate(this, facetSchema);
								var instance = this;
								for(i in this){
									if(this.hasOwnProperty(i)){
										transfer(this[i]);
									}
								}
								for (i in source){
									if(source.hasOwnProperty(i) && !this.hasOwnProperty(i)){
										transfer(undefined);
									}
								}
								mustBeValid(validation);
								var isNew = partial === NEW;
								if(isNew && (typeof facetSchema.add === "function")){ //  || )
									partial = undefined;
									id = facetSchema.add(source, directives);
								}
								else if(typeof facetSchema.put === "function"){
									if(isNew){
										directives.overwrite = false;
									}
									id = facetSchema.put(source, directives);
								}
								else if(permissive && isNew && typeof sourceClass.add === "function"){
									id = sourceClass.add(source, directives);
								}
								else if(permissive && typeof sourceClass.put === "function"){
									if(isNew){
										directives.overwrite = false;
									}
									id = sourceClass.put(source, directives);
								}
								else{
									throw new MethodNotAllowedError("put is not allowed");
								}
								var self = this;
								/*if(typeof id == "string" || typeof id == "number"){
									source.id = id;
								}*/
								return when(id, function(id){
									if(isNew){
										if((typeof id == "string" || typeof id == "number") && promiseModule.currentContext){
											promiseModule.currentContext.generatedId = id;
										}

									}
									copyFromSource();
									return self;
								});
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
							enumerable: false,
							writable: true
						},
						load: {
							value: function(){
								if(typeof source.load === "function"){
									source.load();
								}
								copyFromSource();
								return wrapped;
							},
							enumerable: false,
							writable: true
						},
						schema: {
							get: function(){
								var copyOfSchema = copy(facetSchema, {});
								copyOfSchema.schema = facetSchema.schema;
								copyOfSchema.getId = facetSchema.getId;
								return copyOfSchema;
							},
							enumerable: false
						}
					});
				}
				function copyFromSource(){
					var i, propDef;

					for(i in source){
						if(source.hasOwnProperty(i) && i != "schema"){
							propDef = properties && properties[i];
							if(!(propDef && propDef.blocked)){
								wrapped[i] = source[i];
							}
						}
					}
					for(i in properties){
						propDef = properties[i];
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
};
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
}

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
				facet = facets[index];
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


function Facet(appliesTo, schema, permissive){
	var facetedStore, baseFacetedStore = FacetedStore(appliesTo, schema);
	var createWrap = SchemaControlled(schema, appliesTo, permissive);
	baseFacetedStore.wrap = createWrap(baseFacetedStore);
	function FacetForStore(sourceStore, transaction){
		if(!canFacetBeAppliedTo(appliesTo, sourceStore)){
			throw new TypeError("facet can not be applied to " + sourceStore.name);
		}
		if(appliesTo == sourceStore){
			facetedStore = function(){
				return facetedStore.construct.apply(facetedStore, arguments);
			};
			facetedStore.__proto__ = baseFacetedStore;
			facetedStore.wrap = createWrap(facetedStore);
		}
		else{
			facetedStore = FacetedStore(sourceStore, schema, permissive);
			facetedStore.wrap = SchemaControlled(schema, sourceStore, permissive)(facetedStore);
		}
		facetedStore.transaction = transaction;
		return facetedStore;
	}
	baseFacetedStore.forStore = FacetForStore;
	baseFacetedStore._baseFacetedStore = baseFacetedStore;
	Facet.instances.push(baseFacetedStore);
	appliesTos.push(appliesTo || Object);
	return baseFacetedStore;
}
var appliesTos = [];
Facet.instances = [];

exports.Restrictive = function(appliesTo, schema){
	schema = schema || {quality:0.2};

	var appliesToPrototype = appliesTo.prototype;
	if(appliesToPrototype){
		var schemaPrototype = schema.prototype = schema.prototype || {};
		schemaPrototype.__noSuchMethod__ = function(name, source, args, onlyIfAvailable){
			if(name.substring(0,3) === "get"){
				if(appliesToPrototype[name]){
					return facet.wrap(appliesToPrototype[name].apply(source, args));
				}
				if(appliesToPrototype.__noSuchMethod__){
					return facet.wrap(source.__noSuchMethod__(name, args, onlyIfAvailable));
				}
			}
			if(!onlyIfAvailable){
				throw new MethodNotAllowedError(name + " is not allowed");
			}
			return null;
		};
		if(appliesToPrototype.get){
			schemaPrototype.get = DELEGATE;
		}
	}
	var facet = Facet(appliesTo, schema);
	if(!schema.query){
		facet.query = function(query, options){
			facet.checkQuery(query);
			return appliesTo.query(query, options);
		};
	}
	for(var i in appliesTo){
		if(!facet[i] && i.substring(0,3) == "get"){
			(function(i){
				facet[i] = function(){
					return facet.wrap(appliesTo[i].apply(appliesTo, arguments));
				};
			})(i);
		}
	}
	return facet;

};
var DELEGATE = function(){};
exports.Permissive = function(appliesTo, schema){
	schema = schema || {quality:0.5};
	var appliesToPrototype = appliesTo.prototype;
	if(appliesToPrototype){
		var schemaPrototype = schema.prototype = schema.prototype || {};
		schemaPrototype.__noSuchMethod__ = function(name, source, args, onlyIfAvailable){
			if(appliesToPrototype[name]){
				return facet.wrap(appliesToPrototype[name].apply(source, args));
			}
			if(appliesToPrototype.__noSuchMethod__){
				return facet.wrap(source.__noSuchMethod__(name, args, onlyIfAvailable));
			}
			if(!onlyIfAvailable){
				throw new MethodNotAllowedError(name + " is not allowed");
			}
			return null;
		};
		if(appliesToPrototype.get){
			schemaPrototype.get = DELEGATE;
		}
	}
	var facet = Facet(appliesTo, schema, true);
	for(var i in appliesTo){
		if(!facet[i]){
			(function(i){
				facet[i] = function(){
					return facet.wrap(appliesTo[i].apply(appliesTo, arguments));
				};
			})(i);
		}
	}
	return facet;
};

exports.callMethod = function(object, name, args, onlyIfAvailable){
	if(object[name]){
		return object[name].apply(object, args);
	}
	if(object.__noSuchMethod__){
		return object.__noSuchMethod__(name, args, onlyIfAvailable);
	}
	if(!onlyIfAvailable){
		throw new MethodNotAllowedError(name + " is not allowed");
	}

};

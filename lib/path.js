/**
 * Module for looking up objects by path-based identifiers
 */
var all = require("promised-io/promise").all,
	when = require("promised-io/promise").when,
	getLink = require("commonjs-utils/json-schema").getLink;

exports.resolver = function resolver(store, getDataModel){
	// Creates a function for resolving ids that have dot-delimited paths,
	// and resolves any links in those paths
	// 		store: The name of the store to use to resolve ids
	//		getDataModel: Optional parameter for resolving cross-model references 
	return function(id, metadata){
		metadata = metadata || {};
		id = '' + id;
		var schema = this;
		if(id.indexOf('.') > -1 && (id.indexOf('?') == -1 || id.indexOf('.') < id.indexOf('?'))){
			var parts = id.split('.');
			var value = store.get(parts.shift());
			parts.forEach(function(part){
				value = when(value, function(value){
					var linkTarget = schema != this && getLink(part, value, schema);
					if(!linkTarget){
						value = value && value[part];
						linkTarget = value && value.$ref;
					}
					if(linkTarget){
						if((linkTarget.charAt(0) == '/' || linkTarget.substring(0,3) == '../') && getDataModel){
							value = getFromDataModel(getDataModel(), linkTarget.substring(linkTarget.charAt(0) == '/' ? 1 : 3));
						}else{
							value = store.get(linkTarget);
						}
					}
					return value;
				}); 
			});
			return value;
		}
		if(id === '' || id.charAt(0) == "?"){
			return store.query(id.substring(1), metadata);
		}
		var parts = id.match(/[\.#][^\.#]+/g);
		if(parts){
			var value = store.get(id.match(/^([^\.#]*)[\.#]/)[0]);
			for(var i = 0; i < parts.length; i++){
				var part = parts[i];
				value = value[part.substring(1)];
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
				return store.get(part, metadata);
			}));
		}
		return store.get(id, metadata);
	};
};
exports.resolve = function(id, metadata, store, dataModel){
	return resolver(store, dataModel)(id, metadata);
}

function getFromDataModel(dataModel, path){
	var model = dataModel;
	var part; 
	do{
		var proceed = false;
		var slashIndex = path.indexOf("/");
		if(slashIndex > -1){
			part = path.substring(0, slashIndex);
			if(model[part]){
				model = model[part];
				path = path.substring(slashIndex + 1);
				proceed = true;
			}
		}
	}while(proceed);
			require("sys").puts("get from " + model + " path: " + path);
	
	return exports.resolver(model, function(){;
		return dataModel;
	})(path);
}	

exports.LinkResolving = function(model, getDataModel){
//Model wrapper that uses schema links to incorporate
//sub-objects or references into the object
//    model: the model object to wrap
//    getDataModel: Optional parameter for resolving cross-model references

    //the resolver expects there to be a links array
    model.links = model.links || [];

    var originalGet = model.get;

    var resolvingGet = function(id, metadata){
        var self = this;
        metadata = metadata || {};
        id = '' + id;
        var schema = this;
        if(id.indexOf('/') > -1 && (id.indexOf('?') == -1 || id.indexOf('/') < id.indexOf('?'))){
            var parts = id.split('/');
            var value = originalGet.call(this, parts.shift());
            parts.forEach(function(part){
                value = when(value, function(value){
                    var linkTarget =  getLink(part, value, schema);

                    if(!linkTarget){
                        value = value && value[part];
                        linkTarget = value && value.$ref;
                    }
                    if(linkTarget){
                        if((linkTarget.charAt(0) == '/' || linkTarget.substring(0,3) == '../') && getDataModel){
                            value = getFromDataModel(getDataModel(), linkTarget.substring(linkTarget.charAt(0) == '/' ? 1 : 3));
                        }else{
                            value = originalGet.call(self, linkTarget);
                        }
                    }
                    return value;
                }); 
            });
            return value;
        }
        if(id === '' || id.charAt(0) == "?"){
            return model.query(id.substring(1), metadata);
        }
        if(id.match(/^\(.*\)$/)){
            // handle paranthesis embedded, comma separated ids
            if(id.length == 2){ // empty array
                return [];
            }
            var parts = id.substring(1, id.length -1).split(',');
            return all(parts.map(function(part){
                return originalGet.call(self, part, metadata);
            }));
        }
        return originalGet.call(this, id, metadata);
    };
    
    var resolve = function(obj,metadata){
        var self = this;
        var promises = model.links.filter(function(link){
            return link.resolution !== undefined && (link.resolution == "eager" || link.resolution == "lazy");
        }).map(function(link){
            if(link.resolution == "eager"){
                //put the resolved sub-object into the object
                var id = (model.getId) ? model.getId(obj) : obj.id;
                return when(resolvingGet.call(self, id + "/" + link.rel, metadata), function(subObject){
                    obj[link.rel] = subObject;
                });
            }else if(link.resolution == "lazy"){
                //put a reference to the sub-object into the object
                var addLinkTask = new Promise();
                obj[link.rel] = {"$ref": getLink(link.rel, obj, model)};
                addLinkTask.callback();
                return addLinkTask;
            }
        });
        return when(all(promises), function(){return obj;});
    }
    
    
    model.get = function(id, metadata){
        var self = this;
        var rawResult = resolvingGet.call(this, id, metadata);
        if(id.indexOf("/")<0){
            return when(rawResult,function(rawResult){
                return resolve.call(self, rawResult, metadata);
            });
        }
        return rawResult;
    };
    
    var originalQuery = model.query;
    
    model.query = function(query, metadata){
        var self = this;
        var rawResult = originalQuery.call(this, query, metadata);
        if(model.links.some(function(link){ return link.resolution!==undefined; })){
            return when(rawResult, function(rawResult){
                var promises = rawResult.map(function(obj){
                    return resolve.call(self, obj, metadata);
                });
                return when(all(promises), function(){ return rawResult; });
            });
        }
        return rawResult;
    }

    var originalPut = model.put;
    
    model.put = function(obj){
        var putObj = obj;
        var links = model.links.filter(function(link){
            return link.resolution !== undefined && (link.resolution == "eager" || link.resolution == "lazy");
        });
        if(links.length >0){
            putObj = {};
            //clone the object
            for(key in obj){
                if(obj.hasOwnProperty(key)){
                    putObj[key] = obj[key];
                }
            }
            //remove the objects that were added by links
            links.forEach(function(link){
                delete putObj[link.rel];
            });
        }
        originalPut.call(this, putObj);
    }

    return model;
}
/**
 * This is a wrapper store that adds indexing through map functions
 */
var when = require("promised-io/promise").when;
	
module.exports = function(store, options){
	options = options || {};
	var IndexConstructor = options.IndexConstructor || require("../stores").DefaultStore;
	store.deriveView = function deriveView(map){
		var index = new IndexConstructor();
		store.setPath(map.toString());
		var getRevision = index.getRevision || function(){
			return index.get("__revision__");
		};
		var getRevision = index.setRevision || function(revision){
			return index.put("__revision__", revision);
		};
		var getRevisions = derivedFrom.getRevisions || store.getRevisions || function(from){
			return store.query("revisions(" + from + ")");
		};
		var revision;
		return {
			cursor: function(){
				var storeRevision = store.getRevision(); 
				// TODO: Might use a vclock type of strategy to determine if we really need to update
				if(storeRevision > getRevision()){
					var transaction = index.transaction(true);
					// make sure we still need to update after getting the lock
					if(storeRevision > getRevision()){
						getRevisions(getRevisition()).forEach(function(object){
							var old = store.getPrevisionVersion(object);
							if(old){
								map(old, function(key, value){
									index.remove(key + '/' + old.id);
								});
							}
							if(object){
								if(maybeAlreadyApplied){
									map(object, function(key, value){
										index.remove(key + '/' + object.id);
									});
								}
								map(object, function(key, value){
									index.put(key + '/' + object.id, value);
								});
							}
						});
					}
					setRevision(storeRevision);
					transaction.commit();
				}
				return index.cursor();
			},
			deriveView: function(){
				
			}
			
		}
	};
	return store;
};
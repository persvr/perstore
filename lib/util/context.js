exports.currentContext = null;

require("promised-io/promise").contextHandler.getHandler = function(){
	var context = exports.currentContext; 
	return {
		resume: function(){
			exports.currentContext = context;
			if(context && context.onResume){
				context.onResume();
			}
		},
		suspend: function(){
			exports.currentContext = null;
			if(context && context.onSuspend){
				context.onSuspend();
			}
		}
	}
};

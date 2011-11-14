require("json-schema/lib/validate").coerce = function(instance, schema){
	switch(schema.type){
		case "string": 
			instance = instance ? instance.toString() : ""; 
			break;  
		case "number":
			if(!isNaN(instance)){ 
				instance = +instance;
			}
			break;
		case "boolean": 
			instance = !!instance;
			break; 
		case "null": 
			instance = null;
			break; 
		case "object": 
			// can't really think of any sensible coercion to an object 
			break; 
		case "array": 
			instance = instance instanceof Array ? instance : [instance];
			break; 
		 case "date":
			var date = new Date(instance);
			if(!isNaN(date.getTime())){
				instance = date;
			}
			break;
	}
	return instance;
};

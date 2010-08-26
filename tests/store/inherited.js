var assert = require("assert"),
	baseStore = require("store/memory").Memory(),
	superSchema = {id:"A"},
	superStore = require("store/inherited").Inherited(superSchema, baseStore),
	subStore = require("store/inherited").Inherited({id:"B","extends": superSchema}, baseStore);

superStore.put({name:"Instance of super store"});
subStore.put({name:"Instance of sub store"});	
exports.testSub = function(){
	assert.equal(subStore.query("", {}).length, 2);
};
exports.testSuper = function(){
	assert.equal(superStore.query("", {}).length, 1);
	superStore.query("", {}).forEach(function(object){
		assert.equal(object.name, "Instance of super store");
	});
};
if (require.main === module)
    require("patr/runner").run(exports);
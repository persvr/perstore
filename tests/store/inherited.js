var assert = require("assert"),
	baseStore = require("../../store/memory").Memory(),
	superSchema = {id:"A"},
	superStore = require("../../store/inherited").Inherited(baseStore),
	subStore = require("../../store/inherited").Inherited(baseStore),
	superModel = require("../../model").Model(superStore,superSchema),
	subModel = require("../../model").Model(subStore, {id:"B","extends": superSchema});
	

superStore.put({name:"Instance of super store"});
subStore.put({name:"Instance of sub store"});	
exports.testSub = function(){
	assert.equal(subStore.query("", {}).length, 1);
	subStore.query("", {}).forEach(function(object){
		assert.equal(object.name, "Instance of sub store");
	});
};
exports.testSuper = function(){
	assert.equal(superStore.query("", {}).length, 2);
};
if (require.main === module)
    require("patr/runner").run(exports);
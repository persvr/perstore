var assert = require("assert"),
	storeA = require("../../store/memory").Memory(),
	storeB = require("../../store/memory").Memory(),
	combinedStore = require("../../store/aggregate").Aggregate(
		[storeA, storeB],
		[["foo"],["bar"]]);
	

var id = combinedStore.put({foo:"foo",bar:"bar"});
exports.testWhole = function(){
	assert.equal(combinedStore.get(id).foo, "foo");
	assert.equal(combinedStore.get(id).bar, "bar");
};
exports.testParts = function(){
	assert.equal(storeA.get(id).foo, "foo");
	assert.equal(storeA.get(id).bar, undefined);
	assert.equal(storeB.get(id).foo, undefined);
	assert.equal(storeB.get(id).bar, "bar");
};
if (require.main === module)
    require("patr/runner").run(exports);
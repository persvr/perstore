var assert = require("assert"),
	testStore = require("../../store/memory").ReadOnly({
		index: {
			1: {id: 1, foo: 2}
		}
	});
exports.testGet = function(){
	assert.equal(testStore.get(1).foo, 2);
};
if (require.main === module)
    require("patr/runner").run(exports);
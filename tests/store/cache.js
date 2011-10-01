var assert = require("assert"),
	baseStore = require("../../store/memory").Memory(),
	cachingStore = require("../../store/memory").Memory(),
	cachedStore = require("../../store/cache").Cache(baseStore, cachingStore);

cachedStore.put({name:"Instance of cached store"});
exports.testCached = function(){
	assert.equal(cachedStore.query("", {}).length, 1);
};
exports.testBase = function(){
	assert.equal(baseStore.query("", {}).length, 1);
};
if (require.main === module)
    require("patr/runner").run(exports);
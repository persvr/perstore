var assert = require("assert"),
	model = require("./model").model,
	CreateTests = require("./model").CreateTests,
	Restrictive = require("../facet").Restrictive,
	Permissive = require("../facet").Permissive;

var permissiveFacet = Permissive(model, {
	extraStaticMethod: function(){
		return 4;
	}
});
var permissiveTests = CreateTests(permissiveFacet);
for(var i in permissiveTests){
	exports[i + "Permissive"] = permissiveTests[i];
}
exports.testExtraStaticMethod = function(){
	assert.equal(permissiveFacet.extraStaticMethod(), 4);
}

var restrictiveFacet = Restrictive(model);
var restrictiveTests = CreateTests(restrictiveFacet);

exports.testGetRestrictive = restrictiveTests.testGet;
exports.testLoadRestrictive = restrictiveTests.testLoad;
exports.testSaveRestrictive = shouldFail(restrictiveTests.testSave);
exports.testMethodRestrictive = shouldFail(restrictiveTests.testMethod);
exports.testStaticMethodRestrictive = shouldFail(restrictiveTests.testStaticMethod);

function shouldFail(test){
	return function(){
		assert["throws"](test);
	};
};

if (require.main === module)
    require("patr/runner").run(exports);
var assert = require("test/assert"),
	model = require("./model").model,
	CreateTests = require("./model").CreateTests;
	Restrictive = require("facet").Restrictive,
	Permissive = require("facet").Permissive;

var permissiveFacet = Permissive(model, {
	extraStaticMethod: function(){
		
	}
});
var permissiveTests = CreateTests(permissiveFacet);
for(var i in permissiveTests){
	exports[i + "Permissive"] = permissiveTests[i];
}

var restrictiveFacet = Restrictive(model);
var restrictiveTests = CreateTests(restrictiveFacet);

exports.testGetRestrictive = restrictiveTests.testGet;
exports.testLoadRestrictive = restrictiveTests.testLoad;
exports.testGetPropertyRestrictive = restrictiveTests.testGetProperty;
exports.testLinkRestrictive = restrictiveTests.testLink;
exports.testSaveRestrictive = shouldFail(restrictiveTests.testSave);
exports.testMethodRestrictive = shouldFail(restrictiveTests.testMethod);
exports.testStaticMethodRestrictive = shouldFail(restrictiveTests.testStaticMethod);

function shouldFail(test){
	return function(){
		assert.throwsError(test);
	};
};

if (require.main === module.id)
    os.exit(require("test/runner").run(exports));
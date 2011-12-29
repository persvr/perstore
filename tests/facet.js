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
};

var restrictiveFacet = Restrictive(model);
var restrictiveTests = CreateTests(restrictiveFacet);

restrictiveTests.testSave = shouldFail(restrictiveTests.testSave);
restrictiveTests.testMethod = shouldFail(restrictiveTests.testMethod);
restrictiveTests.testStaticMethod = shouldFail(restrictiveTests.testStaticMethod);
restrictiveTests.testQuery = shouldFail(restrictiveTests.testQuery);

for(i in restrictiveTests){
	exports[i + "Restrictive"] = restrictiveTests[i];
}

function shouldFail(test){
	return function(){
		assert["throws"](test);
	};
};

if (require.main === module)
    require("patr/runner").run(exports);
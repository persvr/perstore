var testStore = require("../../store/js-file").JSFile("data/TestStore"),
	CreateQueryTests = require("../query").CreateQueryTests;

var tests = CreateQueryTests(testStore);
for(var i in tests){
	exports[i] = tests[i];
}

if (require.main === module)
    require("patr/runner").run(exports);
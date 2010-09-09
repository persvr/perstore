var store;
var testQuery = require("rql/parser").parse("foo=hi");
exports.tests = {
	testPut: {
		runTest: function(){
			store.put({id:1,foo:3});
		},
		iterations: 1000
	},
	testGet: {
		runTest: function(){
			store.get(1);
		},
		iterations: 1000
	},
	testQuery: {
		runTest: function(){
			store.query(testQuery);
		},
		iterations: 1000
	}
	
	
};
exports.testStore = function(storeToTest){
	store = storeToTest;
    require("patr/runner").run(exports.tests);
};
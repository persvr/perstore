var store;
var testQuery = require("rql/parser").parse("foo=hi");
exports.tests = {
	iterations: 1000,
	testPut: function(){
		store.put({id:1,foo:3});
	},
	testGet: function(){
		store.get(1);
	},
	testQuery: function(){
		store.query(testQuery);
	}	
};
exports.testStore = function(storeToTest, args){
	store = storeToTest;
    require("patr/runner").run(exports.tests, args);
};
var assert = require("assert");

exports.setupTest = function(store){
	
};

function assertConditionAndCount(array, condition, expectedCount){
	var count = 0;
	array.forEach(function(item){
		assert.ok(condition(item), condition.toString());
		count++;
	});
	assert.equal(count, expectedCount);
}
exports.CreateQueryTests = function(store){
	return {
		testEqual : function(){
			assertConditionAndCount(store.query("foo=2"), function(item){
				return item.foo === 2;
			}, 1);
		},
		testEqualString : function(){
			assertConditionAndCount(store.query("bar=hi"), function(item){
				return item.bar === "hi";
			}, 1);
		},
		testLessThan : function(){
			assertConditionAndCount(store.query("foo=lt=2"), function(item){
				return item.foo < 2;
			}, 2);
		},
		testLessThanRaw : function(){
			assertConditionAndCount(store.query("foo<2"), function(item){
				return item.foo < 2;
			}, 2);
		},
		testLessThanOrEqual : function(){
			assertConditionAndCount(store.query("foo=le=2"), function(item){
				return item.foo <= 2;
			}, 3);
		},
		testGreaterThan : function(){
			assertConditionAndCount(store.query("foo=gt=1"), function(item){
				return item.foo > 1;
			}, 1);
		},
		testGreaterThanRaw : function(){
			assertConditionAndCount(store.query("foo>1"), function(item){
				return item.foo > 1;
			}, 1);
		},
		testGreaterThanOrEqual : function(){
			assertConditionAndCount(store.query("foo=ge=1"), function(item){
				return item.foo >= 1;
			}, 3);
		},
		testAnd: function(){
			assertConditionAndCount(store.query("foo=ge=1&foo=lt=2"), function(item){
				return item.foo >= 1;
			}, 2);
		},
		testOr: function(){
			assertConditionAndCount(store.query("foo=1|foo=ge=2"), function(item){
				return item.foo = 1 || this.foo >= 2;
			}, 3);
		},
		testSortAsc: function(){
			var lastFoo = 0;
			assertConditionAndCount(store.query("sort(+foo)"), function(item){
				var valid = item.foo >= lastFoo;
				lastFoo = item.foo;
				return valid;
			}, 3);
		},
		testSortDesc: function(){
			var lastFoo = Infinity;
			assertConditionAndCount(store.query("sort(-foo)"), function(item){
				var valid = item.foo <= lastFoo;
				lastFoo = item.foo;
				return valid;
			}, 3);
		}
	};
}
if (require.main === module)
    require("patr/runner").run(exports);
var assert = require("test/assert"),
	testStore = require("stores").DefaultStore("TestStore"),
	testModel = require("model").Model("TestStore", testStore, {
		prototype: {		
			testMethod: function(){
				return this.foo;
			}
		},
		properties: {
			foo: {
				type: "number"
			}
		},
		links: [
			{
				rel: "fooTarget",
				href: "{foo}"
			}
		]
	});

exports.testGet = function(){
	assert.eq(testModel.get(1).foo, 2);
};

exports.testLoad = function(){
	var object = testModel.get(1);
	object = object.load();
	assert.eq(object.foo, 2);
};

exports.testSave = function(){
	var object = testModel.get(1);
	var newRand = Math.random();
	object.rand = newRand;
	object.save();
	object = testModel.get(1);
	assert.eq(object.rand, newRand);
};

exports.testLink = function(){
	var fooTarget = testModel.get(1).get("fooTarget");
	assert.eq(fooTarget.id, 2);
	assert.eq(fooTarget.bar, "hi");
};

exports.testSchemaEnforcement = function(){
	var object = testModel.get(1);
	object.foo = "not a number";
	assert.throwsError(function(){
		object.save();
	});
};

exports.testMethod = function(){
	var object = testModel.get(1);
	assert.eq(testModel.get(1).testMethod(), 2);
};

if (require.main === module.id)
    os.exit(require("test/runner").run(exports));
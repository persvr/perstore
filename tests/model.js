var assert = require("test/assert"),
	store = require("stores").DefaultStore("TestStore"),
	model = require("model").Model("TestStore", store, {
		prototype: {		
			testMethod: function(){
				return this.foo;
			}
		},
		staticMethod: function(id){
			return this.get(id);
		},
		properties: {
			foo: {
				type: "number"
			}
		},
		links: [
			{
				rel: "foo",
				href: "{foo}"
			}
		]
	});

exports.model = model;
exports.CreateTests = function(model){
	return {
		testGet: function(){
			assert.eq(model.get(1).foo, 2);
		},

		testLoad: function(){
			var object = model.get(1);
			object = object.load();
			assert.eq(object.foo, 2);
		},

		testQuery: function(){
			var count = 0;
			model.query("bar=hi").forEach(function(item){
				assert.eq(item.bar, "hi");
				count++;
			});
			assert.eq(count, 1);
		},
		
		testSave: function(){
			var object = model.get(1);
			var newRand = Math.random();
			object.rand = newRand;
			object.save();
			object = model.get(1);
			assert.eq(object.rand, newRand);
		},

		testGetProperty: function(){
			var bar = model.get(2).get("bar");
			assert.eq(bar, "hi");
		},

		testLink: function(){
			var fooTarget = model.get(1).get("foo");
			assert.eq(fooTarget.id, 2);
			assert.eq(fooTarget.bar, "hi");
		},

		testSchemaEnforcement: function(){
			var object = model.get(1);
			object.foo = "not a number";
			assert.throwsError(function(){
				object.save();
			});
		},

		testMethod: function(){
			var object = model.get(1);
			assert.eq(model.get(1).testMethod(), 2);
		},

		testStaticMethod: function(){
			var object = model.staticMethod(1);
			assert.eq(object.id, 1);
		}
	};
};
var modelTests = exports.CreateTests(model);
for(var i in modelTests){
	exports[i] = modelTests[i];
}
if (require.main === module.id)
    os.exit(require("test/runner").run(exports));
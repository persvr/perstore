var assert = require("assert"),
	store = require("../stores").DefaultStore(),
	Model = require("../model").Model,
	errors = require("../errors"),
	model = Model(store, {
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
			},
			bar: {
				optional: true,
				unique: true
			}
		},
		links: [
			{
				rel: "foo",
				href: "{foo}"
			}
		]
	});
model.setPath("TestStore");

var baseTests = {
	'test can create a model from just a schema': function () {
		var schema = {};

		assert.doesNotThrow(function () {
			Model(schema);
		});

		assert.doesNotThrow(function () {
			Model(null, schema);
		});
	},

	'test calls store.setSchema with schema if found on store': function () {
		var arg,
			store = {
				setSchema: function (schema) {
					arg = schema;
				}
			},
			schema = {};

		Model(store, schema);

		assert.strictEqual(arg, schema);
	},

	'test if schema is a function, it is the model': function () {
		var expected = {},
			calledWith,
			schema = function (source) {
				calledWith = source;
				return expected;
			},
			store = {},
			obj = {},
			actual,
			model;

		model = new Model(store, schema);

		assert.equal(model, schema);

		actual = model(obj);
		assert.strictEqual(calledWith, obj);
		assert.strictEqual(actual, expected);
	}
};

exports.model = model;
exports.CreateTests = function(model){
	return {
		testGet: function(){
			assert.equal(model.get(1).foo, 2);
		},

		testQuery: function(){
			var count = 0;
			model.query("bar=hi").forEach(function(item){
				assert.equal(item.bar, "hi");
				count++;
			});
			assert.equal(count, 1);
		},

		testSave: function(){
			var object = model.get(1);
			var newRand = Math.random();
			object.rand = newRand;
			object.save();
			object = model.get(1);
			assert.equal(object.rand, newRand);
		},

		testSchemaEnforcement: function(){
			var object = model.get(1);
			object.foo = "not a number";
			assert["throws"](function(){
				object.save();
			});
		},

		testSchemaUnique: function(){
			assert["throws"](function(){
				model.put({foo:3, bar:"hi"});
			});
		},

		testMethod: function(){
			var object = model.get(1);
			assert.equal(model.get(1).testMethod(), 2);
		},

		testStaticMethod: function(){
			var object = model.staticMethod(1);
			assert.equal(object.id, 1);
		},

		// TODO: model.put and propDef.set and more...

		'test functions from the store become wrapped functions on the model': function () {
			var calls = {},
				store = {
					foo: function () {
						calls.foo = true;
					},
					bar: function () {
						calls.bar = true;
					}
				},
				schema = {},
				model;

			model = new Model(store, schema);

			Object.keys(store).forEach(function (prop) {
				assert.ok(prop in model);
				assert.notEqual(model[prop], store[prop], prop + ' not wrapped');
				model[prop]();
				assert.ok(calls[prop]);
			});
		},

		'test model is a function/constructor': function () {
			var store = {},
				schema = {},
				model;

			model = new Model(store, schema);

			assert.equal(typeof model, 'function');
		},

		'test model calls model.construct': function () {
			var store = {},
				schema = {},
				model = new Model(store, schema),
				called,
				instance;

			model.construct = function () {
				called = true;
			};

			instance = model();

			assert.ok(called);
		},

		'test empty prototype is added to model if none in schema': function () {
			var store = {},
				schema = {},
				model;

			model = new Model(store, schema);

			assert.ok(model.prototype);
		},

		'test prototype from schema is used as model prototype': function () {
			var store = {},
				proto = {
					foo: 'foo',
					bar: {}
				},
				schema = {
					prototype: proto
				},
				model = new Model(store, schema),
				instance;

			instance = model();

			Object.keys(instance).forEach(function (prop) {
				assert.strictEqual(instance[prop], proto[prop], prop + ' should be copied to instance');
			});
		},

		'test properties from schema are static properties on model': function () {
			var store = {},
				schema = {
					foo: 'foo',
					bar: {}
				},
				model;

			model = new Model(store, schema);

			Object.keys(schema).forEach(function (prop) {
				assert.strictEqual(model[prop], schema[prop], prop + ' should be a prop of model');
			});
		},

		'test model.instanceSchema is reference to schema': function () {
			var store = {},
				schema = {},
				model;

			model = new Model(store, schema);

			assert.equal(model.instanceSchema, schema);
		},

		'test model.query throws error if neither schema nor model define query': function () {
			var store = {},
				schema = {},
				model;

			model = new Model(store, schema);

			assert.throws(function () {
				model.query('foo');
			}, errors.MethodNotAllowedError);
		},

		'test model.query delegates to store.query': function () {
			var called = {},
				store = {
					query: function () {
						called.store = true;
					}
				},
				schema = {},
				model = new Model(store, schema);

			model.query('foo');

			assert.ok(called.store);
		},

		'test model.query prefers schema.query': function () {
			var called = {},
				store = {
					query: function () {
						called.store = true;
					}
				},
				schema = {
					query: function () {
						called.schema = true;
					}
				},
				model = new Model(store, schema);

			model.query('foo');

			assert.ok(called.schema);
			assert.ok(!called.store);
		},

		'test model.construct returns a wrapped instance': function () {
			var store = {},
				schema = {},
				model = new Model(store, schema),
				instance = {
					foo: function () {},
					bar: 'bar'
				},
				nonEnumerable = {
					load: true,
					schema: true,
					save: true
				},
				item;

			item = model(instance);

			Object.keys(item).forEach(function (prop) {
				assert.strictEqual(item[prop], instance[prop]);
				assert.ok(!nonEnumerable[prop]);
			});

			assert.equal(typeof item.load, 'function');
			assert.equal(typeof item.save, 'function');
			assert.ok('schema' in item);
		},

		'test default properties from schema are set on new model instance': function () {
			var foo = {},
				schema = {
					properties: {
						foo: {
							'default': foo
						}
					}
				},
				model = Model(schema),
				instance;

			instance = model();

			assert.equal(instance.foo, foo);

			instance = model({
				foo: 5
			});

			assert.equal(instance.foo, 5);
		},

		'test default properties can be functions': function () {
			var foo = {},
				schema = {
					properties: {
						foo: {
							'default': function () {
								return foo;
							}
						}
					}
				},
				model = Model(schema),
				instance;

			instance = model();

			assert.strictEqual(instance.foo, foo);
		},

		'test schema.construct is called with new model instance': function () {
			var called,
				args,
				schema = {
					construct: function () {
						args = [].slice.call(arguments);
						called = true;
					}
				},
				model = new Model(schema),
				source = {},
				instance;

			instance = model(source);

			assert.ok(called);
			assert.strictEqual(args[0], instance);
			assert.ok(!args[1].overwrite);
		},

		'test model.get delegates to store.get': function () {
			var called = {},
				store = {
					get: function () {
						called.store = true;
					}
				},
				schema = {},
				model = new Model(store, schema);

			model.get();

			assert.ok(called.store);
		},

		'test model.get prefers schema.get': function () {
			var called = {},
				store = {
					get: function () {
						called.store = true;
					}
				},
				schema = {
					get: function () {
						called.schema = true;
					}
				},
				model = new Model(store, schema);

			model.get();

			assert.ok(called.schema);
			assert.ok(!called.store);
		},

		'test model.remove delegates to store.remove': function () {
			var called = {},
				store = {
					remove: function () {
						called.store = true;
					}
				},
				schema = {},
				model = new Model(store, schema);

			model.remove();

			assert.ok(called.store);
		},

		'test model.remove prefers schema.remove': function () {
			var called = {},
				store = {
					remove: function () {
						called.store = true;
					}
				},
				schema = {
					remove: function () {
						called.schema = true;
					}
				},
				model = new Model(store, schema);

			model.remove();

			assert.ok(called.schema);
			assert.ok(!called.store);
		},

		'test model.add constructs and saves a new instance': function () {
			var called = {},
				schema = {},
				model = Model(schema),
				props = {},
				directives = {},
				instance = {
					save: function (a) {
						assert.strictEqual(a, directives);
						assert.ok(called.construct);
						called.save = true;
					}
				};

			model.construct = function (p) {
				assert.strictEqual(p, props);
				called.construct = true;
				return instance;
			};

			model.add(props, directives);

			assert.ok(called.construct);
			assert.ok(called.save);
		},

		'test property getters from schema property definitions get called': function () {
			var called = {},
				schema = {
					properties: {
						foo: {
							get: function (prop) {
								assert.ok(prop, 'foo');
								called.foo = true;
							}
						}
					}
				},
				model = Model(schema),
				source = {
					foo: 5
				},
				instance;

			instance = model(source).load();

			assert.ok(called.foo);
		},

		'test schema.save is called when instance is saved': function () {
			var called = {},
				schema = {
					prototype: {
						save: function () {
							called.save = true;
							assert.strictEqual(this, instance);
						}
					}
				},
				source = {
					id: 1
				},
				store = {
					put: function () {}
				},
				model = Model(store, schema),
				instance;

			instance = model(source);
			instance.save();

			assert.ok(called.save);
		},

		'test blocked properties are not included on instance': function () {
			var schema = {
					properties: {
						_blocked: {
							blocked: true
						}
					}
				},
				source = {
					id: 1,
					_blocked: 'secret'
				},
				store = {
					get: function () {
						return source;
					}
				},
				model = Model(store, schema),
				instance;

			instance = model.get(source.id);

			assert.ok(!('_blocked' in instance));
		},

		'test blocked properties cannot be saved': function () {
			var schema = {
					properties: {
						_blocked: {
							blocked: true
						}
					}
				},
				source = {
					id: 1,
					_blocked: 'secret'
				},
				model = Model(schema),
				instance;

			assert.throws(function () {
				instance = model.add(source);
			});
		},

		'test readonly properties are included on instance': function () {
			var schema = {
					properties: {
						noWrite: {
							readonly: true
						}
					}
				},
				source = {
					id: 1,
					noWrite: 'secret'
				},
				store = {
					get: function () {
						return source;
					}
				},
				model = Model(store, schema),
				instance;

			instance = model.get(source.id);

			assert.ok('noWrite' in instance);
		},

		'test readonly properties cannot be saved': function () {
			var schema = {
					properties: {
						noWrite: {
							readonly: true
						}
					}
				},
				source = {
					id: 1,
					noWrite: 'secret'
				},
				store = {
					put: function () {},
					get: function () {
						return source;
					}
				},
				model = Model(store, schema),
				instance;

			assert.throws(function () {
				instance = model.get(source.id);
				instance.noWrite = 'touched';
				instance.save();
			});
		}
	};
};

for(i in baseTests){
	exports[i] = baseTests[i];
}

var modelTests = exports.CreateTests(model);
for(var i in modelTests){
	exports[i] = modelTests[i];
}

if (require.main === module)
    require("patr/runner").run(exports);
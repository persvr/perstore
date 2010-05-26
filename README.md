Perstore is a cross-platform JavaScript object store interface for mapping persistent 
objects to various different storage mediums using W3C's object store API. Perstore
includes JavaScript object-relational mapping for SQL databases, JSON file storage,
and hopefully support for many other object/document style storage systems that
provide more direct object storage. Perstore provides model classes that wrap data
stores, and supports JSON Schema integrity enforcement, link management, and 
prototype construction. Perstore also provides faceted access to models for an
object-capability based security model.

Setup
=====

It is recommended that you install Perstore such that it is available in require statements
under the "perstore" path. This can easily be done with a package mapping compliant module
loader like [Nodules](http://github.com/kriszyp/nodules) by using a mapping in your 
package.json:

    "mappings": {
	  "perstore": "jar:http://github.com/kriszyp/perstore/zipball/master!/lib/"
    }

And you need a local.json file in your current working directory for your application that
defines any database settings such as connection information. There is a [template
for local.json](http://github.com/kriszyp/perstore/blob/master/template.local.json).
 
Model
=====

Typical usage of Perstore looks like:

    // first setup the object store, here we use SQL/ORM store
    var store = require("perstore/store/sql").SQLStore({
        type: "mysql",
        table: "my_table",
        idColumn: "id"
    });
    
    // now we can setup a model that wraps the data store
    var MyModel = require("perstore/model").Model("Example", store, {
    	properties: {
    		// we can define optionally define type constraints on properties
    		foo: String
    	},
    	prototype: {
    		// we can define functions on the prototype of the model objects as well
    		getFoo: function(){
    			return this.foo;
    		}
    	}
    });
    // now we can interact with the store and it's objects
    var someObject = MyModel.get(someId); // retrieve a persisted object
    someObject.getFoo(); // returns the current value of foo
    someObject.foo = "bar"; // make a change
    someObject.save(); // and save it
    
    MyModel.delete(someOtherId); // delete an object
    
    var MyFacet = require("facet").Restrictive(MyModel, {
    });

	MyFacet.delete(someId) -> will fail, as the facet has not allowed access to delete().
	
A model is defined with the Model constructor in the "MyModel" module. A Model definition
may follow the JSON schema definition for contractual constraints (usually defining property
type constraints in the "properties" property and relations with the "links" property). 
property. It may also contain a prototype property which defines the prototype object
for all instances of the model. Methods can be defined on the prototype object, as well
as directly on the model. REST methods such as get, put, and delete are implemented
directly on the model, and can be overriden for specific functionality. Perstore roughly 
follows the [class definition structure used by Persevere 1.0](http://docs.persvr.org/documentation/storage-model/json-schema)
    
Perstore provides easy to use object persistence mechanism. Persisted model object
instances have three default methods:

- save() - Saves any changes that have been made to an object to the data store.
- load() - If the object has not been fully loaded (sometime queries may return partial
object), the object will be fully loaded from the data store.
- get(property) - Gets the value of the given property. If the property is a link relation 
or reference, get() will resolve and load the target object. For simple properties,
object.get("prop") and object.prop will yield the same value.

In the initial example, object persistence is demonstrated with the "someObject"
variable. The object is loaded (via the get call to the model), modified, and saved
(with the save() call).

Facets provide secure, controlled access to models. The facet module comes provides
two facet constructors: Permissive and Restrictive. A Permissive facet allows all actions
on the model by default. Methods can be defined/overriden in the Permissive definition
to control or disable access to certain functionality. A Restrictive facet only allows read
access methods by default (get and query). One can define/override methods to allow
explicit access to other methods such as put or create. An example facet that only
allows read access and creation of new objects:

    var facet = require("facet").Restrictive(model, {
        create: function(object){ // allow create
            return model.create(object);
        }
    });

Models wrap data stores, which provide the low level interaction with the database or 
storage system. Perstore comes with several data stores including (in the store directory):

- sql - An SQL-based object store. This stores and retrieves objects as rows in 
databases. Currently this only fully implemented in Rhino, but the sql data store can easily
wrap an SQL database provider that simple provides an W3C SQL database style
executeSql(sql) function.
- memory - An in-memory data store. None of the data in this store will be persisted
- js-file - Reads and stores all data in the store from a JSON (with JS extensions for 
dates and other non-standard JSON types) file.
- remote - This can connect to a remote HTTP/REST based JSON server to store and 
retrieve data.

Perstore also includes several store wrappers that can be used to compose more 
sophisticate stores by adding functionality (also in the store directory):

- cache - Adds in-memory caching support to a provided store
- aggregate - Combines record data from multiple stores into a single object store
- replicated - Provides data replication across multiple stores
- full-text - Adds full text indexing (currently only available in Rhino through Lucene)
- inherited - Provides a super-sub type relationship between data stores

The following is store API for Perstore. The same API is used for data stores, store 
models, and facets. All of the functions are optional. If they do not exist, it indicates 
that the store or model does not support or allow the said functionality. All of the 
functions may return a promise instead of 
the actual return value if they require asynchronous processing to complete the 
operation. They are roughly listed in order of importance 
(get(id) is the most important function):

get(id) - Finds the persisted record with the given identifier from the store and returns 
an object representation (should always be a new object).

put(object, id) - Stores the given object in storage. The record may or may not 
already exist. The optional second parameter 
defines the primary identifier for storing the object. If the second parameter is omitted, the
key may be specified the primary identifier property. If that is not specified, the key may be
auto-generated. The primary identifer for the object should be returned

delete(id) - Deletes the record with the given identifier from the store.

query(queryString, options) - This executes a query against the data store. The 
queryString parameter defines the actual query, and the options parameter should be
an object that provides extra information. The following properties on the options
object may be included:

- start - The offset index to start at in the result set
- end - The offset index to end at in the result set
- parameters - An array of values for parameterized queries

The function should generally return an array representing the result set of the query 
(unless the query creates a single aggregate object or value). While there is no 
normative definition of the query language, the query method SHOULD support URL 
encoded queries like:

    foo=value&bar=2

More extensive query syntax can be based on the 
[discussions here](http://groups.google.com/group/json-query). Implementors are
encouraged to utilize the resource-query module in perstore for parsing queries into
a query AST-style structured object for ease of use. 

create(object) - Stores a new record. This acts similar to put, but should only be called
when the record does not already exist. Stores do not need to implement this 
method, but may implement for ease of differentiating between creation of new 
records and updates. This should return the identifier of the newly create record. 

subscribe(resource, callback) - Subscribes to changes in the given resource or set of 
resources. The callback is called whenever data is changed in the monitored resource(s).

transaction() - If it exists, this is called when a transaction is started. This should return
a transaction object with the following two functions:

- commit() - This is called when a transaction is committed.
- abort() - This is called when a transaction is aborted.

Perstore is designed to allow easy construction of new data stores. A data store 
in Perstore is a JavaScript object with any or all of the functions defined above.

Querying
========

Perstore provides a query parsing and execution library called resource-query, which is
based on resource query language (RQL). RQL can be thought as basically a set of
nestable named operators which each have a set of arguments. RQL is designed to
have an extremely simple, but extensible grammar that can be written in a URL friendly query string. A simple RQL
query with a single operator that indicates a search for any resources with a property of
"foo" that has value of 3 could be written:

    eq(foo,3)

RQL is a compatible superset of standard HTML form URL encoding. The following query
is identical to the query (it is sugar for the query above):

    foo=3

We can use this query format to query stores and models. For example:

    MyModel.query("foo=3").forEach(function(object){
       // for each object with a property of foo equal to 3
    });

We can also construct queries using chained operator calls in JavaScript. We could
write this query:

    MyModel.query().eq("foo",3).forEach(...);

The RQL grammar is based around standard URI delimiters. The standard rules for 
encoding strings with URL encoding (%xx) are observed. RQL also supersets FIQL. 
Therefore we can write a query that finds resources with a "price" property below
10 with a "lt" operator using FIQL syntax:

    price=lt=10

Which is identical (and sugar for call operator syntax known as the normalized form):

    lt(price,10)

One can combine conditions with multiple operators with "&":

    foo=3&price=lt=10

Is the same as:

    eq(foo,3)&lt(price,10)

Which is also the same as:

    and(eq(foo,3),lt(price,10))

And thus can be used to query a store:

	MyModel.query("foo=3&price=lt=10")...

Or using chained JS calls to perform the same query:

    MyModel.query().eq("foo",3).lt("price",10)...

The | operator can be used to indicate an "or" operation. We can also use paranthesis
to group expressions. For example:

    (foo=3|foo=bar)&price=lt=10
    
Which is the same as:

    and(or(eq(foo,3),eq(foo,bar)),lt(price,10))

And to query a model/store:

    MyModel.query("(foo=3|foo=bar)&price=lt=10")...
    
And using chained JS calls: 

	var query = MyModel.query();
	query.or(query.eq("foo",3),query.eq("foo","bar")).lt("price",10)...

Sometimes it makes sense to use the with statement (despite the fact that some 
think it should never be used). This actually makes the syntax look very similar
to the query string format. For example:

	with(MyModel.query()){
		or(eq("foo",3),eq("foo","bar")).lt("price",10)...
	}

Values in queries can be strings (using URL encoding), numbers, booleans, null, undefined,
and dates (in ISO UTC format without colon encoding). We can also denote arrays
with paranthesis enclosed, comma separated values. For example to find the objects
where foo can be the number 3, the string bar, the boolean true, or the date for the
first day of the century we could write an array with the "in" operator:

    foo=in=(3,bar,true,2000-01-01T00:00:00Z)

We can also explicitly specify primitive types in queries. To explicitly specify a string "3",
we can do:

    foo=string:3

Any property can be nested by using a dot syntax. To search by the bar property of
the object in the foo property we can do:

    foo.bar=3
    
Another common operator is sort. We can use the sort operator to sort by a specified property.
To sort by foo in ascending order:
	
	price=lt=10&sort(+foo)

We can also do multiple property sorts. To sort by price in ascending order and rating in descending order:

    sort(+price,-rating)

The aggregate function can be used for aggregation. To calculate the sum of sales for
each department:

    aggregate(departmentId,sum(sales))
        
Here is a definition of the common operators (individual stores may have support
for more less operators):

* sort(&lt;+|->&lt;property) - Sorts by the given property in order specified by the prefix (+ for ascending, - for descending)  
* select(&lt;property>) - Returns an array of the given property value for each object
* select(&lt;property>,&lt;property>,...) - Trims each object down to the set of properties defined in the arguments
* aggregate(&lt;property|function>,...) - Aggregates the array, grouping by objects that are distinct for the provided properties, and then reduces the remaining other property values using the provided functions
* distinct() - Returns a result set with duplicates removed 
* in(&lt;property>,&lt;array-of-values>) - Filters for objects where the specified property's value is in the provided array
* contains(&lt;property>,&lt;value | array-of-values>) - Filters for objects where the specified property's value is an array and the array contains the provided value or contains a value in the provided array
* slice(start,end) - Returns the given range of objects from the result set
* and(&lt;query>,&lt;query>,...) - Applies all the given queries
* or(&lt;query>,&lt;query>,...) - The union of the given queries
* eq(&lt;property>,&lt;value>) - Filters for objects where the specified property's value is equal to the provided value
* lt(&lt;property>,&lt;value>) - Filters for objects where the specified property's value is less than the provided value
* le(&lt;property>,&lt;value>) - Filters for objects where the specified property's value is less than or equal to the provided value
* gt(&lt;property>,&lt;value>) - Filters for objects where the specified property's value is greater than the provided value
* ge(&lt;property>,&lt;value>) - Filters for objects where the specified property's value is greater than or equal to the provided value
* ne(&lt;property>,&lt;value>) - Filters for objects where the specified property's value is not equal to the provided value
* sum(&lt;property?>) - Finds the sum of every value in the array or if the property argument is provided, returns the sum of the value of property for every object in the array 
* mean(&lt;property?>) - Finds the mean of every value in the array or if the property argument is provided, returns the mean of the value of property for every object in the array 
* max(&lt;property?>) - Finds the maximum of every value in the array or if the property argument is provided, returns the maximum of the value of property for every object in the array 
* min(&lt;property?>) - Finds the minimum of every value in the array or if the property argument is provided, returns the minimum of the value of property for every object in the array 
* recurse(&lt;property?>) - Recursively searches, looking in children of the object as objects in arrays in the given property value


If you are writing a store, or want to introspect queries, you can use the parsed query data 
structures. You can parse string queries with resource-query module's parseQuery function.
Query objects have a "name" property and an "args" with an array of the arguments.
For example:

	require("perstore/resource-query").parseQuery("(foo=3|foo=bar)&price=lt=10") ->
	{
		name: "and",
		args: [
			{
				name:"or",
				args:[
					{
						name:"eq",
						args:["foo",3]
					},
					{
						name:"eq",
						args:["foo","bar"]
					}
				]
			},
			{
				name:"or",
				args:["price",10]
			}
		]
	}
				
Licensing
--------

Perstore is part of the Persevere project, and therefore is licensed under the
AFL or BSD license. The Persevere project is administered under the Dojo foundation,
and all contributions require a Dojo CLA.

Project Links
------------

See the main Persevere project for more information:

### Homepage:

* [http://persvr.org/](http://persvr.org/)

### Source & Download:

* [http://github.com/kriszyp/perstore/](http://github.com/kriszyp/perstore)

### Mailing list:

* [http://groups.google.com/group/persevere-framework](http://groups.google.com/group/persevere-framework)

### IRC:

* [\#persevere on irc.freenode.net](http://webchat.freenode.net/?channels=persevere)

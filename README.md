Perstore is a cross-platform JavaScript object store interface for mapping persistent 
objects to various different storage mediums using an interface based on
W3C's [IndexedDB object store API](http://www.w3.org/TR/IndexedDB/#object-store-sync)
and analogous to the HTTP REST interface. Perstore
includes JavaScript object-relational mapping for SQL databases, JSON file storage,
and hopefully support for many other object/document style storage systems that
provide more direct object storage. Perstore provides model classes that wrap data
stores, and supports JSON Schema integrity enforcement, link management, and 
prototype construction. Perstore also provides faceted access to models for an
object-capability based security model.

Setup
=====

Perstore can be installed with NPM via:

	npm install perstore

However, one of the easiest way to get started with Perstore is to start with the 
[Persevere example app](http://github.com/persvr/persevere-example-wiki),
which can be installed with:

	npm install persevere-example-wiki

Perstore can be installed in RingoJS likewise:

	ringo-admin install persvr/perstore

See the [Persevere installation instructions for more information](http://persvr.org/Page/Installation).

Perstore also requires a local.json file to be present in the current working directory.
An example of this file can be found [here](https://github.com/persvr/persevere-example-wiki/blob/master/local.json).

Model
=====

Perstore provides the tools for building data models. With Perstore we can create data
stores that connect to different database backends. We can then build on the basic
stores with data model and facets that provide application logic, data constraints,
access definitions, data change responses, and queries. Typical usage of Perstore looks like:

    // first setup the object store, here we use SQL/ORM store
    var store = require("perstore/store/sql").SQLStore({
        type: "mysql",
        table: "my_table",
        idColumn: "id"
    });
    
    // now we can setup a model that wraps the data store
    var MyModel = require("perstore/model")(store, {
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
property. It may also contain a "prototype" property which defines the prototype object
for all instances of the model. Methods can be defined on the prototype object, as well
as directly on the model. REST methods such as get, put, and delete are implemented
directly on the model, and can be overridden for specific functionality.
    
Perstore provides easy to use object persistence mechanism. Persisted model object
instances have two default methods and a property:

- save() - Saves any changes that have been made to an object to the data store.
- load() - If the object has not been fully loaded (sometime queries may return partial
object), the object will be fully loaded from the data store.
- schema - This is a reference to the schema for this object. Schema objects are augmented
(if it does not previously exist) with a getId method that can be used to retrieve the identity 
of an object:

    object.schema.getId(object) -> identity of object


In the initial example, object persistence is demonstrated with the "someObject"
variable. The object is loaded (via the get call to the model), modified, and saved
(with the save() call).

Facets provide secure, controlled access to models. The facet module comes provides
two facet constructors: Permissive and Restrictive. A Permissive facet allows all actions
on the model by default. Methods can be defined/overridden in the Permissive definition
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
storage system. Perstore comes with several data stores including (in the perstore/store directory)
mongodb, redis, sql, memory, file, and HTTP/remote storage. Perstore also includes 
several store wrappers that can be used to compose more 
sophisticated stores by adding functionality (also in the store directory), including cache,
aggregate, replicated, and inherited. The store implementations and store wrappers
are described in more detail in the modules section below.

The following is store API for Perstore. The same API is used for data stores, store 
models, and facets. All of the functions are optional. If they do not exist, it indicates 
that the store or model does not support or allow the said functionality. All of the 
functions may return a promise instead of 
the actual return value if they require asynchronous processing to complete the 
operation. They are roughly listed in order of importance:

* get(id, directives) - Finds the persisted record with the given identifier from the store and returns 
an object representation (should always be a new object).

* put(object, directives) - Stores the given object in storage. The record may or may not 
already exist. The optional second parameter 
defines the primary identifier for storing the object. If the second parameter is omitted, the
key may be specified the primary identifier property. If that is not specified, the key may be
auto-generated. The primary identifer for the object should be returned

* delete(id, directives) - Deletes the record with the given identifier from the store.

* query(queryString, directives) - This executes a query against the data store. The 
queryString parameter defines the actual query, and the options parameter should be
an object that provides extra information. The following properties on the directives
object may be included:

- start - The offset index to start at in the result set
- end - The offset index to end at in the result set
- parameters - An array of values for parameterized queries

The function should generally return an array representing the result set of the query 
(unless the query creates a single aggregate object or value). Perstore is designed to leverage [http://github.com/persvr/rql](resource query language)
for querying, and included stores use RQL (although they may not implement every
feature in RQL), although stores can utilize alternate query languages. 

* add(object, directives) - Stores a new record. This acts similar to put, but should only be called
when the record does not already exist. Stores do not need to implement this 
method, but may implement for ease of differentiating between creation of new 
records and updates. This should return the identifier of the newly create record. If an
object already exists with the given identity, this should throw an error. 

* construct(object, directives) - This constructs a new persistable object. This does not
actually store the object, but returns an object with a save() method that
can be called to store the object when it is ready. This method does not apply to stores,
only models and facets.

* subscribe(resource, callback) - Subscribes to changes in the given resource or set of 
resources. The callback is called whenever data is changed in the monitored resource(s).

* transaction() - Starts a new transaction for the store. This should return
a transaction object with the following functions. Each of these functions are optional
and only called if they exist:

- commit() - This is called when a transaction is committed.
- requestCommit() - This is called on all the databases/stores prior to committing the
transaction. If this succeeds (doesn't throw an error), the store should guarantee the
success of a subsequent commit() operation. This provides two phase commit 
semantics. 
- abort() - This is called when a transaction is aborted.
- suspend() - This is called when a transaction is suspended. This happens when an 
event is finished, but a promise for the continuance of the action is still in progress. 
After being suspended, this transaction is no longer the active transaction.
- resume() - This is called when a transaction is resumed. This happens when a promise
resumes the execution of an action.

(See Transactions section below for more information)

Perstore is designed to allow easy construction of new data stores. A data store 
in Perstore is a JavaScript object with any or all of the functions defined above.

Querying
========

Perstore provides a query parsing and execution through [http://github.com/persvr/rql](resource query language) 
(RQL). RQL can be thought as basically a set of
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

For a more a complete reference guide to the RQL and the available query operators,
see [[http://github.com/persvr/rql]]. This also provides information on
the parsed query data structure which is important if you want to implement your
own custom stores.

# Modules

This section covers the modules that are included with Perstore.

## transaction

    require("perstore/transaction").transaction(doTransaction);

Transactions provide a means for committing multiple changes to a database 
atomically. The store API includes transaction semantics for communicating transactions
to the underlying databases. Perstore provides transactional management for delegating
transaction operations to the appropriate stores and databases. To start a transaction,
call the transaction function on the stores module with a callback that will perform any
of the actions of the transaction:

    require("perstore/transaction").transaction(function(){
    	Model.put(...);
    	Model.delete(...);
    });
 
The callback function may return a promise if the transaction will involve actions that
extend beyond the duration of the function call. When the promise is resolved the 
transaction will be committed (or if the promise errors out, the transaction will be 
aborted).

Perstore includes a JSGI middleware component for wrapping requests in transactions.
This will make the life of the request be one transaction, committed when the response
is ready to send (or aborted for an error).

    transactionApp = require("perstore/jsgi/transactional").Transactional(nextApp);

### Implementing Transactions

If you are writing your store that needs to be transaction aware, there are two 
different options for implementing transaction handling. The simplest approach is to
implement the implement the transaction method on your store and then use the
AutoTransaction store wrapper provided by the "stores" module:

    var AutoTransaction = require("perstore/transaction").AutoTransaction;
    myTransactionalStore = AutoTransaction({
        transaction: function(){
            // prepare the transaction
            return {
                commit: function{
                   // commit the transaction
                },
                // implement the rest of the handlers
                abort:...
            }
        }
    });

The AutoTransaction wrappers provides two important functions. First, if any of your
store methods are called outside of a global transaction, a transaction will automatically
be started before calling the method and committed afterwards. Second, if a global
transaction is in process, the transaction method will be called on the first access of
this store and be committed when the global transaction is committed.

The other approach to transaction handling is to provide a "database" object. This can
be useful for situations where transaction management needs to exist outside of 
individual stores (and may cross stores). One can implement a "database" object that
provides the transaction method with the same API as the store's transaction method.
The database object can be registered with:

    require("perstore/transaction").registerDatabase(transaction: function(){
        // prepare the transaction
        return {...}
    });
    
This transaction method will be called whenever a global transaction is started.

## model

	var Model = require("perstore/model");
	Model(name, store, schema);

This module provides facitilities for creating data models. The most common function
to use is the module's return value, the Model constructor. This takes a store and
a schema. The store is the underlying source of the persisted data for the model,
and the schema can be used to define data constraints, the prototype, and relations.

The schema object follows the [JSON Schema specification](http://json-schema.org),
permitting property definition objects to constrain different properties on the data model.
For example:

	Model(store, {
		properties: {
			// we can use the explicit JSON Schema definition object, or the String constructor as a shortcut
			name: {type: "string"}, 
			age: {
				type:"number",
				minimum: 0,
				maximum: 125
			}
		}
	});

Data models also follow the store API. The schema object can overwrite the default 
implementation of the store methods to provide specific functionality. For example,
we could provide our own implementation of the put() method:

	Model(store, {
		put: function(object, directives){
			// our code, implement any logic in here
			
			// we can now call the store object to store the data 
			return store.put(object, directives);
		},
		...

The schema object can also include a prototype object. The prototype will be the 
the base for all instances to inherit methods (and properties) from. 
 
## facet

	restrictedFacet = require("perstore/facet").Restrictive(model, schema);
	restrictedFacet = require("perstore/facet").Permissive(model, schema);
	
Facets are type of model that wraps an existing model and adds additional constraints
and/or functionality. Facets allow you to derive different entry points to data models
with different levels of access and capabilities. Facets can be used with the security
model to vary access level by user or other entry variables.

The Restrictive facet restricts the model to a readonly data model by default. One
can override methods to create more specific levels of access. For example, here
we could define a facet that is readonly except when the object's status is currently in
draft:

    var facet = require("facet").Restrictive(model, {
        put: function(object){ // allow create
        	if(model.get(object.id).status == "draft"){
            	return model.put(object);
            }
        }
    });

The Permissive facet provides all the capabilities of the underlying data model by default.
One can then override methods to restrict access, or add JSON Schema constraints
to constrain the ways that data can be changed through this facet.
	
## errors

	throw require("perstore/errors").AccessError(reason);
	throw require("perstore/errors").MethodNotAllowedError(reason);
	throw require("perstore/errors").DatabaseError(reason);
	throw require("perstore/errors").PreconditionFailed(reason);

This module provides a set of error constructors for throwing data errors. These 
can be used in conjunction with Pintura's error handling middleware to propagate
errors with known HTTP status codes.

## stores

	store = require("perstore/stores").DefaultStore(options);

This creates a store using the default store for Perstore, which is a Replicated Persistent (perstore/store/memory)
store. This is the quickest way to create a new store, particularly if you getting a prototype
up and running.

## store (folder)

The modules in the store folder provide store implementations and store wrappers.
These provide access to various data sources and add functionality to these stores.

## path

This module provides functionality for resolving path references within data objects. The
module exports a <code>resolver</code> function, that returns a <code>resolve</code>
that can be used to resolve references in objects. To get a <code>resolve</code>
function, call resolver with the a data model (and optionally second argument, a getDataModel function
that can provide access to the other data models):

	var resolve = require("perstore/path").resolver(myModel);

And then we can use the <code>resolve</code> to resolve a path. If we want to 
resolve the "foo" property of the object with an id of 11, we could write:

	resolve("11/foo");

And if foo's property value was a reference to another object, this would also be automatically resolved.

### mongodb

	store = require("perstore/store/mongodb").MongoDB({
		collection: collection
	});

This is an object store that uses a MongoDB database for storage. MongoDB provides
a powerful backend for Perstore because it is specifically designed for JSON-style
object storage. This store has good querying capabilites, supporting a large set of 
the RQL operators. This store requires installation
of the mongodb package (npm install mongodb).

The MongoDB store looks to the local.json for configuration information, using either the
database.url property or the database.host, database.name, and database.port properties.
For example, our local.json could configuration the database:

	"database": {
		"host": "localhost",
		"name": "wiki",
	},

(we omitted the port, which defaults to 27017)

We also must indicate which collection to use for the store. This is provided in the options
parameter to the constructor.

This store is only available for NodeJS.

### sql

	store = require("perstore/store/mongodb").SQLStore({
		table: table,
		idColumn: idColumn
	});


This is store connects to an SQL backend and maps SQL rows to objects. RQL queries 
are converted to SQL, and a large set of the RQL queries are supported. On Node.js, this store requires installation
of the mysql-native package (npm install mysql-native).

The SQLStore looks to the local.json for configuration information. In Node, it uses the 
database.type, database.host, database.port, database.name, database.username, and database.password
properties to connect to the database. For example, our local.json could configuration the database:

	"database": {
		"type": "mysql",
		"host": "localhost",
		"username": "root",
		"password": "password",
		"name": "wiki",
	},

The type parameter indicates which SQL vendor dialect to use. Supported options are 
"mysql", "sqlite", "derby", "hsqldb", "oracle", "postgres", "mssql". 

In Rhino, the "connection" property is used to configure the database, using a JDBC
connection string, and a driver property can be used to explicitly identifier the database
driver class to use (it will be determined from the type parameter otherwise).
   
We also must indicate which table and which column is the primary key to use for the store. This is provided in the options
parameter to the constructor. The configuration parameter to the store can also
override the configuration information in local.json.

### memory

This module provides an in-memory data store. This actually exports three different
store constructors for different storage capabilities:

	store = require("perstore/store/memory").Memory(options);

The Memory store keeps all data in memory (no persistence to disk). The options parameter
can include an optional "log" property indicating whether or not to keep a log of data revisions.
The "log" parameter defaults to true. 

The options parameter may also include an optional "index" property that is a 
hash of the all the objects to initialize the store with, where the property names are the
ids and the property values are the objects in the store.

	store = require("perstore/store/memory").ReadOnly(options);

The ReadOnly store is equivalent to the Memory constructor except it generates a readonly store, and
does not have any add, put, or delete methods.

	store = require("perstore/store/memory").Persistent(options);

The Persistent store is equivalent to the Memory constructor except it will persist
the data to a file. The data is persisted to a file in extended JSON format. The options
parameter for the store supports an optional "file" parameter or "path" parameter to
specify the filename of the target file for persisting data, or the directory path to store
files.

The Persistent store is the default store for Perstore.

### redis

	store = require("perstore/store/redis").Redis({
		collection: collection
	});

This is object store that uses a Redis database for storage. This requires the installation
of the redis package.

### remote

	store = require("perstore/store/remote").Remote(request, url);

This can connect to a remote HTTP/REST based JSON server to store and 
retrieve data. The optional request parameter is the function that will perform the 
remote requests, and defaults to an HTTP requester if no value is provided. The
url specifies the URL of target server.


Perstore also includes several store wrappers that can be used to compose more 
sophisticated stores by adding functionality (also in the store directory), including cache,
aggregate, replicated, and inherited. The store implementations and store wrappers
are described in more detail in the modules section below.

### cache

	store = require("perstore/store/cache").Cache(masterStore, cacheStore, options);

This module adds caching support to a provided store. The main store is the first
parameter, and data retrieved from that store is cached in the provided cacheStore.
Typically the cacheStore would be an in-memory store, to provide quick access to
frequently accessed data. The options parameter provides several configuration options:

* defaultExpiresTime - Default amount of time before an object in the cache expires in milliseconds, defaults to 2000.
* cleanupInterval - Amount of time before cleaning up expired objects in the cache, in milliseconds, defaults to 1000.
* cacheWrites - Determines whether or not to cache writes to the caching store (all writes go to the master store), defaults to true.

### aggregate

	store = require("perstore/store/aggregate").Aggregate(stores, properties);

This store combines record data from multiple stores into a single object store. The
stores argument should be an array of stores. When an object is requested, the request
is made to each of the stores, and the returned objects are mixed together. When 
a write is performed, the object can then be split up into the properties that are handled
by each of the underlying stores. The properties argument specifies the properties
for each store. The properties argument should be an array (where each entry defines the 
properties for the store with the corresponding index) of arrays of strings with the names
of the properties for each store.

### notifying

	notifyingStore = require("perstore/store/notifying").Notifying(sourceStore);

This store wrapper adds notification support to stores, allowing store consumers to
listen for data changes. We can listen for data changes by making a subscription and
adding a listener:

	var subscription = notifyingStore.subscribe("*");
	subscription.observe(listener);
	
And you could later unsubscribe:

	subscription.unsubscribe();

or you can subscribe to a specific object by its id:

	var subscription = notifyingStore.subscribe(id);
	subscription.observe(listener);


### replicated

	store = require("perstore/store/replicated").Replicated(sourceStore);

This store wrapper provides data replication across different processes. This is needed for memory
stores in a multi-process applications where all processes need to be synchronized
access to data that is stored in separate memory spaces for each process.

### inherited

	superStore = require("perstore/store/inherited").Inherited(sourceStore);
	subStore = require("perstore/store/inherited").Inherited(sourceStore);

Inherited provides a super-sub type relationship between data stores. The Inherited constructor
adds support for distinguishing different types in storage. The hierarchical relationships
must be defined at the model level with the schema "extends" property. 

## util (folder)

The util folder includes various utility modules used by Perstore.

### json-ext

	jsonString = require("perstore/util/json-ext").stringify(object);
	object = require("perstore/util/json-ext").parse(jsonString);

This provides support for JavaScript based object literals that extend basic JSON. This module
can serialize and parse JSON-style object literals with constructs including NaN, Infinity, 
undefined, and primitive function constructors (String, Number, etc.)

### settings

	mySetting = require("perstore/util/settings").mySetting;
	
This module parses the JSON in the local.json file found in the current working directory
and puts all the properties on the module's export.

### extend-error

This module provides an easy tool to create custom error constructors. To create a custom
error, provide an argument with the error type you want to extend from (Error or another more specific
error constructor), and then give it an error name. For example:

	CustomTypeError = require("perstore/util/extend-error")(TypeError, "CustomTypeError");


## jsgi

### transactional

    transactionApp = require("perstore/jsgi/transactional").Transactional(nextApp);

This module is a JSGI middleware module providing transaction wrapping around
a request/response cycle. See the Transaction section above for more information.

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

* [http://github.com/persvr/perstore/](http://github.com/persvr/perstore)

### Mailing list:

* [http://groups.google.com/group/persevere-framework](http://groups.google.com/group/persevere-framework)

### IRC:

* [\#persevere on irc.freenode.net](http://webchat.freenode.net/?channels=persevere)

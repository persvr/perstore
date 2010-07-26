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

get(id, directives) - Finds the persisted record with the given identifier from the store and returns 
an object representation (should always be a new object).

put(object, directives) - Stores the given object in storage. The record may or may not 
already exist. The optional second parameter 
defines the primary identifier for storing the object. If the second parameter is omitted, the
key may be specified the primary identifier property. If that is not specified, the key may be
auto-generated. The primary identifer for the object should be returned

delete(id, directives) - Deletes the record with the given identifier from the store.

query(queryString, directives) - This executes a query against the data store. The 
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

add(object, directives) - Stores a new record. This acts similar to put, but should only be called
when the record does not already exist. Stores do not need to implement this 
method, but may implement for ease of differentiating between creation of new 
records and updates. This should return the identifier of the newly create record. 

construct(object, directives) - This constructs a new persistable object. This does not
actually store the object, but returns an object with a save() method that
can be called to store the object when it is ready. This method does not apply to stores,
only models and facets.

subscribe(resource, callback) - Subscribes to changes in the given resource or set of 
resources. The callback is called whenever data is changed in the monitored resource(s).

transaction() - Starts a new transaction for the store. This should return
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

Perstore provides a query parsing and execution through [http://github.com/kriszyp/rql](resource query language) 
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
see [[http://github.com/kriszyp/rql]]. This also provides information on
the parsed query data structure which is important if you want to implement your
own custom stores.

Transactions
==========

Transactions provide a means for committing multiple changes to a database 
satomically. The store API includes transaction semantics for communicating transactions
to the underlying databases. Perstore provides transactional management for delegating
transaction operations to the appropriate stores and databases. To start a transaction,
call the transaction function on the stores module with a callback that will perform any
of the actions of the transaction:

    require("perstore/stores").transaction(function(){
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

Implementing Transactions
------------------------

If you are writing your store that needs to be transaction aware, there are two 
different options for implementing transaction handling. The simplest approach is to
implement the implement the transaction method on your store and then use the
AutoTransaction store wrapper provided by the "stores" module:

    var AutoTransaction = require("perstore/stores").AutoTransaction;
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

    require("perstore/stores").registerDatabase(transaction: function(){
        // prepare the transaction
        return {...}
    });
    
This transaction method will be called whenever a global transaction is started.
 
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

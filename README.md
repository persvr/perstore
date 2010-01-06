Perstore is a cross-platform JavaScript object store interface for mapping persistent 
objects to various different storage mediums using W3C's object store API. Perstore
includes JavaScript object-relational mapping for SQL databases, JSON file storage,
and hopefully support for many other object/document style storage systems that
provide more direct object storage. Perstore provides model classes that wrap data
stores, and supports JSON Schema integrity enforcement, link management, and 
prototype construction. Perstore also provides faceted access to models for an
object-capability based security model.

Typical usage of Perstore looks like:

    // first setup the object store, here we use SQL/ORM store
    var store = require("sql").SQLStore({
        type: "mysql",
        table: "my_table",
        idColumn: "id"
    });
    
    // now we can setup a model that wraps the data store
    var model = require("model").Model("Example", store, {
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
    var someObject = model.get(someId); // retrieve a persisted object
    someObject.getFoo(); // returns the current value of foo
    someObject.foo = "bar"; // make a change
    someObject.save(); // and save it
    
    store.delete(someOtherId); // delete an object

Perstore comes with several data stores including:
* sql - An SQL-based object store. This stores and retrieves objects as rows in 
databases. Currently this only fully implemented in Rhino, but the sql data store can easily
wrap an SQL database provider that simple provides an W3C SQL database style
executeSql(sql) function.
* memory - An in-memory data store. None of the data in this store will be persisted
* js-file - Reads and stores all data in the store from a JSON (with JS extensions for 
dates and other non-standard JSON types) file.
* remote - This can connect to a remote HTTP/REST based JSON server to store and 
retrieve data.

Perstore also includes several store wrappers that can be used to compose more 
sophisticate stores by adding functionality:
* cache - Adds in-memory caching support to a provided store
* aggregate - Combines record data from multiple stores into a single object store
* replicated - Provides data replication across multiple stores
* full-text - Adds full text indexing (currently only available in Rhino through Lucene)
* inherited - Provides a super-sub type relationship between data stores

Perstore is also designed to allow easy construction of new data stores. A data store 
in Perstore is a JavaScript object with any or all of the following functions. 
All of the functions are optional. If they do not exist, it indicates that the store does
not support the said functionality. They are roughly listed in order of importantance 
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
* start - The offset index to start at in the result set
* end - The offset index to end at in the result set
* parameters - An array of values for parameterized queries

The function should generally return an array representing the result set of the query 
(unless the query creates a single aggregate object or value). While there is no 
normative definition of the query language, the query method SHOULD support URL 
encoded queries like:

    foo=value&bar=2

More extensive query syntax can be based on the [discussions here](http://groups.google.com/group/json-query). 

create(object) - Stores a new record. This acts similar to put, but should only be called
when the record does not already exist. Stores do not need to implement this 
method, but may implement for ease of differentiating between creation of new 
records and updates. 

startTransaction() - If it exists, this is called when a transaction is started.

commitTransaction() - If it exists, this is called when a transaction is committed.

abortTransaction() - If it exists, this is called when a transaction is aborted.
    
Perstore is part of the Persevere project, and therefore is licensed under the
AFL or BSD license. The Persevere project is administered under the Dojo foundation,
and all contributions require a Dojo CLA.

See the main Persevere site for more information:
http://www.persvr.org/

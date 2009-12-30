Perstore is a cross-platform JavaScript object store interface for mapping persistent 
objects to various different storage mediums using W3C's object store API. Perstore
includes JavaScript object-relational mapping for SQL databases, JSON file storage,
and hopefully support for many other object/document style storage systems that
provide more direct object storage.

Typical usage of Perstore looks like:

    // first setup the object store, here we use SQL/ORM store
    var store = require("sql").SQLStore({
        type: "mysql",
        table: "my_table",
        idColumn: "id"
    });
    
    // now we can interact with the store and it's objects
    var someObject = store.get(someId); // retrieve a persisted object
    someObject.foo = "bar"; // make a change
    someObject.save(); // and save it
    
    store.delete(someOtherId); // delete an object
    
Perstore is part of the Persevere project, and therefore is licensed under the
AFL or BSD license. The Persevere project is administered under the Dojo foundation,
and all contributions require a Dojo CLA.

See the main Persevere site for more information:
http://www.persvr.org/

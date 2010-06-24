/**
* A persistent in-memory store inspired by node-dirty.
*/

var JSONExt = require("commonjs-utils/json-ext"),
    //AutoTransaction = require("stores").AutoTransaction,
    fs = require("commonjs-utils/fs-promise");

exports.PersistentMemory = function(filename) {
    if (!filename) throw new Error("No path for store provided");
    
    // set up a memory store and populate with line-separated json
    var store = Memory = require("./memory").Memory(),
        readBuffer = "";
    
    try {
        readBuffer = fs.read(filename);
    }
    catch (e) {
    }
    
    var offset, chunk, doc;
    while ((offset = readBuffer.indexOf("\n")) > -1) {
        chunk = readBuffer.substr(0, offset);
        readBuffer = readBuffer.substr(offset + 1);
        
        try {
            doc = JSONExt.parse(chunk);
        } catch (e) {
            continue;
        }
        
        if (doc.__deleted__ === true) {
            store["delete"](doc.id);
        } else {
            store.put(doc);
        }
    }
    
    var writeStream;
    try {
        // first try for node's fs module
        writeStream = require("fs").createWriteStream(filename, {flags: "a"});
    } catch (e) {
        // fall back on narwhal's file module
        writeStream = require("file").open(filename, "a");
    }
    
    // start with memory store and wrap put and delete functions
    var oldPut = store.put;
    store.put = function(object){
        oldPut.apply(this, arguments);
        writeStream.write(JSONExt.stringify(object) + "\n");
        // FIXME narwhal needs a flush -- we ought to abstract this away
        if (writeStream.flush) writeStream.flush();
        return object;
    };
    
    var oldDelete = store["delete"];
    store["delete"] = function(id){
        oldDelete.apply(store, arguments);
        writeStream.write('{id:"' + id + '",__deleted__:true}\n');
        if (writeStream.flush) writeStream.flush()
        return {};
    };
    
    // FIXME learn how to use transactions!
    /*store.transaction = function() {
        return {
            commit: function() {
                if (transactionQueue.length) {
                    outputStream.write(transactionQueue.join("\n") + "\n");
                    transactionQueue.length = 0;
                }
            },
            abort: function() {
                transactionQueue.length = 0;
            }
        };
    };*/
    
    return store;//AutoTransaction(store);
};

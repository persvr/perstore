/*
* CouchDB store
*/
 
var request = require("jsgi-client").request,
    when = require("promised-io/promise").when,
    error = require("jsgi/error");
 
 
var decode = exports.decode = function(source) {
    var object = JSON.parse(source); // use JSONExt?
    object.id = object._id; // TODO use jsonschema's "self"
    delete object._id;
    delete object._rev;
    // TODO translate other _ properties?
    return object;
};
    
var encode = exports.encode = function(object) {
    if (object.id) {
        object._id = object.id;
        delete object.id;
    }
    return JSON.stringify(object);
};
 
 
exports.Server = function(config) {
    var server = {};
    server.url = config.url;
    server.getConfig = function() {
        return when(
            request({
                method: "GET",
                uri: url + "_config"
            }),
            function(response) {
                error.handle(response);
                return JSON.parse(response.body.join(""));
            }
        );
    };
    return server;
};
 
// TODO get from settings
var defaultServer = exports.Server({uri: "http://127.0.0.1:5984/"});
 
exports.Database = function(name, config) {
    config = config || {}
    var db = {};
    db.server = config.server || defaultServer;
    db.url = db.server.url + name + "/";
    
    db.get = function(id) {
        return when(
            request({
                method: "GET",
                uri: db.url + id
            }),
            function(response) {
                error.handle(response);
                return decode(response.body.join(""));
            }
        );
    };
    /* TODO
db.query = function(query, options) {
var headers = {};
if(options.start || options.end){
headers.range = "items=" + options.start + '-' + options.end;
}
return when(
request({
method: "GET",
queryString: query,
headers: headers
}),
function(response){
return decode(response.body.join(""))
}
);
};
*/
    db.put = function(object, id) {
        var etag = object.getMetadata().etag;
        if (etag) object._rev = etag;
        return when(
            request({
                method: "PUT",
                uri: db.url + id,
                body: encode(object)
            }),
            function(response) {
                if (response.status != 201) throw new Error("PUT failed");
                return decode(response.body.join(""));
            }
        );
    };
    
    db.post = function(object) {
        return when(
            request({
                method: "POST",
                uri: db.url,
                body: encode(object)
            }),
            function(response) {
                if (response.status != 201) throw new Error("POST failed");
                return decode(response.body.join(""));
            }
        );
    };
    
    db["delete"] = function(object) {
        return when(
            request({
                method: "DELETE",
                uri: db.url + id,
                headers: {"if-match": object.getMetadata()["if-match"]}
            }),
            function(response) {
                // TODO try to get error messages from json response
                if (response.status != 200) throw new Error("DELETE failed");
                var info = JSON.parse(response.body.join(""));
                return {
                    getMetadata: function() {
                        return {etag: info.rev};
                    }
                }
            }
        );
    };
    
    /*
* CouchDB-specific API extensions
*/
    
    db.copy = function(object) {
        var convertDestination = function(destination) {
            /* Convert parameterized Destination header into Couch ?rev= form
* source: some_other_doc; etag=rev_id
* target: some_other_doc?rev=rev_id
*/
            var parsed = destination.split(";");
            if (parsed.length > 1) {
                if (parsed[1].trim().toLowerCase().indexOf("etag=") === 0) {
                    parsed[1] = "?rev=" + parsed[1].trim().substring(5);
                    destination = parsed[0] + parsed.slice(1).join(";");
                }
            }
            return destination;
        };
        var headers = object.getMetadata();
        headers.destination = convertDestination(headers.destination);
        return when(
            request({
                method: "COPY",
                uri: db.url + id,
                headers: headers
            }),
            function(response) {
                if (response.status != 201) throw new Error("COPY failed");
                return {
                    getMetadata: function() {
                        return {etag: response.headers.etag};
                    }
                }
            }
        );
    }
    
    db.getDesigns = function() {
        return when(
            request({
                method: "GET",
                uri: db.url + "_all_docs?_all_docs?startkey=%22_design%2F%22&endkey=%22_design0%22&include_docs=true"
            }),
            function(response) {
                error.handle(response);
                var view = JSON.parse(response.body.join(""));
                var docs = {};
                view.rows && view.rows.forEach(function(row) {
                    var key = row.id.split("/")[1]; // TODO confirm there can't be more than one slash
                    delete row.doc._id;
                    delete row.doc._rev;
                    docs[key] = row.doc;
                });
                print(docs.toSource());
                return docs;
            }
        );
    };
    
    db.getDesign = function(name) {
        return when(
            db.get("_design/" + name),
            function(response) {
                response.name = response.id.split("/")[1];
                delete response.id;
                return response;
            }
        );
    };
    
    // TODO get design, if not there or not up to date, put design
    //var designUrl = db.url + "_design/" + (config.design || "perstore") + "/";
    
    return db;
};
 
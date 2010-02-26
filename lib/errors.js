var ErrorClass = require("extend-error").ErrorClass;
var AccessError = exports.AccessError = ErrorClass("AccessError");

var MethodNotAllowedError = exports.MethodNotAllowedError = ErrorClass("MethodNotAllowedError", AccessError);

var DatabaseError = exports.DatabaseError = ErrorClass("DatabaseError");

var NotFoundError = exports.NotFoundError = ErrorClass("NotFoundError", DatabaseError);
NotFoundError.prototype.code = 2;

var PreconditionFailed = exports.PreconditionFailed = ErrorClass("PreconditionFailed", DatabaseError);
PreconditionFailed.prototype.code = 3;

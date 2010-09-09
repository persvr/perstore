var Q = require("promised-io/promise");
var queue = require("event-loop-engine");
var i = 0,j = 0, count = 10000;
var startTime = new Date().getTime();
for(var i = 0; i < count;i++){
d = Q.defer();
Q.when(d.promise, function(){
j++;
if(j==count){
  print("finished " + (new Date().getTime() - startTime));
}
});
d.resolve(3);
}
queue.enterEventLoop(function(){
  queue.shutdown();
});
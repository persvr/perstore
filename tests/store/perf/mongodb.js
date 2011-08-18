var testStore = require("../../../store/mongodb").MongoDB({collection:"Test"});
testStore.ready().then(function(){
	require("./base").testStore(testStore);
});
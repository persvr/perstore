/**
 * This is a helper script for starting Node with the correct paths and 
 * environment to run Perstore
 */

// first we add all the necessary paths to require.paths
var packagesRoot = "../../../";
var packagePaths = [""] // start with the current directory
			.concat([ // now add alll the packages
				"packages/perstore/",
				"packages/perstore/engines/node/",
				"packages/perstore/engines/default/",
				"packages/commonjs-utils/",
				"engines/default/",
				""
				].map(function(path){ // for each package, start in the right directory
					return packagesRoot + path;
				    }));
				    
require.paths.push.apply(require.paths, packagePaths.map(function(path){
	return path + "lib";
}));

require("node-commonjs");
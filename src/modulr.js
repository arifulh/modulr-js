(function(window, app){

    // do not override existing Modulr implementation
    window.Modulr = window.Modulr || app;

}(window,

    (function(DomReady){

        var CONST = {};
        CONST.prefix = "[Modulr]";

        var MODULR_STACK = {},
            DOM_READY = false,
            PAGE_READY = false;

        DomReady(function(){
            DOM_READY = true;
        });

        var Modulr = function(CONFIG) {

            CONFIG = CONFIG || {};
            // default context
            CONFIG.context = CONFIG.context || "_";

            var CONTEXT = CONFIG.context;

            // cannot instantiate same context
            if (MODULR_STACK[CONTEXT]) {
                throwError("cannot instantiate multiple contexts: '"+CONTEXT+"'");
            }

            MODULR_STACK[CONTEXT] = {
                instance: this,
                stack: {}
            };

            var STACK = MODULR_STACK[CONTEXT].stack,
                INSTANCE_INIT = false,
                INSTANCE_READY = false;

            // version
            this.version = "${version}";

            var Proto = this;

            /**
             * get current instance's config
             */
            Proto.getConfig = function() {
                return CONFIG;
            };

            /**
             * define
             */
            Proto.define = function(id, deps, factory) {
                // if invalid id
                if (!isValidId(id)) {
                    throwError("invalid id: '" + id + "'.");
                }

                // only define if not yet defined
                if (!STACK[id]) {

                    deps = deps || [];

                    STACK[id] = {
                        executed: false,
                        exports: {},
                        deps: deps, // dependencies
                        factory: factory
                    };

                }

            };

            /**
             * execute a factory function
             */
            Proto.require = function(deps, callback) {

                if (isStr(deps)) {

                    return getDefinedModule(deps);

                } else if (isArray(deps)) {

                    var getDeps = function() {
                        // get dependencies
                        MODULE.get(null, deps, function(args){
                            getFactory(callback, args);
                        });
                    };

                    var trigger = function() {

                        // initialize the first time
                        if (!INSTANCE_INIT) {
                            
                            INSTANCE_INIT = true;

                            initializeInstance(function(){
                                getDeps();
                            });

                        } else {
                            getDeps();
                        }

                    };

                    if (PAGE_READY) {
                        trigger();
                    } else {
                        DomReady(function(){
                            trigger();
                        });
                    }
                    

                }

            };

            /**
             * Instantiate a unique Modulr
             */
            Proto.config = function(config) {

                if (!config.context) {

                    if (INSTANCE_INIT) {
                        throwError("cannot re-configure Modulr");
                    } else {
                        CONFIG = config;
                    }

                } else {

                    var instance = new Modulr(config);
                    
                    delete instance.config; // remote instantiation access
                    delete instance.ready; // no need for ready state

                    return instance;

                }

            };

            /**
             * Page ready option
             */
            Proto.ready = function() {
                PAGE_READY = true;
            };

            /**
             * get stack from require
             */
            function getDefinedModule(id) {
                var stack = STACK[id];
                if (stack && !stack.executed) {
                    throwError("module not yet executed: '"+id+"'");
                }
                return (stack) ? (stack.factory || stack.exports) : null;
            }


            function initializeInstance(callback) {

                // baseUrl - base instance path
                CONFIG.baseUrl = CONFIG.baseUrl || getRelativeUrl();

                // dependency loader for other instances
                if (CONFIG.instanceDeps) {

                    loadInstanceDeps(CONFIG.instanceDeps, function(){
                        INSTANCE_READY = true;
                        callback();
                    });

                } else {

                    INSTANCE_READY = true;
                    callback();

                }

                // for each paths, add baseUrl
                // if (CONFIG.paths) {
                //     for (var i in CONFIG.paths) {
                //         CONFIG.paths[i] = setConfigPath(CONFIG.baseUrl, CONFIG.paths[i]);
                //     }
                // }

            }

            var MODULE = {

                get: function(moduleId, deps, callback) {
                    var self = this,
                        next = true,
                        args = [],
                        arr;

                    if (deps) {
                        arr = cloneArr(deps);
                    } else if (moduleId && STACK[moduleId]) {
                        arr = cloneArr(STACK[moduleId].deps);
                    }

                    var getDeps = function() {

                        if (arr.length === 0) {

                            callback(args);

                        } else {

                            var id = arr.shift(),
                                module = STACK[id] || false;

                            if (id === "require") {
                                args.push(Proto.require);
                                getDeps();
                            } else if (id === "define") {
                                args.push(Proto.define);
                                getDeps();
                            } else if (id === "exports") {
                                args.push(STACK[moduleId].exports);
                                getDeps();
                            } else if (module) {

                                if (module.executed) {
                                    args.push(self.getModuleFactory(module));
                                    getDeps();
                                } else {
                                    self.execModule(null, null, id, function(factory){
                                        args.push(factory);
                                        getDeps();
                                    });
                                }
                                
                            } else {

                                // try to load external script
                                var src = self.getModulePath(id);

                                loadScript(src, function(){

                                    self.execModule("load", src, id, function(factory){
                                        args.push(factory);
                                        getDeps();
                                    });

                                });

                            }

                        }

                    };

                    getDeps();

                },

                execModule: function(type, src, id, callback) {
                    var self = this,
                        module = STACK[id];

                    if (type === "load" && !module) {
                        throwError("loaded file: " + src + " -- does not match definition id: '" + id + "'");
                    }

                    self.get(id, module.deps, function(args){
                        module.executed = true;
                        module.factory = getFactory(module.factory, args);
                        callback(self.getModuleFactory(module));
                    });

                },

                getModuleFactory: function(module){
                    return module.factory || module.exports;
                },

                getModulePath: function(id) {

                    // base url - base instance path
                    var base = CONFIG.baseUrl || getRelativeUrl(),
                        url = setConfigPath(base,id) + ".js";

                    return url;
                }

            };

            function loadInstanceDeps(depsObj, callback) {
                var arr = [];

                for (var id in depsObj) {
                    arr.push({
                        id: id,
                        path: depsObj[id]
                    });
                }

                var getDeps = function() {

                    if (arr.length === 0) {
                        callback();
                    } else {

                        var obj = arr.shift(),
                            path = obj.path,
                            src = MODULE.getModulePath(obj.path);
                        
                        loadScript(src, function(){
                            getDeps();
                        });
                    }

                };

                getDeps();

            }

            function loadScript(src, callback) {

                var loaded = false,
                    script = document.createElement("script");

                script.setAttribute("data-modulr-context", CONTEXT);
                script.type = "text/javascript";
                script.async = true;
                script.src = src;
                script.onload = script.onreadystatechange = function() {
                    if (!loaded && (!this.readyState || this.readyState === "complete")) {
                      loaded = true;
                      callback();
                    }
                };
                document.getElementsByTagName("head")[0].appendChild(script);

            }

        }; // Modulr

        /**
         * modulr shared functions
         */
    
        /**
         * get module
         */
        function getFactory(factory, deps) {
            var ret = null;
            if (isFN(factory)) {
                ret = factory.apply(factory, deps);
            } else {
                ret = factory;
            }

            return ret;
        }

        /**
         * validate module id
         */
        function isValidId(id) {
            var str = (typeof id === "string") ? (id.replace(/\s+/gi, "")) : "";
            return (str.length > 0 && str !== "require" && str !== "define" && str !== "exports") ? true : false;
        }

        /**
         * check if instance exists
         */
        function isInstanceFound(context) {
            return (MODULR_STACK[context]) ? true : false;
        }

        /**
         * config functions
         */
        function getRelativeUrl() {
            var loc = window.location,
                path = loc.pathname.split("/");
            path.pop();
            path = path.join("/") + "/";
            return loc.protocol + "//" + (loc.host || loc.hostname) + path;
        }

        function setConfigPath(baseUrl, path) {
            baseUrl = rtrimSlash(baseUrl);
            path = trimSlash(path);
            return [baseUrl, path].join("/");
        }

        /**
         * helper functions
         */
        function cloneArr(arr) {
            var ret = [];
            for (var i  = 0; i < arr.length; i++) {
                ret.push(arr[i]);
            }
            return ret;
        }

        function trimSlash(val) {
            val = rtrimSlash(ltrimSlash(val));
            return val;
        }

        function ltrimSlash(val) {
            return (val.charAt(0) === "/") ? val.slice(1) : val;
        }

        function rtrimSlash(val) {
            return (val.charAt(val.length - 1) === "/") ? val.slice(0, val.length - 1) : val;
        }

        function isStr(val) {
            return (typeof val === "string") ? true : false;
        }

        function isFN(val) {
            return (typeof val === "function") ? true : false;
        }

        function isObj(val) {
            return (typeof val === "object" && !isArray(val)) ? true : false;
        }

        function isArray(val) {
            val = val || false;
            return Object.prototype.toString.call(val) === "[object Array]";
        }

        function log() {
            var args = arguments;
            if (typeof args[0] === "string") {
                args[0] = [CONST.prefix, args[0]].join(" ");
            }

            if (window.console && window.console.log) {
                try {
                    return console.log.apply(console, args);
                } catch(err) {
                    console.log(args);
                }
            }
        }

        function throwError(str) {
            str = [CONST.prefix, str].join(" ");
            throw new Error(str);
        }

        return (new Modulr());
        
    }(

        (function(){
            //inclue:${domready}
            return domready;
        }())

    ))

));

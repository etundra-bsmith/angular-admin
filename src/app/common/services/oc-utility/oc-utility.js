angular.module('orderCloud')
    .factory('ocUtility', ocUtilityService)
;

function ocUtilityService($q, $localForage, $exceptionHandler, appname){
    var service = {
        GetCache: _getCache,
        ListAll: _listAll,
        ExecuteRecursively: _executeRecursively
    };

    function _getCache(cacheKey, onCacheEmpty, lastUpdatedTimeStamp){
        /*
         caches expensive functions

         cacheKey: the key that the data will be stored under
         onCacheEmpty: function to call if there is nothing stored in cache,
         must return a promise
         lastUpdatedTimeStamp: (optional) used to determine expiration of cookies

         */
        return $localForage.getItem(appname + cacheKey)
            .then(function(cache){
                if(cache && cache.data && cache.timeStamp > (lastUpdatedTimeStamp || 0)){
                    return cache.data;
                } else {
                    return onCacheEmpty.apply(null)
                        .then(function(results){
                            return $localForage.setItem(appname + cacheKey, {
                                    data: results,
                                    timeStamp: Date.now()
                                })
                                .then(function(){
                                    return results;
                                });
                        });
                }
            });
    }

    function _listAll() {
        /*
         *   recursively iterates over any list function
         *
         *   first parameter must be the list function
         *   parameters thereafter are arguments to the list function
         *   one of those arguments must be the string 'page'
         *   which defines the position of the page parameter to the list function
         *
         *   Example: ocService.ListAll(OrderCloud.Categories.List, null, 'page', 100, null, null, null, 'all', 'mockCatalogID')
         *   Equivalent to:  OrderCloud.Categories.List(null, 'page', 100, null, null, null, 'all', 'mockCatalogID')
         *
         **/

        //validation
        var invalid  = false;
        var args = [].slice.call(arguments);
        var ListFn = args.shift();
        if(typeof ListFn !== 'function') {$exceptionHandler('The first parameter must be a list function'); invalid = true;}
        var filterObj = args.pop();
        if(typeof filterObj !== 'object') {$exceptionHandler('at least one parameter must be the string "page" that defines the position of the page parameter for your list function'); invalid = true;}
        if(invalid) return;

        var queue = [];
        var listItems;
        filterObj.page = 1;
        filterObj.pageSize = 100;
        args.push(filterObj); //set page to 1

        return ListFn.apply(null, args)
            .then(function (data) {
                listItems = data;
                if (data.Meta.TotalPages > data.Meta.Page) {
                    filterObj.page = data.Meta.Page;
                    while (filterObj.page < data.Meta.TotalPages) {
                        filterObj.page += 1;
                        queue.push(ListFn.apply(null, args));
                    }
                }
                return $q.all(queue)
                    .then(function (results) {
                        _.each(results, function (result) {
                            listItems.Items = [].concat(listItems.Items, result.Items);
                            listItems.Meta = result.Meta;
                        });
                        return listItems;
                    })
                    .catch(function(ex){
                        $exceptionHandler(ex);
                    });
            });
    }

    function _executeRecursively(fn, iteratee, chunkSize){
        function execute(){
            var queue = [];
            var chunk = iteratee.splice(0, chunkSize);
            _.each(chunk, function(args){
                queue.push(fn.call(null, args));
            });
            return $q.all(queue)
                .then(function(){
                    return iteratee.length ? execute() : null;
                });
        }
        return execute();
    }

    return service;
}
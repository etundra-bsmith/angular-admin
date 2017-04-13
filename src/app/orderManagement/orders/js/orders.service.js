angular.module('orderCloud')
    .factory('ocOrdersService', OrderCloudOrdersService)
;

function OrderCloudOrdersService($q, $filter, OrderCloud) {
    var service = {
        List: _list
    };
    
    function _list(parameters) {

        function convertToDate(toDate) {
            var result = new Date(toDate);
            result = result.setDate(result.getDate() + 1);
            return $filter('date')(result, 'MM-dd-yyyy');
        }

        if (parameters.fromDate && parameters.toDate) {
            parameters.filters.DateSubmitted = [('>' + parameters.fromDate), ('<' + convertToDate(parameters.toDate))];
        } else if(parameters.fromDate && !parameters.toDate) {
            parameters.filters.DateSubmitted = [('>' + parameters.fromDate)];
        } else if (!parameters.fromDate && parameters.toDate) {
            parameters.filters.DateSubmitted = [('<' + convertToDate(parameters.toDate))];
        }

        if (parameters.filters && parameters.FromUserGroupID) {
            parameters.filters['xp.CustomerNumber'] = parameters.FromUserGroupID;
        }

        if (parameters.filters && parameters.FromCompanyID) {
            parameters.filters.FromCompanyID = parameters.FromCompanyID;
        }

        if (parameters.filters && parameters.status) {
            parameters.filters.status = parameters.status;
        }

        var filters = angular.extend({status: '!Unsubmitted'}, parameters.filters);

        return OrderCloud.Orders.ListIncoming(null, null, parameters.search, parameters.page, parameters.pageSize, parameters.searchOn, parameters.sortBy, filters, parameters.buyerID)
            .then(function(data) {
                return gatherBuyerCompanies(data)
            });

        function gatherBuyerCompanies(orders) {
            var buyerIDs = _.uniq(_.pluck(orders.Items, 'FromCompanyID'));
            return OrderCloud.Buyers.List(null, 1, 100, null, null, {ID: buyerIDs.join('|')})
                .then(function(buyerData) {
                    var queue = [];
                    _.each(orders.Items, function(order) {
                        order.FromCompany = _.findWhere(buyerData.Items, {ID: order.FromCompanyID});
                        queue.push(getUserGroups(order))
                    });
                    return $q.all(queue)
                        .then(function(results){
                            orders.Items = [].concat.apply([], results);
                            return orders;
                        })
                });

            function getUserGroups(order) {
                return OrderCloud.UserGroups.Get(order.xp.CustomerNumber, order.FromCompanyID)
                    .then(function(userGroup) {
                        order.FromUserGroup = userGroup;
                        order.FromUserGroupID = userGroup.ID;
                        return order;
                    });
            }
        }
    }
    
    return service;
}
angular.module('orderCloud')
    .config(OrdersConfig)
;

function OrdersConfig($stateProvider) {
    $stateProvider
        .state('orders', {
            parent: 'base',
            url: '/orders?FromUserGroupID&FromCompanyID&status&fromDate&toDate&search&page&pageSize&searchOn&sortBy',
            templateUrl: 'orderManagement/orders/templates/orders.html',
            controller: 'OrdersCtrl',
            controllerAs: 'orders',
            data: {
                pageTitle: 'Orders'
            },
            resolve: {
                Parameters: function($stateParams, ocParameters) {
                    return ocParameters.Get($stateParams);
                },
                OrderList: function(ocOrdersService, OrderCloud, Parameters) {
                    return ocOrdersService.List(Parameters);
                },
                BuyerCompanies: function(OrderCloud) {
                    return OrderCloud.Buyers.List(null, 1, 100);
                },
                UserGroupsList: function($q, OrderCloud, Parameters, BuyerCompanies) {
                    var queue = [];
                    _.each(BuyerCompanies.Items, function(buyer) {
                        queue.push(function(){
                            return OrderCloud.UserGroups.List(null, null, 100, null, null, null, buyer.ID)
                                .then(function(data) {
                                    return data.Items;
                                });
                        }());
                    });
                    return $q.all(queue)
                        .then(function(results) {
                            var userGroups = [].concat.apply([], results);
                            return userGroups;
                        })
                }
            }
        })
    ;
}
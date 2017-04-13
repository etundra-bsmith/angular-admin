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
                    return ocOrdersService.List(Parameters)
                        .then(function(orders) {
                            if(orders.Items.length) {
                                return orders;
                            } else {
                                return null;
                            }
                        });
                },
                BuyerCompanies: function(OrderCloud) {
                    return OrderCloud.Buyers.List(null, 1, 100);
                },
                UserGroupsList: function($q, OrderCloud, Parameters, BuyerCompanies) {
                    var queue = [];
                    _.each(BuyerCompanies.Items, function(buyer) {
                        queue.push(function(){
                            var defer = $q.defer();
                            OrderCloud.UserGroups.List(null, null, 100, null, null, null, buyer.ID)
                                .then(function(data) {
                                    return defer.resolve(data.Items);
                                })
                            return defer.promise;
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
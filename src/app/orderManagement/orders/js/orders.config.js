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
                Parameters: function ($stateParams, ocParameters) {
                    return ocParameters.Get($stateParams);
                },
                OrderList: function (ocOrdersService, Parameters) {
                    return ocOrdersService.List(Parameters);
                },
                BuyerCompanies: function (OrderCloudSDK) {
                    var options = {
                        page: 1,
                        pageSize: 100
                    };
                    return OrderCloudSDK.Buyers.List(options);
                },
                UserGroupsList: function ($q, OrderCloudSDK, Parameters, BuyerCompanies) {
                    var queue = [];
                    _.each(BuyerCompanies.Items, function (buyer) {
                        var parameters = {
                            pageSize: 100
                        };
                        queue.push(function () {
                            return OrderCloudSDK.UserGroups.List(buyer.ID, parameters)
                                .then(function (data) {
                                    return data.Items;
                                });
                        }());
                    });
                    return $q.all(queue)
                        .then(function (results) {
                            var userGroups = [].concat.apply([], results);
                            return userGroups;
                        })
                }
            }
        })
    ;
}
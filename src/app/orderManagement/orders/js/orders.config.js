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
                BuyerCompanies: function (OrderCloudSDK) {
                    var options = {
                        page: 1,
                        pageSize: 100
                    };
                    return OrderCloudSDK.Buyers.List(options);
                },
                OrderList: function (ocOrdersService, Parameters, BuyerCompanies) {
                    return ocOrdersService.List(Parameters, BuyerCompanies);
                },
                UserGroupsList: function ($q, OrderCloudSDK, Parameters, BuyerCompanies, ocUtility) {
                    var queue = [];
                    var userGroups = []
                    _.each(BuyerCompanies.Items, function (buyer) {
                        var parameters = {
                            page: 'page',
                            pageSize: 100
                        };
                        queue.push(ocUtility.ListAll(OrderCloudSDK.UserGroups.List, buyer.ID, parameters));
                    });
                    return $q.all(queue)
                        .then(function (results) {
                            _.each(results, function(result) {
                                userGroups = [].concat(userGroups, result.Items);
                            })
                            return userGroups;
                        })
                }
            }
        })
    ;
}
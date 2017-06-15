angular.module('orderCloud')
    .factory('ProductUploadService', ProductUploadService)
;

function ProductUploadService($q, ocUtility, OrderCloudSDK, catalogid, UploadService) {
    var service = {
        UploadProducts: _uploadProducts,
        UploadCategories: _uploadCategories,
        ValidateProducts: _validateProducts,
        ValidateCategories: _validateCategories,
        Combine: _combine
    };
    
    function _uploadProducts(products) {
        var deferred = $q.defer();
        var successfulProducts = [];
        var results = {
            FailedPriceSchedules: [],
            FailedProducts: []
        };
        var productCount = products.length;
        var progress = [];

        createPriceSchedules();

        function createPriceSchedules() {
            progress.push({Message: 'Upload Price Schedules', Total: productCount, SuccessCount: 0, ErrorCount: 0});
            return ocUtility.ExecuteRecursively(createPriceSchedule, angular.copy(products), 500)
                .then(function(){
                    return createProducts();
                });

            function createPriceSchedule(product){
                var ps = {
                    ID: product.ID,
                    Name: product.ID + ' - ' + product.Price,
                    ApplyTax: false,
                    ApplyShipping: false,
                    RestrictedQuantity: false,
                    UseCumulativeQuantity: false,
                    PriceBreaks: [{Quantity: 1, Price: product.Price}],
                    xp: {}
                };
                return OrderCloudSDK.PriceSchedules.Update(ps.ID, ps)
                    .then(function(){
                        progress[progress.length - 1].SuccessCount++;
                        deferred.notify(progress);
                    })
                    .catch(function(ex){
                        var e = ex.response.body.Errors[0];
                        results.FailedPriceSchedules.push({PriceScheduleID: ps.ID, Error: e.Message});
                        progress[progress.length - 1].ErrorCount++;
                        deferred.notify(progress);
                    });
            }
        }

        function createProducts() {
            progress.push({Message: 'Upload Products', Total: productCount, SuccessCount: 0, ErrorCount: 0});
            deferred.notify(progress);

            return ocUtility.ExecuteRecursively(createProduct, angular.copy(products), 500)
                .then(function(){
                    return finish();
                });

            function createProduct(product){
                if(!product.xp) product.xp = {};
                if(!product.xp.image) product.xp.image = {};
                if(!product.xp.image.URL) product.xp.image.URL = null;
                var p = {
                    ID: product.ID,
                    Name: product.Name.replace(/[^\w\s-,.]/gi, ''),
                    DefaultPriceScheduleID: product.ID,
                    Description: product.Description ? product.Description.replace(/[^\w\s-,.]/gi, '') : null,
                    QuantityMultiplier: product.QuantityMultiplier || 1,
                    Active: true,
                    ShipFromAddressID: product.ShipFromAddressID,
                    xp: {
                        url_detail: product.xp.url_detail,
                        image: {
                            URL: product.xp.image.URL
                        },
                        description_short: product.xp.description_short ? product.xp.description_short.replace(/[^\w\s-,.]/gi, '') : null,
                        attributes: product.xp.attributes
                    }
                };

                return OrderCloudSDK.Products.Update(p.ID, p)
                    .then(function() {
                        progress[progress.length - 1].SuccessCount++;
                        successfulProducts.push(product);
                        deferred.notify(progress);
                    })
                    .catch(function(ex) {
                        try {
                            var e = ex.response.body.Errors[0];
                            results.FailedProducts.push({ProductID: p.ID, Error: e.Message});
                        } catch(e){
                            console.log(ex);
                            console.log(e);
                            results.FailedProducts.push({ProductID: p.ID});
                        }
                        
                        progress[progress.length - 1].ErrorCount++;
                        deferred.notify(progress);
                    });
            }
        }

        function finish() {
            results.TotalErrorCount = results.FailedProducts.length + results.FailedPriceSchedules.length;
            deferred.resolve(results);
        }
        return deferred.promise;
    }

    function _uploadCategories(products, categories){
        var deferred = $q.defer();
        var categoryCount = categories.length;
        var successfulCats = [];
        var results = {
            FailedCategories: [],
            SkippedCategoryAssignments: [],
            FailedCategoryAssignments: []
        };
        var progress = [];

        createCategories();

        function createCategories() {
            progress.push({Message: 'Creating Categories', Total: categoryCount, SuccessCount: 0, ErrorCount: 0});
            deferred.notify(progress);

            return ocUtility.ExecuteRecursively(createCategory, angular.copy(categories), 500)
                .then(function(){
                    categories = successfulCats;
                    categoryCount = categories.length;
                    return setParentIDs();
                });

            function createCategory(category){
                var cat = {
                    ID: category.ID,
                    Name: category.Name,
                    Active: 'true'
                };
                return OrderCloudSDK.Categories.Update(catalogid, cat.ID, cat)
                    .then(function() {
                        progress[progress.length - 1].SuccessCount++;
                        deferred.notify(progress);
                        successfulCats.push(category);
                    })
                    .catch(function(ex) {
                        var code;
                        var message;
                        try {
                            code = ex.Errors[0].ErrorCode;
                            message = ex.Erros[0].Message;
                        } catch(e) {
                            console.log(e);
                            code = '';
                            message = '';
                        }
                        results.FailedCategories.push({CategoryID: cat.ID, Error: {ErrorCode: code, Message: message}});
                        progress[progress.length - 1].ErrorCount++;
                        deferred.notify(progress);
                    });
            }
        }

        function setParentIDs() {

            return ocUtility.ExecuteRecursively(setParentID, angular.copy(categories), 500)
                .then(function(){
                    return buildCategoryAssignmentQueue();
                });

            function setParentID(category){
                return OrderCloudSDK.Categories.Patch(catalogid, category.ID, {ParentID: category.ParentID})
                    .then(function(){
                        deferred.notify(progress);
                    })
                    .catch(function(ex){
                        deferred.notify(progress);
                    });
            }
        }

        function buildCategoryAssignmentQueue() {
            var categoryAssignments = [];

            _.each(products, function(product) {
                var category = _.findWhere(categories, {ID: product.CategoryID});
                if (category) {
                    var assignment = {
                        CategoryID: category.ID,
                        ProductID: product.ID
                    };
                    categoryAssignments.push(assignment);
                }
                else {
                    results.SkippedCategoryAssignments.push({CategoryID: product.CategoryID, ProductID: product.ID, Message: 'Category does not exist: ' + product.CategoryID});
                }
            });
            return makeProductCategoryAssignments(categoryAssignments);
        }

        function makeProductCategoryAssignments(categoryAssignments) {
            progress.push({Message: 'Assign Products to Categories', Total: categoryAssignments.length, SuccessCount: 0, ErrorCount: 0});
            deferred.notify(progress);

            return ocUtility.ExecuteRecursively(makeProductCategoryAssignment, angular.copy(categoryAssignments), 500)
                .then(function(){
                    return finish();
                });

            function makeProductCategoryAssignment(categoryAssignment){
                return OrderCloudSDK.Categories.SaveProductAssignment(catalogid, categoryAssignment)
                    .then(function() {
                        progress[progress.length - 1].SuccessCount++;
                        deferred.notify(progress);
                    })
                    .catch(function(ex) {
                        progress[progress.length - 1].ErrorCount++;
                        deferred.notify(progress);
                        var code;
                        var message;
                        try {
                            code = ex.Errors[0].ErrorCode;
                            message = ex.Errors[0].Message;
                        } catch(e) {
                            console.log(e);
                            code = 'null';
                            message = 'null';
                        }
                        results.FailedCategoryAssignments.push({CategoryID: categoryAssignment.CategoryID, ProductID: categoryAssignment.ProductID, Error: {Code: code, Message: message}});
                    });
            }
        }

        function finish() {
            results.TotalErrorCount = results.FailedCategoryAssignments.length;
            deferred.resolve(results);
        }

        return deferred.promise;
    }

    function _validateProducts(products, mapping) {
        var result = {};
        result.Products = [];
        result.ProductIssues = [];

        _.each(products, function(product) {
            validateSingleProduct(product);
        });
        return result;

        function validateSingleProduct(product) {
            var p = {
                ID: product[mapping.ID].replace(/[^\w\s-,.]/gi, ''),
                Name: product[mapping.Name],
                Description: product[mapping.Description],
                QuantityMultiplier: product[mapping.QuantityMultiplier],
                ShipWeight: product[mapping.ShipWeight],
                ShipHeight: product[mapping.ShipHeight],
                ShipWidth: product[mapping.ShipWidth],
                ShipLength: product[mapping.ShipLength],
                Active: product[mapping.Active],
                Type: product[mapping.Type],
                InventoryEnabled: product[mapping.InventoryEnabled],
                InventoryNotificationPoint: product[mapping.InventoryNotificationPoint],
                VariantLevelInventory: product[mapping.VariantLevelInventory],
                xp: UploadService.BuildXpObj(product, mapping),
                AllowOrderExceedInventory: product[mapping.AllowOrderExceedInventory],
                InventoryVisible: product[mapping.InventoryVisible],
                ShipFromAddressID: product[mapping.ShipFromAddressID],
                CategoryID: product[mapping.CategoryID],
                Price: product[mapping.Price]
            };
            result.Products.push(p);

            if (!p.ID) {
                result.ProductIssues.push({
                    ProductID: p.ID,
                    ProductName: p.Name,
                    Issue: 'Product: ' + p.Name + ' does not have an ID'
                });
            }
            if (!p.Name) {
                result.ProductIssues.push({
                    ProductID: p.ID,
                    ProductName: p.Name,
                    Issue: 'Product: ' + p.ID + ' does not have a Name'
                });
            }
            if (!p.Price) {
                result.ProductIssues.push({
                    ProductID: p.ID,
                    ProductName: p.Name,
                    Issue: 'Product: ' + p.Name + ' does not have a price'
                });
            }
            if (p.Price && !UploadService.IsNumber(p.Price)) {
                result.ProductIssues.push({
                    ProductID: p.ID,
                    ProductName: p.Name,
                    Issue: 'Product: ' + p.Name + ' Price is not a number: ' + p.Price
                });
            }
        }
    }

    function _validateCategories(categories, mapping) {
        var result = {};
        result.Categories = [];
        result.CategoryIssues = [];

        var categoryList = angular.copy(categories);

        _.each(categories, function(category) {
            validateSingleCat(category);
        });

        function validateSingleCat(category) {
            var cat = {
                ID: category[mapping.ID],
                Name: category[mapping.Name],
                ParentID: category[mapping.ParentID] || null
            };

            function hasParent(currentCat) {
                return _.some(categoryList, function(category){
                    return category[mapping.ID] === currentCat.ParentID;
                });
            }

            function isToplevel(cat){
                //ignore error for parent not defined if it is one of the
                //following defined top level categories

                return [
                    '33681', //safety,
                    '33691', //plumbing
                    '33800', //equipment
                    '33995', //dining room
                    '34200', //kitchen
                    '34292', //disposables
                    '34302', //janitorial
                    '34516', //parts
                    '34597'  //furniture
                ].indexOf(cat.ID) > -1;
            }

            result.Categories.push(cat);

            if (!cat.ID) {
                result.CategoryIssues.push({
                    CategoryID: cat.ID,
                    CategoryName: cat.Name,
                    Issue: 'Category: ' + cat.Name + ' does not have an ID'
                });
            }
            if (cat.ParentID && !hasParent(cat) && !isToplevel(cat)) {
                result.CategoryIssues.push({
                    CategoryID: cat.ID,
                    CategoryName: cat.Name,
                    Issue: 'Category: ' + cat.Name + ' has a ParentID of a Category that does not exist'
                });
            }
            
            if (!cat.Name) {
                result.CategoryIssues.push({
                    CategoryID: cat.ID,
                    CategoryName: cat.Name,
                    Issue: 'Category: ' + cat.ID + ' does not have a Name'
                });
            }
        }
        return result;
    }

    function _combine(prodCollection, attrCollection) {
        var formatted = [];
        var result = {};

        _.each(attrCollection, function(attr) {
            var attribute = {};
            attribute.unique_id = attr.unique_id;
            attribute[attr.key] = attr.value;
            formatted.push(attribute);
        });
        var groupedAttrs = _.groupBy(formatted, 'unique_id');
        _.each(groupedAttrs, function(group) {
            _.each(group, function(attr) {
                delete attr.unique_id;
            })
        });
        _.each(groupedAttrs, function(group, index) {
            var product = _.findWhere(prodCollection, {unique_id: index});
            if(product) {
                product.attributes = group;
                product.CategoryID = findCategoryID(product.attributes);
            }
            function findCategoryID(attributes) {
                var category = _.find(attributes, function(attribute){
                    return _.has(attribute, 'category_id');
                });
                return category ? category.category_id : null;
            }
        });
        result.productData = prodCollection;
        result.attrData = attrCollection;

        return result;
    }

    return service;
}
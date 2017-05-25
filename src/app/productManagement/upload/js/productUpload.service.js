angular.module('orderCloud')
    .factory('ProductUploadService', ProductUploadService)
;

function ProductUploadService($q, ocUtility, OrderCloudSDK, catalogid, UploadService, toastr) {
    var service = {
        Upload: _upload,
        ValidateProducts: _validateProducts,
        ValidateCategories: _validateCategories,
        Combine: _combine
    };

    function _upload(products, categories) {
        var deferred = $q.defer();
        var successfulProducts = [];
        var successfulCats = [];
        var results = {
            FailedProducts: [],
            FailedCategories: [],
            FailedPriceSchedules: [],
            FailedProductBuyerAssignments: [],
            SkippedCategoryAssignments: [],
            FailedCategoryAssignments: []
        };
        var productCount = products.length;
        var categoryCount = categories.length;
        var progress = [];

        createPriceSchedules();

        function createPriceSchedules() {
            progress.push({Message: 'Upload Price Schedules', Total: productCount, SuccessCount: 0, ErrorCount: 0});
            deferred.notify(progress);
            var priceScheduleQueue = [];
            _.each(products, function(product) {
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
                priceScheduleQueue.push((function() {
                    return OrderCloudSDK.PriceSchedules.Update(ps.ID, ps)
                        .then(function() {
                            progress[progress.length - 1].SuccessCount++;
                            deferred.notify(progress);
                        })
                        .catch(function(ex) {
                            var e = ex.response.body.Errors[0];
                            results.FailedPriceSchedules.push({PriceScheduleID: ps.ID, Error: e.Message});
                            progress[progress.length - 1].ErrorCount++;
                            deferred.notify(progress);
                        });
                })());
            });

            $q.all(priceScheduleQueue).then(function() {
                createProducts();
            });
        }

        function createProducts() {
            progress.push({Message: 'Upload Products', Total: productCount, SuccessCount: 0, ErrorCount: 0});
            deferred.notify(progress);
            var productQueue = [];
            _.each(products, function(product) {
                var p = {
                    ID: product.ID,
                    Name: product.Name,
                    DefaultPriceScheduleID: product.ID,
                    Description: product.Description,
                    QuantityMultiplier: product.QuantityMultiplier || 1,
                    Active: 'true',
                    ShipFromAddressID: product.ShipFromAddressID,
                    xp: {
                        url_detail: product.xp.url_detail,
                        image: {
                            URL: product.xp.image.URL
                        },
                        description_short: product.xp.description_short,
                        attributes: product.xp.attributes
                    }
                };
                productQueue.push(function() {
                    return OrderCloudSDK.Products.Update(p.ID, p)
                        .then(function() {
                            progress[progress.length - 1].SuccessCount++;
                            successfulProducts.push(product);
                            deferred.notify(progress);
                        })
                        .catch(function(ex) {
                            var e = ex.response.body.Errors[0];
                            results.FailedProducts.push({ProductID: p.ID, Error: e.Message});
                            progress[progress.length - 1].ErrorCount++;
                            deferred.notify(progress);
                        });
                }());
            });
            $q.all(productQueue).then(function() {
                products = successfulProducts;
                productCount = products.length;
                gatherBuyers()
            });
        }



        function gatherBuyers() {
            progress.push({Message: 'Fetch Buyers', Total: 1, SuccessCount: 0, ErrorCount: 0});
            deferred.notify(progress);
            var buyerIDs = [];
            var parameters = {
                page: 'page',
                pageSize: 100
            };
            return ocUtility.ListAll(OrderCloudSDK.Buyers.List, parameters)
                .then(function(buyerData) {
                    progress[progress.length - 1].Total = buyerData.Meta.TotalPages;
                    progress[progress.length - 1].SuccessCount++;
                    deferred.notify(progress);
                    buyerIDs = buyerIDs.concat(_.pluck(buyerData.Items, 'ID'));
                    assignProductsToBuyers(buyerIDs);
                });
        }

        function assignProductsToBuyers(bIDs) {
            progress.push({Message: 'Assign Products to Buyers', Total: productCount * bIDs.length, SuccessCount: 0, ErrorCount: 0});
            deferred.notify(progress);
            var buyerAssignmentQueue = [];
            _.each(products, function(product) {
                _.each(bIDs, function(buyerID) {
                    var assignment = {
                        BuyerID: buyerID,
                        ProductID: product.ID,
                        PriceScheduleID: product.ID
                    };
                    buyerAssignmentQueue.push(function() {
                        return OrderCloudSDK.Products.SaveAssignment(assignment)
                            .then(function() {
                                progress[progress.length - 1].SuccessCount++;
                                deferred.notify(progress);
                            })
                            .catch(function(ex) {
                                progress[progress.length - 1].ErrorCount++;
                                deferred.notify(progress);
                                toastr.error(buyerID + ': ' + ex.response.body.Errors[0].Message, 'Error');
                                results.FailedProductBuyerAssignments.push({BuyerID: buyerID, ProductID: product.ID, Error: {Code: ex.data.Errors[0].ErrorCode, Message: ex.data.Errors[0].Message}});
                            });
                    }());
                });
            });
            $q.all(buyerAssignmentQueue).then(function() {
                createCategories();
            });
        }

        function createCategories() {
            progress.push({Message: 'Creating Categories', Total: categoryCount, SuccessCount: 0, ErrorCount: 0});
            deferred.notify(progress);
            var categoryQueue = [];

            _.each(categories, function(category) {
                var cat = {
                    ID: category.ID,
                    Name: category.Name,
                    Active: 'true'
                };
                categoryQueue.push((function() {
                    return OrderCloudSDK.Categories.Update(catalogid, cat.ID, cat)
                        .then(function() {
                            progress[progress.length - 1].SuccessCount++;
                            deferred.notify(progress);
                            successfulCats.push(category);
                        })
                        .catch(function(ex) {
                            results.FailedCategories.push({CategoryID: cat.ID, Error: {ErrorCode: ex.data.Errors[0].ErrorCode, Message: ex.data.Errors[0].Message}});
                            progress[progress.length - 1].ErrorCount++;
                            deferred.notify(progress);
                        });
                })());
            });

            $q.all(categoryQueue).then(function() {
                categories = successfulCats;
                categoryCount = categories.length;
                setParentID();
            })
        }

        function setParentID() {
            var categoryQueue = [];
            _.each(categories, function(category) {
                categoryQueue.push(function() {
                    return OrderCloudSDK.Categories.Patch(catalogid, category.ID, {ParentID: category.ParentID})
                        .then(function() {
                            deferred.notify(progress);
                        })
                        .catch(function(ex) {
                            deferred.notify(progress);
                        });
                }());
            });

            $q.all(categoryQueue).then(function() {
                buildCategoryAssignmentQueue(categories);
            });
        }

        function buildCategoryAssignmentQueue(allCategories) {
            var categoryAssignments = [];

            _.each(products, function(product) {
                var category = _.findWhere(allCategories, {ID: product.CategoryID});
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
            assignProductsToCategories(categoryAssignments);
        }

        function assignProductsToCategories(categoryAssignments) {
            progress.push({Message: 'Assign Products to Categories', Total: categoryAssignments.length, SuccessCount: 0, ErrorCount: 0});
            deferred.notify(progress);
            var categoryAssignmentQueue = [];
            _.each(categoryAssignments, function(categoryAssignment) {
                categoryAssignmentQueue.push(function() {
                    return OrderCloudSDK.Categories.SaveProductAssignment(catalogid, categoryAssignment)
                        .then(function() {
                            progress[progress.length - 1].SuccessCount++;
                            deferred.notify(progress);
                        })
                        .catch(function(ex) {
                            progress[progress.length - 1].ErrorCount++;
                            deferred.notify(progress);
                            results.FailedCategoryAssignments.push({CategoryID: categoryAssignment.CategoryID, ProductID: product.ID, Error: {Code: ex.data.Errors[0].ErrorCode, Message: ex.data.Errors[0].Message}});
                        });
                }());
            });
            $q.all(categoryAssignmentQueue).then(function() {
                progress.push({Message: 'Done'});
                deferred.notify(progress);
                finish();
            });
        }

        function finish() {
            results.TotalErrorCount = results.FailedProducts.length + results.FailedPriceSchedules.length + results.FailedProductBuyerAssignments.length + results.FailedCategoryAssignments.length;
            deferred.resolve(results);
        }

        return deferred.promise;
    }

    function _validateProducts(products, mapping) {
        var result = {};
        result.Products = [];
        result.ProductIssues = [];

        _.each(products, function(product) {
            validateSingleProduct(product)
        });
        return result;

        function validateSingleProduct(product) {
            function findCategoryID(product) {
                var category = null;
                _.each(product.attributes, function(value) {
                    var key = _.keys(value)[0];
                    if(key === 'category_id') category = value;
                });
                return category.category_id;
            }

            var p = {
                ID: product[mapping.ID],
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
            if (!UploadService.IsValid(p.ID)) {
                result.ProductIssues.push({
                    ProductID: p.ID,
                    ProductName: p.Name,
                    Issue: 'Product: ' + p.ID + ' ID has special characters'
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

            result.Categories.push(cat);

            if (!cat.ID) {
                result.CategoryIssues.push({
                    CategoryID: cat.ID,
                    CategoryName: cat.Name,
                    Issue: 'Category: ' + cat.Name + ' does not have an ID'
                });
            }
            if (cat.ParentID && !hasParent(cat)) {
                result.CategoryIssues.push({
                    CategoryID: cat.ID,
                    CategoryName: cat.Name,
                    Issue: 'Category: ' + cat.Name + ' has a ParentID of a Category that does not exist'
                });
            }
            if (!UploadService.IsValid(cat.ID)) {
                result.CategoryIssues.push({
                    CategoryID: cat.ID,
                    CategoryName: cat.Name,
                    Issue: 'Category: ' + cat.ID + ' has special characters'
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
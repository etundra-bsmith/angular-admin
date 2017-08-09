angular.module('orderCloud')
    .factory('UserUploadService', UserUploadService)
;

function UserUploadService($q, OrderCloudSDK, UploadService, toastr, $exceptionHandler) {
    var service = {
        UploadUsers: _uploadUsers,
        ValidateUsers: _validateUsers,
        ValidateUserGroups: _validateUserGroups,
        ValidateAddress: _validateAddress
    };

    function _uploadUsers(buyer, users, userGroups, addresses) {
        var deferred = $q.defer();
        var successfulUsers = [];
        var successfulUserGroups = [];
        var successfulAddresses = [];

        var results = {
            FailedUsers: [],
            FailedUserGroups: [],
            FailedAddresses: [],
            FailedUserAssignments: [],
            FailedAddressAssignments: []
        };

        var userCount = users.Users.length;
        var userGroupCount = userGroups.UserGroups.length;
        var addressCount = addresses.Address.length;
        var groupAssignmentCount = [];
        var progress = [];

        createUsers();

        function createUsers() {
            progress.push({Message: 'Upload Users', Total: userCount, SuccessCount: 0, ErrorCount: 0});
            deferred.notify(progress);
            var userQueue = [];
            _.each(users.Users, function(user) {
                var userBody = {
                    ID: user.ID,
                    Username: user.Username,
                    FirstName: user.FirstName,
                    LastName: user.LastName,
                    Email: user.Email,
                    Phone: user.Phone,
                    Active: user.Active.toLowerCase() === 'true',
                    xp: {
                        Locations: user.xp.Locations
                    }
                };
                userQueue.push( (function() {
                    return OrderCloudSDK.Users.Update(buyer.ID, userBody.ID, userBody)
                        .then(function() {
                            _.each(user.xp.Locations, function(location) {
                                //Used to get the total amount of user : userGroup assignments
                                groupAssignmentCount.push(location);
                            });
                            progress[progress.length - 1].SuccessCount++;
                            deferred.notify(progress);
                            successfulUsers.push(userBody);
                        })
                        .catch(function(ex) {
                            var e = _getErrorMessage(ex);
                            var displayError = {UserID: userBody.ID, Error: e};

                            console.log(displayError);
                            results.FailedUsers.push(displayError);

                            progress[progress.length - 1].ErrorCount++;
                            deferred.notify(progress);
                        });
                })());
            });

            $q.all(userQueue)
                .then(function() {
                    users = successfulUsers;
                    userCount = users.length;
                    createUserGroups();
                });
        }

        function createUserGroups() {
            progress.push({Message: 'Upload User Groups', Total: userGroupCount, SuccessCount: 0, ErrorCount: 0});
            deferred.notify(progress);
            var userGroupQueue = [];
            _.each(userGroups.UserGroups, function(userGroup) {
                var userGroupBody = {
                    ID: userGroup.ID,
                    Name: userGroup.Name
                };

                userGroupQueue.push( (function() {
                    return OrderCloudSDK.UserGroups.Update(buyer.ID, userGroupBody.ID, userGroupBody)
                        .then(function() {
                            progress[progress.length - 1].SuccessCount++;
                            deferred.notify(progress);
                        })
                        .catch(function(ex) {
                            //this is handling an API bug around UserGroups where update
                            //returns an error if user group doesn't exist
                            if(ex.status === 404) {
                                return OrderCloudSDK.UserGroups.Create(buyer.ID, userGroupBody)
                                    .then(function() {
                                        progress[progress.length - 1].SuccessCount++;
                                        deferred.notify(progress);
                                    })
                                    .catch(function(ex){
                                        var e = _getErrorMessage(ex);
                                        var displayError = {UserGroupID: userGroupBody.ID, Error: e};

                                        console.log(displayError);
                                        results.FailedUserGroups.push(displayError);

                                        progress[progress.length - 1].ErrorCount++;
                                        deferred.notify(progress);
                                    });
                            } else {
                                var e = _getErrorMessage(ex);
                                var displayError = {UserGroupID: userGroupBody.ID, Error: e};

                                console.log(displayError);
                                results.FailedUserGroups.push(displayError);

                                progress[progress.length - 1].ErrorCount++;
                                deferred.notify(progress);
                            }
                        });
                })());
            });

            $q.all(userGroupQueue)
                .then(function() {
                    successfulUserGroups = userGroups.UserGroups;
                    userGroupCount = userGroups.UserGroups.length;
                    saveUserAssignment(successfulUsers, userGroups);
                });
        }

        function saveUserAssignment(users, groups) {
            progress.push({Message: 'Assign Users to User Groups', Total: groupAssignmentCount.length, SuccessCount: 0, ErrorCount: 0});
            deferred.notify(progress);
            var groupAssignmentQueue = [];
            _.each(users, function(user) {
                var locations = user.xp.Locations[0].split(",");
                _.each(locations, function(id) {
                    id = id.trim();
                    var matchedID = _.findWhere(groups.UserGroups, {ID: id});
                    if(matchedID) {
                        var assignment = {
                            UserID: user.ID,
                            UserGroupID: matchedID.ID
                        };
                        groupAssignmentQueue.push(function() {
                            return OrderCloudSDK.UserGroups.SaveUserAssignment(buyer.ID, assignment)
                                .then(function() {
                                    progress[progress.length - 1].SuccessCount++;
                                    deferred.notify(progress);
                                })
                                .catch(function(ex) {
                                    var e = _getErrorMessage(ex);
                                    var displayError = {UserID: assignment.UserID, UserGroupID: assignment.UserGroupID, Error: e};

                                    console.log(displayError);
                                    results.FailedUserAssignments.push(displayError);

                                    progress[progress.length - 1].ErrorCount++;
                                    deferred.notify(progress);
                                });
                            }());
                    } else {
                        progress[progress.length - 1].ErrorCount++;
                        deferred.notify(progress);
                        results.FailedUserAssignments.push({UserID: user.ID, UserGroupID: matchedID.ID, Error: 'An error occurred while assigning this User to a matching User Group'});
                    }
                });
            });
            $q.all(groupAssignmentQueue)
                .then(function() {
                    createAddresses();
                });
        }

        function createAddresses() {
            progress.push({Message: 'Upload Addresses', Total: addressCount, SuccessCount: 0, ErrorCount: 0});
            deferred.notify(progress);
            var addressQueue = [];
            _.each(addresses.Address, function(address) {
                var addressBody = {
                    ID: address.ID,
                    CompanyName: address.CompanyName,
                    Street1: address.Street1,
                    Street2: address.Street2,
                    City: address.City,
                    State: address.State,
                    Zip: address.Zip,
                    Country: 'US',
                    Phone: address.Phone,
                    AddressName: address.AddressName
                };
                addressQueue.push(function(){
                    return OrderCloudSDK.Addresses.Update(buyer.ID, addressBody.ID, addressBody)
                        .then(function() {
                            progress[progress.length -1].SuccessCount++;
                            deferred.notify(progress);
                        })
                        .catch(function(ex) {
                            var e = _getErrorMessage(ex);
                            var displayError = {AddressID: addressBody.ID,  Error: e};

                            console.log(displayError);
                            results.FailedAddresses.push(displayError);

                            progress[progress.length - 1].ErrorCount++;
                            deferred.notify(progress);
                        });
                }());
            });

            $q.all(addressQueue)
                .then(function() {
                    successfulAddresses = addresses.Address;
                    addressCount = addresses.Address.length;
                    buildAddressAssignment(successfulUserGroups, successfulAddresses);
                });
        }

        function buildAddressAssignment(groups, addresses) {
            var addressAssignments = [];

            _.each(groups, function(group) {
                var matchingID = _.findWhere(addresses, {CompanyName: group.ID});
                if(matchingID) {
                    var assignment = {
                        IsShipping: true,
                        ISBilling: false,
                        AddressID: matchingID.ID,
                        UserGroupID: group.ID
                    };
                    addressAssignments.push(assignment);
                } else {
                    results.FailedAddressAssignments.push({UserGroupID: group.ID, Error: {Message: 'The Address for Group ' + group.ID + ' does not exist'}})
                }
            });
            saveAddressAssignment(addressAssignments);
        }

        function saveAddressAssignment(assignments) {
            progress.push({Message: 'Assign Addresses to User Groups', Total: assignments.length, SuccessCount: 0, ErrorCount: 0});
            deferred.notify(progress);
            var addressAssignmentQueue = [];
            _.each(assignments, function(assignment) {
                addressAssignmentQueue.push( (function() {
                    return OrderCloudSDK.Addresses.SaveAssignment(buyer.ID, assignment)
                        .then(function() {
                            progress[progress.length - 1].SuccessCount++;
                            deferred.notify(progress);
                        })
                        .catch(function(ex) {
                            var e = _getErrorMessage(ex);
                            var displayError = {AddressID: assignment.AddressID, UserGroupID: assignment.GroupID,  Error: e};

                            console.log(displayError);
                            results.FailedAddressAssignments.push(displayError);

                            progress[progress.length - 1].ErrorCount++;
                            deferred.notify(progress);
                        });
                })());
            });
            $q.all(addressAssignmentQueue).then(function() {
                progress.push({Message: 'Done'});
                deferred.notify(progress);
                finish();
            });
        }

        function finish() {
            results.TotalErrorCount = results.FailedUsers.length + results.FailedUserGroups.length + results.FailedAddresses.length + results.FailedUserAssignments.length + results.FailedAddressAssignments.length;
            deferred.resolve(results);
        }

        return deferred.promise;
    }

    function _validateUsers(users, mapping) {
        var result = {};
        result.Users = [];
        result.UserIssues = [];

        _.each(users, function(user) {
            validateSingleUser(user);
        });

        function validateSingleUser(user) {
            var userData = {
                ID: user[mapping.ID].replace(/[^\w\s-,.]/gi, ''),
                Username: user[mapping.Username],
                FirstName: user[mapping.FirstName],
                LastName: user[mapping.LastName],
                Email: user[mapping.Email],
                Phone: user[mapping.Phone],
                Active: user[mapping.Active],
                xp: UploadService.BuildXpObj(user, mapping)
            };

            result.Users.push(userData);

            if (!userData.ID) {
                result.UserIssues.push({
                    ID: userData.ID,
                    Username: userData.Username,
                    Issue: 'User: ' + userData.Username + ' does not have an ID, ensure column name "id" is populated'
                });
            }
            if(!userData.Username) {
                result.UserIssues.push({
                    ID: userData.ID,
                    Username: userData.Username,
                    Issue: 'User ' + userData.ID + ' does not have a Username, ensure column name "username" is populated'
                });
            }
        }
        return result;
    }

    function _validateUserGroups(groups, mapping) {
        var result = {};
        result.UserGroups = [];
        result.UserGroupIssues = [];

        _.each(groups, function(group) {
            validateSingleGroup(group)
        });

        function validateSingleGroup(group) {
            var userGroupData = {
                ID: group[mapping.ID].replace(/[^\w\s-,.]/gi, ''),
                Name: group[mapping.Name]
            };

            result.UserGroups.push(userGroupData);

            if (!userGroupData.ID) {
                result.UserGroupIssues.push({
                    ID: userGroupData.ID,
                    Issue: 'User Group:' + userGroupData.Name + ' does not have an ID, ensure column name "id" is populated'
                });
            }
            
            if(!userGroupData.Name) {
                result.UserGroupIssues.push({
                    ID: userGroupData.ID,
                    Issue: 'User Group: ' + userGroupData.ID + ' does not have a Name, ensure column "name" is populated'
                });
            }
        }
        return result;
    }

    function _validateAddress(addresses, mapping) {
        var result = {};
        result.Address = [];
        result.AddressIssues = [];

        _.each(addresses, function(address) {
            validateSingleAddress(address);
        });

        function validateSingleAddress(address) {
            var addressData = {
                ID: address[mapping.ID].replace(/[^\w\s-,.]/gi, ''),
                CompanyName: address[mapping.CompanyName],
                Street1: address[mapping.Street1],
                Street2: address[mapping.Street2],
                City: address[mapping.City],
                State: address[mapping.State],
                Zip: address[mapping.Zip],
                Country: address[mapping.Country],
                Phone: address[mapping.Phone],
                AddressName: address[mapping.AddressName]
            };

            result.Address.push(addressData);

            if(!addressData.Street1) {
                result.AddressIssues.push({
                    CompanyName: addressData.CompanyName,
                    ID: addressData.ID,
                    Issues: 'Address: ' + addressData.CompanyName + ' does not have a Street1, ensure column name "store_location_id" is populated'
                });
            }
            if(!addressData.City) {
                result.AddressIssues.push({
                    CompanyName: addressData.CompanyName,
                    ID: addressData.ID,
                    Issues: 'Address: ' + addressData.CompanyName + ' does not have a City, ensure column name "city" is populated'
                });
            }
            if(!addressData.State) {
                result.AddressIssues.push({
                    CompanyName: addressData.CompanyName,
                    ID: addressData.ID,
                    Issues: 'Address: ' + addressData.CompanyName + ' does not have a State, ensure column name "state" is populated'
                });
            }
            if(!addressData.Zip) {
                result.AddressIssues.push({
                    CompanyName: addressData.Zip,
                    ID: addressData.ID,
                    Issues: 'Address: ' + addressData.Zip + ' does not have a Zip Code, ensure column name "zip" is populated'
                });
            }
            //hard coding this to 'US' for now 
            // if(!addressData.Country) {
            //     result.AddressIssues.push({
            //         CompanyName: addressData.Zip,
            //         ID: addressData.ID,
            //         Issues: 'Address: ' + addressData.Zip + ' does not have a Country, ensure column name "country" is populated'
            //     });
            // }
        }
        return result;
    }

    function _getErrorMessage(ex){
        var message = '';
        if(ex && ex.response && ex.response.body && ex.response.body.Errors && ex.response.body.Errors.length) {
            var errorObj = ex.response.body.Errors[0];
            message = errorObj.ErrorCode === 'NotFound' ? errorObj.Data.ObjectType + ' ' + errorObj.Data.ObjectID + ' not found.' : errorObj.Message;
        } else if(ex && ex.response && ex.response.body && ex.response.body['error_description']) {
            message = ex.response.body['error_description'];
        } else if(ex && ex.message) {
            message = ex.message;
        } else {
            message = 'An error occurred';
        }
        return message;
    }

    return service;
}
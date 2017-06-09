angular.module('orderCloud')
    .controller('CreateCategoryModalCtrl', CreateCategoryModalController)
;

function CreateCategoryModalController($exceptionHandler, $uibModalInstance, OrderCloudSDK, ParentID, CatalogID){
    var vm = this;
    vm.category = {xp:{}};
    vm.category.ParentID = ParentID;
    vm.category.Active = true;
    vm.catalogid = CatalogID;

    vm.fileUploadOptions = {
        keyname: 'image',
        folder: null,
        extensions: 'jpg, png, gif, jpeg, tiff',
        invalidExtensions: null,
        uploadText: 'Upload an image',
        onUpdate: null,
        multiple: false
    };

    vm.cancel = function(){
        $uibModalInstance.dismiss();
    };

    vm.submit = function() {
        if (vm.category.ParentID === '') {
            vm.category.ParentID = null;
        }
        vm.loading = OrderCloudSDK.Categories.Create(vm.catalogid, vm.category)
            .then(function(category) {
                $uibModalInstance.close(category);
            })
            .catch(function(ex) {
                $exceptionHandler(ex);
            });
    };
}
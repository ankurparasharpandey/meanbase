angular.module('meanbaseApp')
  .directive('mbChooseLink', function ($rootScope, endpoints, $timeout, linkModal) {
    return {
      template: '<ng-transclude></ng-transclude>',
      transclude: true,
      // replace: true,
      restrict: 'AE',
      scope: true,
      link: function (scope, element, attrs) {

        if(!$rootScope.isLoggedIn) { return false; }

        scope.belongsTo = scope.$eval(attrs.belongsTo);

        if(!scope.belongsTo) { scope.belongsTo = {}; }
        if(!scope.belongsTo[attrs.property]) { scope.belongsTo[attrs.property] = {}; }

        var chosenElement = element;

        var insideLink;
        if(element.find('.mb-link')) {
          insideLink = element.find('.mb-link:first')[0];
        }

        function fireClick(event) {
          if(!$rootScope.editMode) { return false; }
          if(event.target !== element && event.target !== insideLink) { return false; }
          event.preventDefault();
          scope.belongsTo = scope.$eval(attrs.belongsTo);
          if(!scope.belongsTo[attrs.property]) { scope.belongsTo[attrs.property] = {}; }
          linkModal.open(scope.belongsTo, attrs.property)
        }

        element.bind('click', fireClick);
      }
    }

  });

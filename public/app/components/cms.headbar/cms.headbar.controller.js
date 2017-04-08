(function(){

	angular.module('meanbaseApp').controller('cms.headbar.controller', HeadbarController);

	// @ngInject
	function HeadbarController($scope, $rootScope, endpoints, $state, $location, $modal, $timeout, helpers, toastr, api) {

    window.dropdown.init()

    $scope.drawerPages = []

    this.permissions = _.get($rootScope, 'currentUser.permissions') || []

    let mbPageDrawer = document.getElementById("mb-pages-drawer")
    /* Set the width of the side navigation to 250px */
    this.openMBPageDrawer = ($event) => {
      if(mbPageDrawer) {
        mbPageDrawer.classList.add('mb-drawer-open')
      }

      $event.stopPropagation()

      document.body.addEventListener('click', function mbCloseDrawer(event) {
        if(!$(event.target).closest("#mb-pages-drawer").length || $(event.target).is('.mb-page-link')) {
          mbPageDrawer.classList.remove('mb-drawer-open')
          document.body.removeEventListener('click', mbCloseDrawer)
        }
        event.stopPropagation()
      })

      api.pages.find({$select: ['url', 'title']}).then(function(response) {
        $scope.drawerPages = response
      });
    }

    const msTillAutoSaveMenus = 100;
    const msTillAutoSavePage = 100;
    const msTillAutoSaveExtensions = 200;

    $scope.autoSavingInProgress = false
    let self = this

    if(!$rootScope.isLoggedIn) { return false; }

		this.themeTemplates = Object.getOwnPropertyNames(window.meanbaseGlobals.themeTemplates);

		//  ###editMode
		// The big daddy power house **editMode**! This variable is used all throughout the app to enable edits to be made on the content. We don't want this to be true until we hit the edit button in the admin top menu.
		$rootScope.editMode = false;

    let recentUrls
    try {
      recentUrls = this.previousEditUrls = JSON.parse(localStorage.getItem('previousEditUrls')) || []
    } catch(err) {
      console.log('Error getting recent urls', err);
    }


		// Used to disable navigation while in edit mode
		$scope.ableToNavigate = true;


    function startEditMode() {

    }

		// Prevent the user from navigating away while in edit mode until they save or discard their changes.
		$scope.$onRootScope('$stateChangeSuccess', function (event, toState, toParams, fromState, fromParams) {
      if($rootScope.currentUser.permissions.indexOf('editContent') > -1) {
        autoSaveSessionSnapshot = {}
        self.toggleEdit(true)
      }
		});

    $timeout(function() {
      if($rootScope.currentUser.permissions.indexOf('editContent') > -1) {
        self.toggleEdit(true)
      }
    });


    var pageWatcher, menusWatcher, autoSaveSessionSnapshot = {};
		// Toggles the all powerful editMode, emits an event so the rest of the app can make changes
		this.toggleEdit = async boole => {
			if(boole !== undefined) { $rootScope.editMode = boole } else { $rootScope.editMode = !$rootScope.editMode }

      if($rootScope.editMode) {
        document.body.classList.add('inEditMode')
        $rootScope.$emit('cms.pullAutoSaveData', $rootScope.editMode)
        $rootScope.$emit('cms.editMode', $rootScope.editMode)
      } else {
        document.body.classList.remove('inEditMode')
        $rootScope.$emit('cms.editMode', $rootScope.editMode)
        $rootScope.$emit('cms.updateView')
      }

		};

    $scope.$onRootScope('cms.toggleEditMode', function(event, mode) {
      self.toggleEdit(mode)
    })

    let lastPageUndoData
    let lastMenuUndoData
    let lastMenuUndoData2
    let lastPageUndoData2

    $scope.$onRootScope('cms.elementsChanged', _.debounce(function() {
      lastPageUndoData = lastPageUndoData2
      lastPageUndoData2 = angular.copy($rootScope.page)

      lastMenuUndoData = lastMenuUndoData2
      lastMenuUndoData2 = angular.copy($rootScope.menus)

      $rootScope.$emit('cms.autoSave')
      $rootScope.$emit('cms.autoSaveExtensionData')
      $scope.autoSavingInProgress = true
      $timeout(function() {
        $scope.autoSavingInProgress = false
      }, 1000);
    }, msTillAutoSavePage))


    function mergeInAutoSaveData(autoSave) {
      if(autoSave && autoSave.data) {
        $rootScope.page.title = angular.copy(autoSave.data.title)
        $rootScope.page.tabTitle = angular.copy(autoSave.data.tabTitle)
        $rootScope.page.description = angular.copy(autoSave.data.description)
        $rootScope.page.content = angular.copy(autoSave.data.content) || {}
        $rootScope.page.images = angular.copy(autoSave.data.images) || {}
        $rootScope.page.extensions = angular.copy(autoSave.data.extensions) || {}
        $rootScope.page.lists = angular.copy(autoSave.data.lists) || {}
        $rootScope.page.links = angular.copy(autoSave.data.links) || {}
        $rootScope.page.template = angular.copy(autoSave.data.template) || {}

        document.title = $rootScope.page.tabTitle
        jQuery('meta[name=description]').attr('content', $rootScope.page.description)
      }
    }

    $scope.$onRootScope('cms.logout', () => {
      this.permissions = []
      this.toggleEdit(false)
    })

    async function addOrUpdateExtension(item) {
      if(item.label && item.sync && item.syncGroup) {
        try {
          await api.custom.update({belongsTo: item.label, key: item.syncGroup}, {value: item.data, enabled: true, permission: 'editContent'})
          api.staging.delete({belongsTo: item.label, key: item.syncGroup})
        } catch(err) {
          console.log('err', err);
        }
      }
    }

    async function autoSaveExtension(item) {
      if(item.label && item.sync && item.syncGroup) {
        try {
          await api.staging.update({belongsTo: item.label, key: item.syncGroup}, {data: item.data, enabled: true, permission: 'editContent'})
        } catch(err) {
          console.log('Error autosaving add-on', err);
        }
      }
    }

    async function fetchExtension(item) {
      if(item.label && item.sync && item.syncGroup) {
        let foundStaging = await api.staging.find({belongsTo: item.label, key: item.syncGroup})
        foundStaging = foundStaging[0]

        if(_.get(foundStaging, 'data') && !_.isEqual(foundStaging.data, { items: [] }) ) {
          $timeout(function() {
            item.data = foundStaging.data
          });
        } else {
          let foundPublishData = await api.custom.find({belongsTo: item.label, key: item.syncGroup})
          foundPublishData = foundPublishData[0]

          if(foundPublishData && foundPublishData.value) {
            $timeout(function() {
              item.data = foundPublishData.value
            });
          } else {
            autoSaveExtension(item)
          }
        }
      }
    }

    $scope.$onRootScope('cms.fetchExtensionData', async () => {
      for (var extension in $rootScope.page.lists) {
        if ($rootScope.page.lists.hasOwnProperty(extension)) {
          for (var i = 0; i < $rootScope.page.lists[extension].length; i++) {
            let item = $rootScope.page.lists[extension][i]
            await fetchExtension(item)
          }
        }
      }
    })


    $scope.$onRootScope('cms.publishExtensionData', _.debounce(async () => {
      for (var extension in $rootScope.page.lists) {
        if ($rootScope.page.lists.hasOwnProperty(extension)) {
          for (var i = 0; i < $rootScope.page.lists[extension].length; i++) {
            let item = $rootScope.page.lists[extension][i]
            addOrUpdateExtension(item)
          }
        }
      }
    }, msTillAutoSaveExtensions))


    $scope.$onRootScope('cms.autoSaveExtensionData', _.debounce(async () => {
      for (var extension in $rootScope.page.lists) {
        if ($rootScope.page.lists.hasOwnProperty(extension)) {
          for (var i = 0; i < $rootScope.page.lists[extension].length; i++) {
            let item = $rootScope.page.lists[extension][i]
            await autoSaveExtension(item)
          }
        }
      }
    }, msTillAutoSaveExtensions))

    $scope.$onRootScope('cms.updateTemplate', () => {

      if(!autoSaveSessionSnapshot.page) {
        $state.reload()
        return false
      }

      if(autoSaveSessionSnapshot.page.template !== $rootScope.page.template) {
        $state.reload()
      }
    })

    $scope.$onRootScope('cms.pullAutoSaveData', async url => {
      try {
        let pageAutoSaveData = await api.staging.find({key: $rootScope.page.url})
        pageAutoSaveData = pageAutoSaveData[0]

        if(pageAutoSaveData && pageAutoSaveData.data) {
          autoSaveSessionSnapshot.page = angular.copy(pageAutoSaveData.data)
        } else {
          autoSaveSessionSnapshot.page = angular.copy(_.pick($rootScope.page, [
            'title',
            'tabTitle',
            'description',
            'content',
            'images',
            'extensions',
            'lists',
            'grid',
            'links'
          ]))
        }

        // Take the original snapshot before we merge in the stading data
        $rootScope.$emit('cms.takePageSnapshot', $rootScope.editMode)

        mergeInAutoSaveData(pageAutoSaveData)

        lastPageUndoData2 = angular.copy($rootScope.page)

        let menusStagingData = await api.staging.find({key: 'menus'})
        menusStagingData = menusStagingData[0]

        if(menusStagingData && menusStagingData.data) {
          autoSaveSessionSnapshot.menus = menusStagingData.data
          $rootScope.$emit('cms.takeMenusSnapshot', $rootScope.editMode)
          $timeout(function() {
            $rootScope.menus = menusStagingData.data
          })
        } else {
          try {
            $rootScope.menus = await api.menus.find({})
          } catch(err) {
            console.log('Error fetching menu data', err);
          }
          autoSaveSessionSnapshot.menus = angular.copy($rootScope.menus)
        }

        lastPageUndoData2 = angular.copy($rootScope.menus)

        $rootScope.$emit('cms.fetchExtensionData')

        $rootScope.$emit('cms.updateView')
      } catch(err) {
        console.log('Error toggling edit mode', err)
      }
    })

    $scope.$onRootScope('cms.addRecentEditLink', _.debounce(function(event, recentLink) {

      if(!recentLink) { return false; }



      for (var i = 0; i < recentUrls.length; i++) {
        if(recentLink === recentUrls[i] && recentLink.indexOf('/missing') === -1) {
          return false
        }
      }

      if(recentUrls.length > 2) {
        recentUrls[0] = recentLink
      } else {
        recentUrls.unshift(recentLink)
      }

      localStorage.setItem('previousEditUrls', JSON.stringify(recentUrls))

      $timeout(() => {
        self.previousEditUrls = recentUrls
      });

    }, 1000))

    $scope.$onRootScope('cms.returnToAutoSave', async function() {
      $scope.pageAnimation = 'shake'
      try {
        let pageAutoSaveData = await api.staging.find({key: $rootScope.page.url})
        pageAutoSaveData = pageAutoSaveData[0]

        mergeInAutoSaveData(pageAutoSaveData)

        let menusStagingData = await api.staging.find({key: 'menus'})
        menusStagingData = menusStagingData[0]

        if(menusStagingData && menusStagingData.data) {
          $rootScope.menus = menusStagingData.data
        }

        document.title = $rootScope.page.tabTitle
        jQuery('meta[name=description]').attr('content', $rootScope.page.description)

        $rootScope.$emit('cms.updateView')
      } catch(err) {
        console.log('Error returning to auto save data', err);
      }
    })


    $scope.$onRootScope('cms.deleteTrashContent', function(event, list) {
      let yes = window.confirm("Are you sure you want to remove this item?")
      if(yes) {
        let type = 'draggable'
        let draggable = $('.mb-drag-trash-can').find('.mb-draggable')

        if(!draggable.length) {
          type = 'inner'
          draggable = $('.mb-drag-trash-can').find('.mb-inner-draggable')
        }

        if(!draggable.length) {
          type = 'submenu'
          draggable = $('.mb-drag-trash-can').find('.mb-sub-draggable')
        }

        if(draggable.length) {
          let item = angular.element(draggable).scope()

          if(item) {
            if(type === 'inner') {
              let parent = item.$parent
              if(parent.listItem && parent.listItem.data && parent.listItem.data.items) {
                let list = parent.listItem.data.items
                if(item.$index > -1) {
                  list.splice(item.$index, 1)
                }
              }
            } else if(type === 'submenu') {
              let parent = item.$parent.$parent
              if(parent.menu && parent.menu.subMenus && parent.menu.subMenus) {
                let list = parent.menu.subMenus
                if(item.$index > -1) {
                  list.splice(item.$index, 1)
                }
              }
            } else {

              if(!list) {
                toastr.warning('Sorry something went wrong and we could not delete that item.')
                return false
              }

              if(item.listItem && item.listItem.group) {
                let index = list[item.listItem.group].indexOf(item.listItem)
                if(index > -1) {
                  list[item.listItem.group].splice(index, 1)
                }
              } else if(item.menu && item.menu.group) {
                let index = list[item.menu.group].indexOf(item.menu)
                if(index > -1) {
                  list[item.menu.group].splice(index, 1)
                }
              }
            }
          }
        }

      } else {
        console.log('updating view');
        $rootScope.$emit('cms.fetchExtensionData')
        $rootScope.$emit('cms.pullAutoSaveData')
        $rootScope.$emit('cms.updateView')
      }

      $('.mb-drag-trash-can').html('<i class="fa fa-trash fa-3x"></i>')
    })

    $scope.$onRootScope('cms.updateMenusToReflectPages', async () => {

      let {placeholderTitle, menuTitle, url} = convertUrlToTitle($rootScope.page.url)

      let content
      if(placeholderTitle) {
        content = {url: $rootScope.page.url}
      } else {
        content = {url: $rootScope.page.url}
      }
      try {
        let response = await api.menus.update({linkTo: $rootScope.page._id }, content)
        $rootScope.menus = await api.menus.find({})
      } catch(err) {
        console.log('Error updating menus to reflect page', err);
      }
    })

    this.preview = function() {
      this.toggleEdit(false)
    }

    this.resetDraft = function() {
      let confirmResetDraft = window.confirm('Are you sure you want to undo all changes since the last time changes were published?');
      if(confirmResetDraft){
        $rootScope.$emit('cms.returnToSnapshot')
        $rootScope.$emit('cms.resetDraft')
      }
    }

    $scope.$onRootScope('cms.finishedResetingDraft', function(event, successful) {
      if(successful) {
        $rootScope.$emit('cms.updateView')
        $rootScope.$emit('cms.takePageSnapshot', true)
        autoSaveSessionSnapshot = {}
        $rootScope.$emit('cms.updateTemplate')
        toastr.success('Changes since last published date have been removed')
      }
    })

		// Creates a new page and prompts the user for a url
		this.createPage = function(e) {
			// Prepare new page default text based on url
			// var url = prompt('url');
      var self = this;
      var modalInstance = $modal.open({
		    templateUrl: require('./choose-link.modal.jade'),
		    controller: function($scope, $modalInstance) {

          $scope.url = '';

          $scope.choose = function(link) {
            if(!link) { return false; }
            let {url} = convertUrlToTitle(link)
            api.pages.find({url: url}).then(function(response) {
              if(response.length > 0) {
                toastr.warning('Sorry but a page with that link name already exists.')
              } else {
                $modalInstance.close(url);
              }
            }, function(err) {
              $modalInstance.dismiss('cancel');
              toastr.warning("Sorry but there was an error and that page could not be created.");
            });

          };

		    	$scope.cancel = function () {
		    	  $modalInstance.dismiss('cancel');
		    	};
		    },
		    size: 'sm'
		  });

      modalInstance.result.then(function (url) {
        if(url === null || url === undefined) { return false; }

  			self.toggleEdit(true);
  			// Prepares some default values for the page
  			prepareDefaultPage(url, e);
      });
		};

		// This opens the modal for changing page properties such as tabTitle and page description.
		this.editPageModal = async () => {
		  var modalInstance = $modal.open({
		    templateUrl: require('./editmodal.modal.jade'),
		    controller: function($scope, $modalInstance) {
          $scope.templateOptions = [];

          api.themes.find({active: true, $select: ['templates']}).then(function(response) {
            $scope.templateOptions = Object.keys(response[0].templates);
          }, function(err) {
            toastr.error("Sorry but something is wrong with the server and you can't choose templates for your pages.")
          });

          $scope.updatePageTitle = linkUrl => {
            if(linkUrl === '/') {
              $rootScope.page.title = 'Home'
            } else {
              let {placeholderTitle, menuTitle, url} = convertUrlToTitle(linkUrl)
              $rootScope.page.title = placeholderTitle
              $rootScope.page.url = url
            }
          }

		    	$scope.save = function () {
            $rootScope.$emit('cms.elementsChanged')
		    	  $modalInstance.dismiss('cancel')
            toastr.success('The page settings were updated')
		    	};
		    },
		    size: 'md'
		  });
		};

    this.updateTemplate = function(template) {
      $rootScope.page.template = template
      $rootScope.$emit('cms.elementsChanged')
      this.hideScreenshot(template)

      let finishedAutoSavingListener
      finishedAutoSavingListener = $scope.$onRootScope('cms.finishedAutoSaving', function(event, successful) {
        finishedAutoSavingListener()
        $rootScope.$emit('cms.updateTemplate')
      })
    }

		this.publishChanges = function() {
			// This event calls the edit directive to save it's values and the main.controller to erase and rewrite all the menus
      var oneTimeFinishPagesListener = $scope.$onRootScope('cms.finishPublishPages', function() {
        oneTimeFinishPagesListener();
        $rootScope.$emit('cms.takePageSnapshot', true)
      })
      $rootScope.$emit('cms.addRecentEditLink', $rootScope.page.url)
			$rootScope.$emit('cms.publishChanges', $rootScope.page, true)
			$rootScope.$emit('cms.publishExtensionData')
      autoSaveSessionSnapshot = {}
      lastPageUndoData2 = angular.copy($rootScope.page)
		};

    $scope.$onRootScope('cms.finishPublishPages', function() {
      $rootScope.$emit('cms.updateMenusToReflectPages')
    })

		this.undoSession = function() {
      // $rootScope.$emit('cms.stopPageListener')
      $rootScope.$emit('cms.autoSave', autoSaveSessionSnapshot.page, autoSaveSessionSnapshot.menus)
      let finishedAutoSavingListener = $scope.$onRootScope('cms.finishedAutoSaving', function(event, successful) {
        finishedAutoSavingListener()
        if(successful) {
          $rootScope.$emit('cms.returnToAutoSave')
          toastr.warning('Changes have been discarded')
        } else {
          toastr.warning('Opps something went wrong and we could not undo your changes. Try undoing them manually.')
        }
      })
		}

		this.undoMoment = function() {
      lastPageUndoData2 = lastPageUndoData
      lastMenuUndoData2 = lastMenuUndoData
      if(lastPageUndoData) {
        $rootScope.page = angular.copy(lastPageUndoData)
      }

      if(lastMenuUndoData) {
        $rootScope.menus = angular.copy(lastMenuUndoData)
      }

      $rootScope.$emit('cms.updateView')
		}

		this.deletePage = async function() {
      let areYouSure = confirm("Are you sure you want to delete this page?")

      if(!areYouSure) { return false }
			this.toggleEdit(true);
			if(!$rootScope.page._id) { return false; }

      try {
        await api.pages.delete({_id: $rootScope.page._id})
      } catch(err) {
        console.log('Trouble deleting page', err);
      }

      try {
        let url
        if($rootScope.page.url.charAt(0) !== '/') { url = '/' + $rootScope.page.url; } else { url = $rootScope.page.url; }

        await api.staging.delete({key: url})

        // console.log('deleting menus', url);
        // await api.menus.delete({url: url})

        $rootScope.$emit('cms.pullAutoSaveData')

        // Refresh menus in case a menu was removed while removing this page
      } catch(err) {
        console.log('Error deleting menu and staging', err);
      }

      $timeout(function() {
        $location.url('/');
      });


			// Delete page
			// api.pages.delete({_id: $rootScope.page._id}).then(function() {
			// 	// Delete menu with the same url
			// 	var url;
			// 	if($rootScope.page.url.charAt(0) !== '/') { url = '/' + $rootScope.page.url; } else { url = $rootScope.page.url; }
      //
      //   api.staging.delete({key: url}).then(function(response) {
      //     console.log('Deleting autosave data for that page', response);
      //   }, function(err) {
      //     console.log('Could not delete auto save data for that page', err);
      //   });
			// 	api.menus.delete({url: url}).finally(function() {
			// 		// Replenish menus
			// 		api.menus.find({}).then(function(response) {
			// 			$rootScope.menus = response;
			// 		});
			// 	});
      //
			// 	$location.url('/');
			// });
		};

		this.togglePublishPage = function() {
			if(!$rootScope.page._id) { return false; }
      let answer
      if(!$rootScope.page.published)
        answer = confirm('Are you sure you want to publish the page where everyone can see it and notify subscribers?')
      else
        answer = confirm('Are you sure you want to unpublish this page and hide it from the public?')
      if(!answer) { return false }
			$rootScope.page.published = !$rootScope.page.published;
			var pageUrl = $rootScope.page.url;
			if($rootScope.page.url.charAt(0) !== '/') { pageUrl = '/' + pageUrl; }
			helpers.loopThroughMenus(function(item) {
				if(item && item.url === pageUrl) {
					item.published = $rootScope.page.published;
				}
			});
			if($rootScope.page.published) {
				toastr.clear();
        lastPageUndoData2 = angular.copy($rootScope.page)
        $rootScope.$emit('cms.publishExtensionData')
				toastr.success('Visitors can now see this page.')
			} else {
				toastr.warning('Only users with permission to edit pages can see this page.');
			}

      api.menus.update({url: $rootScope.page.url}, {published: $rootScope.page.published}).then(() => {}, err => {
        console.log("Error publishing menu", err);
        toastr.warning('There was an error and the menu for this page could not be published. Try unpublishing and publishing the page again.')
      });

      $rootScope.$emit('cms.publishChanges');

      if($rootScope.page.published) {
        $rootScope.page.publishedOn = Date.now();
      }

			this.toggleEdit(true);
		};

		this.currentScreenshot = null;

		this.showScreenshot = function(template) {
			if(!window.meanbaseGlobals.themeTemplatePaths[template]) { return false; }
			var screenshot = window.meanbaseGlobals.themeTemplatePaths[template].screenshot;
			if(screenshot) {
        try {
          document.body.removeChild(self.currentScreenshot);
        } catch(err) {}
				this.currentScreenshot = document.createElement("div");
				this.currentScreenshot.classList.add('template-screenshot-backdrop');
				var image = new Image();
				image.src = screenshot;
				image.onerror = function() {
					self.hideScreenshot(template);
				};
				image.alt = template + ' screenshot';
				image.classList.add('template-screenshot');
				this.currentScreenshot.appendChild(image);
				document.body.appendChild(this.currentScreenshot);
			}
		};

		this.hideScreenshot = function(template) {
			if(self.currentScreenshot) {
        try {
          document.body.removeChild(self.currentScreenshot);
        } catch(err) {

        }
			}
		};

    function convertUrlToTitle(url) {
      url = url.replace(/[ ]/g, "-")
			var menuTitle = url.replace(/[_-]/g, " ");
			var placeholderTitle = menuTitle.replace(/(^| )(\w)/g, function(x) {
				return x.toUpperCase();
			});
			if((url.charAt(0) == '/')) {
				placeholderTitle = menuTitle.substr(1);
			} else {
				url = '/' + url;
			}
      return { placeholderTitle, menuTitle, url }
    }

		async function prepareDefaultPage(link, e) {
			// Prepare page default text based on url
      let {placeholderTitle, menuTitle, url} = convertUrlToTitle(link)

			// Prepare the template
			var newPage = {
        author: $scope.currentUser.name,
        editability: $scope.currentUser.role,
        visibility: $scope.currentUser.role,
        url: url,
        tabTitle: placeholderTitle,
        template: $(e.currentTarget).text().replace(' template', ''),
        title: placeholderTitle,
        summary: "Summary of " + placeholderTitle + ".",
        description: "The description that will show up on facebook feeds and google searches.",
        updated: Date.now()
			};

      try {
        await api.pages.create(newPage)
      } catch(err) {
        console.log('Error creating page and menu', err);
      }

      $rootScope.$emit('cms.addRecentEditLink', newPage.url)

      $timeout(function() {
        $location.url(url);
      }, 0, false);
		}
	}
})();

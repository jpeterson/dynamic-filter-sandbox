///////////////////////////////////////////////////////////////////////////
// Copyright © 2014 Esri. All Rights Reserved.
//
// Licensed under the Apache License Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
///////////////////////////////////////////////////////////////////////////

define([
  'dojo/_base/declare',
  'dojo/_base/lang',
  'dojo/_base/array',
  'dojo/_base/kernel',
  'dojo/topic',
  'dojo/aspect',
  'dojo/i18n',
  'dojo/Deferred',
  'dojo/promise/all',
  './utils',
  './portalUtils',
  'esri/IdentityManagerBase',
  'esri/config',
  'esri/tasks/GeometryService',
  'esri/request'
],
function (declare, lang, array, kernel, topic, aspect, i18n, Deferred, all, utils, portalUtils, IdentityManagerBase, esriConfig, GeometryService, esriRequest) {
  var instance = null, clazz;
  
  /* global jimuConfig */

  function visitElement(config, cb){
  //the cb signature: cb(element, index, groupId, isPreload), the groupId can be: groupId, preloadWidgets, widgetPool
    var i, j;
    if(config.preloadWidgets){
      if(config.preloadWidgets.groups){
        for(i = 0; i < config.preloadWidgets.groups.length; i++){
          if(cb(config.preloadWidgets.groups[i], i, config.preloadWidgets.groups[i].id, true)){
            break;
          }
          for(j = 0; j < config.preloadWidgets.groups[i].widgets.length; j++){
            if(cb(config.preloadWidgets.groups[i].widgets[j], j, config.preloadWidgets.groups[i].id, true)){
              break;
            }
          }
        }
      }

      if(config.preloadWidgets.widgets){
        for(i = 0; i < config.preloadWidgets.widgets.length; i++){
          if(cb(config.preloadWidgets.widgets[i], i, 'preloadWidgets', true)){
            break;
          }
        }
      }
    }

    if(config.widgetPool){
      if(config.widgetPool.groups){
        for(i = 0; i < config.widgetPool.groups.length; i++){
          if(cb(config.widgetPool.groups[i], i, config.widgetPool.groups[i].id, false)){
            break;
          }
          for(j = 0; j < config.widgetPool.groups[i].widgets.length; j++){
            if(cb(config.widgetPool.groups[i].widgets[j], j, config.widgetPool.groups[i].id, false)){
              break;
            }
          }
        }
      }

      if(config.widgetPool.widgets){
        for(i = 0; i < config.widgetPool.widgets.length; i++){
          if(cb(config.widgetPool.widgets[i], i, 'widgetPool', false)){
            break;
          }
        }
      }
    }
  }

  function getConfigElementById(config, id){
    var c;
    if(id === 'map'){
      return config.map;
    }
    visitElement(config, function(e){
      if(e.id === id){
        c = e;
        return true;
      }
    });
    return c;
  }

  function addElementId(config){
    var maxId = 0, i;

    visitElement(config, function(e){
      if(!e.id){
        return;
      }
      var li = e.id.lastIndexOf('_');
      if(li > -1){
        i = e.id.substr(li + 1);
        maxId = Math.max(maxId, i);
      }
    });

    visitElement(config, function(e){
      if(!e.id){
        maxId ++;
        e.id = e.uri? (e.uri + '_' + maxId): (''  + '_' + maxId);
      }
    });
  }

  function processNoUriWidgets(config){
    var i = 0;
    visitElement(config, function(e){
      if(!e.widgets && !e.uri){
        i ++;
        e.placeholderIndex = i;
      }
    });
  }

  function getWidgetNameFromUri(uri) {
    var segs = uri.split('/');
    segs.pop();
    return segs.pop();
  }

  function getCleanConfig(config){
    //delete the properties that framework add
    var newConfig = lang.clone(config);
    var properties = ['inPanel', 'isController', 'hasLocale', 'hasStyle', 'hasConfig', 'hasUIFile', 'hasSettingPage', 'hasSettingUIFile', 'hasSettingLocale', 'hasSettingStyle'];

    newConfig.locale = config.rawConfig.locale;
    delete newConfig.mode;
    visitElement(newConfig, function(e){
      if(e.widgets){
        delete e.isPreload;
        delete e.gid;
        delete e.icon;
        delete e.openType;
        return;
      }
      delete e.panel;
      delete e.folderUrl;
      delete e.amdFolder;
      delete e.thumbnail;
      delete e.configFile;
      delete e.gid;
      delete e.isPreload;
      properties.forEach(function(p){
        delete e[p];
      });
      if(e.icon && !e.icon.startWith('data') && !e.originIcon){
        delete e.icon;
      }
      if(e.visible){
        delete e.visible;
      }
    });
    if(!config.rawConfig.locale){
      delete newConfig.locale;
    }
    delete newConfig.rawConfig;
    //the _ssl property is added by esriRequest
    delete newConfig._ssl;
    //delete all of the methods
    delete newConfig.getConfigElementById;
    delete newConfig.processNoUriWidgets;
    delete newConfig.addElementId;
    delete newConfig.getCleanConfig;
    delete newConfig.visitElement;

    delete newConfig.agolConfig;

    return newConfig;
  }

  clazz = declare(null, {
    urlParams: null,
    config: null,
    rawConfig: null,
    configFile: null,
    _configLoaded: false,

    constructor: function (urlParams) {
      this._removeHash(urlParams);
      this.urlParams = urlParams || {};

      this.nls = i18n.getLocalization('jimu', 'main');
      this.listenBuilderEvents();

      if(this.urlParams.mode === 'config' && window.parent.setConfigViewerTopic &&
        lang.isFunction(window.parent.setConfigViewerTopic)){
        window.parent.setConfigViewerTopic(topic);
      }
      if(this.urlParams.mode === 'preview' && window.parent.setPreviewViewerTopic &&
        lang.isFunction(window.parent.setPreviewViewerTopic)){
        window.parent.setPreviewViewerTopic(topic);
      }
    },

    listenBuilderEvents: function(){
      //whatever(app, map, widget, widgetPoolChanged) config changed, publish this event.
      //*when app changed, the id is "app", the data is app's properties, like title, subtitle.
      //*when map changed, the id is "map", the data is itemId
      //*when widget that is in preloadwidget/widgetpool changed, the id is widget's id,
      //  the data is widget's setting
      //*when anything in the widget pool changed, the id is "widgetPool", the data is
      //  widgets and groups
      topic.subscribe('configChanged', lang.hitch(this, this.onConfigChanged));

      topic.subscribe('resetConfig', lang.hitch(this, this.onConfigReset));

      topic.subscribe('themeChanged', lang.hitch(this, this.onThemeChanged));
      //be published when layout in the same theme changed.
      topic.subscribe('layoutChanged', lang.hitch(this, this.onLayoutChanged));
      //be published when style in the same theme changed.
      topic.subscribe('styleChanged', lang.hitch(this, this.onStyleChanged));
    },

    loadConfig: function () {
      console.time('Load Config');

      var def, configDef = new Deferred();
      if(this.urlParams.config) {
        this.configFile = this.urlParams.config;
      } else {
        this.configFile = "config.json";
      }

      // if(this.configFile.startWith('//') || this.configFile.startWith('http://') ||
      //     this.configFile.startWith('https://')){
      //   //don't work because of cross domain
      //   def = script.get(this.configFile);
      // }else{
      //   def = xhr(this.configFile, {handleAs: 'json'});
      // }

      if(this.urlParams.mode === 'preview'){
        //in preview mode, the config is set by the builder.
        return;
      }
      def = esriRequest({
        url: this.configFile,
        preventCache: true
      });
      def.then(lang.hitch(this, function (data) {
        var err = this.checkConfig(data);
        if(err){
          topic.publish("appConfigLoadError", err);
          // this.showError(err);
          console.log(err);
          return;
        }
        this.rawConfig = lang.clone(data);
               
        this.config = this.postProcess(data);

        this._loadWidgetsManifest(this.config).then(lang.hitch(this, function(){
          //url has appid parameter means open app in AGOL's template config page
          //merge the AGOL's template config parameters into the config.json
          if(this.urlParams.appid){
            this._mergeConfigFromTemplate().then(lang.hitch(this, function(){
              this._configLoaded = true;
              console.timeEnd('Load Config');
              topic.publish("appConfigLoaded", this.getConfig());
              configDef.resolve(this.getConfig());
            }));
          } else {
            this._configLoaded = true;
            console.timeEnd('Load Config');
            topic.publish("appConfigLoaded", this.getConfig());
            configDef.resolve(this.getConfig());
          }
        }));
        
      }));
        
      return configDef;
    },

    onThemeChanged: function(theme){
      this._getAppConfigFromTheme(theme).then(lang.hitch(this, function(config){
        this.config = config;
        topic.publish('appConfigChanged', this.getConfig(), 'themeChange');
      }));
    },

    onLayoutChanged: function(layout){
      //summary:
      //    layouts in the same theme should have the same:
      //      1. count of preload widgets, count of preload widget groups (if not same, we just ignore the others)
      //      2. app properties (if not same, we just ignore the new layout properties)
      //      3. map config (if not same, we just ignore the new layout properties)
      //    can only have these differrences:
      //      1. panel, 2. position, 3, predefined widgets
      var layoutConfig = layout.layoutConfig;

      if(layoutConfig.preloadWidgets){
        //copy preload widget panel
        if(layoutConfig.preloadWidgets.panel && layoutConfig.preloadWidgets.panel.uri){
          this.config.preloadWidgets.panel.uri = layoutConfig.preloadWidgets.panel.uri;
        }
        
        //copy preload widget position
        array.forEach(layoutConfig.preloadWidgets.widgets, function(widget, i){
          if(this.config.preloadWidgets.widgets[i] && layoutConfig.preloadWidgets.widgets[i]){
            if(layoutConfig.preloadWidgets.widgets[i].position){
              this.config.preloadWidgets.widgets[i].position = layoutConfig.preloadWidgets.widgets[i].position;
            }
            if(layoutConfig.preloadWidgets.widgets[i].positionRelativeTo){
              this.config.preloadWidgets.widgets[i].positionRelativeTo = layoutConfig.preloadWidgets.widgets[i].positionRelativeTo;
            }

            this.config.preloadWidgets.widgets[i].panel = {
              uri: this.config.preloadWidgets.panel.uri,
              position: this.config.preloadWidgets.widgets[i].position,
              positionRelativeTo: this.config.preloadWidgets.widgets[i].positionRelativeTo
            };
          }
        }, this);
        //copy preload group panel
        array.forEach(layoutConfig.preloadWidgets.groups, function(group, i){
          if(this.config.preloadWidgets.groups[i] && layoutConfig.preloadWidgets.groups[i] && layoutConfig.preloadWidgets.groups[i].panel){
            this.config.preloadWidgets.groups[i].panel = layoutConfig.preloadWidgets.groups[i].panel;
          }
        }, this);
      }
      
      if(layoutConfig.map){
        //copy map position
        this.config.map.position = layoutConfig.map.position;
      }

      if(layoutConfig.widgetPool){
        //copy pool widget panel
        if(layoutConfig.widgetPool.panel){
          this.config.widgetPool.panel = layoutConfig.widgetPool.panel;
        }
        //copy pool group panel
        array.forEach(layoutConfig.widgetPool.groups, function(group, i){
          if(this.config.widgetPool.groups[i] && layoutConfig.widgetPool.groups[i] && layoutConfig.widgetPool.groups[i].panel){
            this.config.widgetPool.groups[i].panel = layoutConfig.widgetPool.groups[i].panel;
          }
        }, this);
      }
      
      topic.publish('appConfigChanged', this.getConfig(), 'layoutChange');
    },

    onStyleChanged: function(style){
      this.config.theme.styles = this._genStyles(this.config.theme.styles, style.name);
      topic.publish('appConfigChanged', this.getConfig(), 'styleChange');
    },

    _mergeConfigFromTemplate: function(){
      var i, def = new Deferred();
      var portal = portalUtils.getPortal(this.config.portalUrl);
      portal.getItemData(this.urlParams.appid).then(lang.hitch(this, function(response) {
        this.config.agolConfig = response;
        this.config.map.itemId = response.values.webmap;

        function reorderWidgets(widgetArray) {
          var tempWidgets = [];
          array.forEach(widgetArray, function(widget) {
            if (widget) {
              tempWidgets.push(widget);
            }
          }, this);
          return tempWidgets;
        }

        for (var key in response.values) {
          if (key !== "webmap") {
            utils.setConfigByTemplate(this.config, key, response.values[key]);
          }
        }
        //reorderWidgets 
        this.config.widgetPool.widgets = reorderWidgets(this.config.widgetPool.widgets);
        this.config.preloadWidgets.widgets = reorderWidgets(this.config.preloadWidgets.widgets);
        if (this.config.widgetPool.groups) {
          for (i = 0; i < this.config.widgetPool.groups.length; i++) {
            this.config.widgetPool.groups[i].widgets = reorderWidgets(this.config.widgetPool.groups[i].widgets);
          }
        }
        if (this.config.preloadWidgets.groups) {
          for (i = 0; i < this.config.preloadWidgets.groups.length; i++) {
            this.config.preloadWidgets.groups[i].widgets = reorderWidgets(this.config.preloadWidgets.groups[i].widgets);
          }
        }
        def.resolve();
      }), lang.hitch(this, function(err) {
        console.error(err);
        def.reject(err);
      }));
      // aspect.after(portal, 'onLoad', lang.hitch(this, function() {
      //   portal.getItemDataById(this.urlParams.appid).then(lang.hitch(this, function(response) {
          
      //   }), function(err){
          
      //   });
      // }));
      return def;
    },

    _removeHash: function(urlParams){
      for(var p in urlParams){
        if(urlParams[p]){
          urlParams[p] = urlParams[p].replace('#', '');
        }
      }
    },

    _genStyles: function(allStyle, currentStyle){
      var styles = [];
      styles.push(currentStyle);
      array.forEach(allStyle, function(_style){
        if(styles.indexOf(_style) < 0){
          styles.push(_style);
        }
      });
      return styles;
    },

    _getAppConfigFromTheme: function(theme){
      var def = new Deferred();
      //theme has already appConfig object, use it
      if(theme.appConfig){
        def.resolve(theme.appConfig);
        return def;
      }
      //use layout and style to create a new appConfig, which may contain some place holders
      var config, styles = [];
      var layout = theme.getCurrentLayout();
      var style = theme.getCurrentStyle();

      config = lang.clone(this.getConfig()).getCleanConfig();

      this.processUrlParams(config);
      
      delete config.widgetManifestsMerged;
      //for deferrent layouts that in the same theme, only these properties can be diferrent.
      config.preloadWidgets = layout.layoutConfig.preloadWidgets;
      config.widgetPool = layout.layoutConfig.widgetPool;
      if(layout.layoutConfig.map && layout.layoutConfig.map.position){
        config.map.position = layout.layoutConfig.map.position;
      }

      //put all styles into the style array, and the current style is the first element
      styles = this._genStyles(array.map(theme.getStyles(), function(style){
        return style.name;
      }), style.name);
      config.theme = {
        name: theme.getName(),
        styles: styles
      };

      this._addNeedValues(config);

      this._loadWidgetsManifest(config).then(function(){
        def.resolve(config);
      });
      return def;
    },

    getConfig: function () {
      var c = lang.clone(this.config);

      c.rawConfig = this.rawConfig;
      c.getConfigElementById = function(id){
        return getConfigElementById(this, id);
      };

      c.processNoUriWidgets = function(){
        processNoUriWidgets(this);
      };

      c.addElementId = function(){
        addElementId(this);
      };

      c.getCleanConfig = function(){
        return getCleanConfig(this);
      };

      c.visitElement = function(cb){
        visitElement(this, cb);
      };
      return c;
    },

    onConfigReset: function(c){
      //summary:
      //  this method may be called by builder or UT
      c = utils.reCreateArray(c);
      if(this.config){
        this.config = c;
        topic.publish('appConfigChanged', this.getConfig(), 'resetConfig', c);
      }else{
        this.config = c;
        topic.publish("appConfigLoaded", this.getConfig());
      }
    },

    _addNeedValues: function(config){
      processNoUriWidgets(config);
      addElementId(config);
      this.addDefaultValues(config);
    },

    postProcess: function(config){
      this.processUrlParams(config);
      this._addNeedValues(config);
      if(config.httpProxy){
        esriConfig.defaults.io.proxyUrl = config.httpProxy;
      }

      IdentityManagerBase.tokenValidity = 60 * 24 * 7;//token is valid in 7 days
      
      //reload the correct nls
      this.nls = i18n.getLocalization('jimu', 'main', config.locale);
      jimuConfig.nls = this.nls;

      return config;
    },

    _loadWidgetsManifest: function(config){
      var defs = [], def = new Deferred();
      if(config.widgetManifestsMerged){
        this._loadMergedWidgetManifests().then(lang.hitch(this, function(manifests){
          visitElement(config, lang.hitch(this, function(e){
            if(!e.widgets && e.uri){
              if(!manifests[e.uri].label){
                manifests[e.uri].label = manifests[e.uri].name;
              }
              if(!e.label){
                e.label = manifests[e.uri].label;
              }
              this._addNeedValuesForManifest(manifests[e.uri]);
              lang.mixin(e, manifests[e.uri].properties);
            }
          }));
          def.resolve(manifests);
        }));
      }else{
        visitElement(config, lang.hitch(this, function(e){
          if(!e.widgets && e.uri){
            defs.push(this._loadWidgetManifest(e));
          }
        }));
        all(defs).then(function(manifests){
          var ret = {};
          array.forEach(manifests, function(manifest){
            lang.mixin(ret, manifest);
          });
          def.resolve(ret);
        }, function(){
          //we ignore this error because we don't want the individual widget error
          //block the whole loading progress
          def.resolve(null);
        });
      }

      setTimeout(function(){
        if(!def.isResolved()){
          def.resolve(null);
        }
      }, jimuConfig.timeout);
      return def;
    },

    _loadMergedWidgetManifests: function(){
      //widget-manifests.json is in the same folder as the config.json
      var file;
      if(this.configFile.indexOf('/') < 0){
        file = 'widget-manifests.json';
      }else{
        var segs = this.configFile.split('/');
        segs.pop();
        file = segs.join('/') + '/widget-manifests.json';
      }
      return esriRequest({
        url: file
      });
    },

    _loadWidgetManifest: function(setting){
      var def = new Deferred();
      esriRequest({
        url: setting.folderUrl + '/manifest.json'
      }).then(lang.hitch(this, function(manifest){
        if(!manifest.label){
          manifest.label = manifest.name;
        }
        this._addNeedValuesForManifest(manifest);
        lang.mixin(setting, manifest.properties);
        if(!setting.label){
          setting.label = manifest.label;
        }
        var ret = {};
        ret[setting.uri] = manifest;
        def.resolve(ret);
      }), function(err){
        def.reject(err);
      });

      return def;
    },

    _addNeedValuesForManifest: function(manifest){
      if(typeof manifest.properties === 'undefined'){
        manifest.properties = {};
      }
      if(typeof manifest.properties.inPanel === 'undefined'){
        manifest.properties.inPanel = true;
      }
      if(typeof manifest.properties.isController === 'undefined'){
        manifest.properties.isController = false;
      }
    },

    _addDefaultPortalUrl: function(config){
      if(typeof config.portalUrl === 'undefined'){
        config.portalUrl = 'http://www.arcgis.com/';
      }
      if(config.portalUrl && config.portalUrl.substr(config.portalUrl.length - 1) !== '/'){
        config.portalUrl += '/';
      }
    },

    _addDefaultGeometryService: function(config){
      if(!config.geometryService){
        config.geometryService = {};
      }
      if(!config.geometryService.url){
        esriRequest({
          url: config.portalUrl + 'sharing/rest/portals/self?f=json'
        }).then(function(result){
          config.geometryService.url = result.helperServices.geometry.url;
          esriConfig.defaults.geometryService = new GeometryService(config.geometryService.url);
        }, function(err){
          console.log(err);
        });
      }else{
        esriConfig.defaults.geometryService = new GeometryService(config.geometryService.url);
      }
    },

    _addDefaultLocal: function(config){
      if(!config.locale){
        config.locale = kernel.locale;
      }
    },

    _addDefaultStyle: function(config){
      if(config.theme){
        if(!config.theme.styles || config.theme.styles.length === 0){
          config.theme.styles = ['default'];
        }
      }
    },

    _addDefaultMap: function(config){
      config.map.id = 'map';

      if(typeof config.map['3D'] === 'undefined' && typeof config.map['2D'] === 'undefined'){
        config.map['2D'] = true;
      }

      if(typeof config.map.position === 'undefined'){
        config.map.position = {
          left: 0,
          right: 0,
          top: 0,
          bottom: 0
        };
      }
    },

    _addDefaultVisible: function(config){
      visitElement(config, function(e){
        if(e.visible === undefined){
          e.visible = true;
        }
      });
    },

    _addDefaultPanelAndPosition: function(config){
      var i, j;
      //panel
      if(typeof config.preloadWidgets.panel === 'undefined' || typeof config.preloadWidgets.panel.uri === 'undefined'){
        config.preloadWidgets.panel = {uri: 'jimu/BaseWidgetPanel', positionRelativeTo: 'map'};
      }else if(typeof config.preloadWidgets.panel.positionRelativeTo === 'undefined'){
        config.preloadWidgets.panel.positionRelativeTo = 'map';
      }

      if(typeof config.widgetPool.panel === 'undefined' || typeof config.widgetPool.panel.uri === 'undefined'){
        config.widgetPool.panel = {uri: 'jimu/BaseWidgetPanel', positionRelativeTo: 'map'};
      }else if(typeof config.widgetPool.panel.positionRelativeTo === 'undefined'){
        config.widgetPool.panel.positionRelativeTo = 'map';
      }

      if(config.preloadWidgets.widgets){
        for(i = 0; i < config.preloadWidgets.widgets.length; i++){
          if(!config.preloadWidgets.widgets[i].position){
            config.preloadWidgets.widgets[i].position = {
              left: 0,
              top: 0
            };
          }
          if(!config.preloadWidgets.widgets[i].positionRelativeTo){
            config.preloadWidgets.widgets[i].positionRelativeTo = 'map';
          }
          if(!config.preloadWidgets.widgets[i].panel){
            config.preloadWidgets.widgets[i].panel = lang.clone(config.preloadWidgets.panel);
            config.preloadWidgets.widgets[i].panel.position = config.preloadWidgets.widgets[i].position;
            config.preloadWidgets.widgets[i].panel.positionRelativeTo = config.preloadWidgets.widgets[i].positionRelativeTo;
          }
        }
      }

      if(config.preloadWidgets.groups){
        for(i = 0; i < config.preloadWidgets.groups.length; i++){
          if(!config.preloadWidgets.groups[i].position){
            config.preloadWidgets.groups[i].position = {
              left: 0,
              top: 0
            };
          }
          
          if(!config.preloadWidgets.groups[i].panel){
            config.preloadWidgets.groups[i].panel = config.preloadWidgets.panel;
          }

          for(j = 0; j < config.preloadWidgets.groups[i].widgets.length; j++){
            config.preloadWidgets.groups[i].widgets[j].panel = config.preloadWidgets.groups[i].panel;
          }
        }
      }

      if(config.widgetPool){
        if(config.widgetPool.groups){
          for(i = 0; i < config.widgetPool.groups.length; i++){
            if(!config.widgetPool.groups[i].panel){
              config.widgetPool.groups[i].panel = config.widgetPool.panel;
            }else if(!config.widgetPool.groups[i].panel.positionRelativeTo){
              config.widgetPool.groups[i].panel.positionRelativeTo = 'map';
            }

            for(j = 0; j < config.widgetPool.groups[i].widgets.length; j++){
              config.widgetPool.groups[i].widgets[j].panel = config.widgetPool.groups[i].panel;
            }
          }
        }
        
        if(config.widgetPool.widgets){
          for(i = 0; i < config.widgetPool.widgets.length; i++){
            if(!config.widgetPool.widgets[i].panel){
              config.widgetPool.widgets[i].panel = config.widgetPool.panel;
            }
          }
        }
      }
    },

    _addDefaultOfWidgetGroup: function(config){
      //group/widget labe, icon
      visitElement(config, lang.hitch(this, function(e, i, gid, isPreload){
        e.isPreload = isPreload;
        if(e.widgets){
          //it's group
          e.gid = e.id;
          if(e.widgets.length === 1){
            if(!e.label){
              e.label = e.widgets[0].label? e.widgets[0].label: 'Group';
            }
            if(!e.icon){
              if(e.widgets[0].uri){
                e.icon = this._getDefaultIconFromUri(e.widgets[0].uri);
              }else{
                e.icon = 'jimu.js/images/group_icon.png';
              }
            }
          }else{
            e.icon = e.icon? e.icon: 'jimu.js/images/group_icon.png';
            e.label = e.label? e.label: 'Group_' + i;
          }
        }else{
          e.gid = gid;
          if(e.uri){
            e.name = getWidgetNameFromUri(e.uri);
            utils.processWidgetSetting(e);
          }
        }
      }));
    },

    _getDefaultIconFromUri: function(uri){
      var segs = uri.split('/');
      segs.pop();
      return segs.join('/') + '/images/icon.png';
    },

    addDefaultValues: function(config) {
      this._addDefaultPortalUrl(config);
      //comment out temporary
      this._addDefaultGeometryService(config);
      this._addDefaultLocal(config);
      this._addDefaultStyle(config);
      this._addDefaultMap(config);
      this._addDefaultVisible(config);

      //preload widgets
      if(typeof config.preloadWidgets === 'undefined'){
        config.preloadWidgets = {};
      }

      if(typeof config.widgetPool === 'undefined'){
        config.widgetPool = {};
      }

      this._addDefaultPanelAndPosition(config);
      this._addDefaultOfWidgetGroup(config);
      //if the first widget or first group doesn't have index property, we add it
      if(config.widgetPool.widgets && config.widgetPool.widgets.length > 0 && config.widgetPool.widgets[0].index === undefined ||
        config.widgetPool.groups && config.widgetPool.groups.length > 0 && config.widgetPool.groups[0].index === undefined){
        this._addIndexForWidgetPool(config);
      }
    },

    _addIndexForWidgetPool: function(config){
      //be default, widgets are in front
      var index = 0, i, j;
      if(config.widgetPool.widgets){
        for(i = 0; i < config.widgetPool.widgets.length; i++){
          config.widgetPool.widgets[i].index = index;
          index ++;
        }
      }

      if(config.widgetPool.groups){
        for(i = 0; i < config.widgetPool.groups.length; i++){
          config.widgetPool.groups[i].index = index;
          index ++;
          for(j = 0; j < config.widgetPool.groups[i].widgets.length; j++){
            config.widgetPool.groups[i].widgets[j].index = j;
          }
        }
      }
    },

    checkConfig: function(config){
      var repeatedId = this._getRepeatedId(config);
      if(repeatedId){
        return 'repeated id:' + repeatedId;
      }
      return null;
    },

    _getRepeatedId: function(config){
      var id = [], ret;
      visitElement(config, function(e){
        if(id.indexOf(e.id) > 0){
          ret = e.id;
          return true;
        }
        id.push(e.id);
      });
      return ret;
    },

    showError: function(err){
      var s = '<div class="jimu-error-code"><span>' + this.nls.errorCode + ':</span><span>' + err.response.status + '</span></div>' +
       '<div class="jimu-error-message"><span>' + this.nls.errorMessage + ':</span><span>' + err.message + '</span></div>' +
       '<div class="jimu-error-detail"><span>' + this.nls.errorDetail + ':</span><span>' + err.response.text + '<span></div>';
      document.body.innerHTML = s;
    },

    processUrlParams: function(config){
      if(this.urlParams.style){
        if(config.theme){
          if(config.theme.styles){
            config.theme.styles.splice(config.theme.styles.indexOf(this.urlParams.style), 1);
            config.theme.styles = [this.urlParams.style].concat(config.theme.styles);
          }else{
            config.theme.styles = [this.urlParams.style];
          }
        }
      }
      if(this.urlParams.locale){
        config.locale = this.urlParams.locale;
      }
      if(this.urlParams.webmap){
        config.map.itemId = this.urlParams.webmap;
      }
      if(this.urlParams.mode){
        config.mode = this.urlParams.mode;
      }
    },
      

    onConfigChanged: function(id, changedData, otherOptions){
      var oldConfig, reason;
      if(id === 'app'){
        lang.mixin(this.config, changedData);
        reason = 'attributeChange';
      }else if(id === 'map'){
        lang.mixin(this.config.map, changedData);
        reason = 'mapChange';
      }else if(id === 'widgetPool'){
        this.config.widgetPool.widgets = changedData.widgets;
        this.config.widgetPool.groups = changedData.groups;

        //TODO we support only one controller for now, so we don't do much here
        // this._processPoolChangeEvent(changedData, otherOptions);
        reason = 'widgetPoolChange';
      }else{
        oldConfig = getConfigElementById(this.config, id);
        //for now, we can add/update property only
        for(var p in changedData){
          oldConfig[p] = changedData[p];
        }
        if(oldConfig.widgets){
          reason = 'groupChange';
        }else{
          reason = 'widgetChange';
        }
      }
      this._addNeedValues(this.config);
      topic.publish('appConfigChanged', this.getConfig(), reason, changedData, otherOptions);
    },

    _processPoolChangeEvent: function(widgetPool, options){
      var controllerId = options.controllerId;
      var controllerSetting = getConfigElementById(controllerId);
      controllerSetting.controlledWidgets = array.map(widgetPool.widgets, function(widget){return widget.label;});
      controllerSetting.controlledGroups = array.map(widgetPool.groups, function(group){return group.label;});
    }

  });

  clazz.getInstance = function (urlParams) {
    if(instance === null) {
      instance = new clazz(urlParams);
    }else{
      instance.urlParams = urlParams;
    }
    return instance;
  };

  clazz.getConfig = function(){
    return clazz.getInstance().config;
  };

  //for debug
  window.getConfig = function(){
    return clazz.getInstance().config;
  };

  return clazz;
});

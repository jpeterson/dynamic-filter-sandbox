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
    'dojo/_base/array',
    'dojo/_base/html',
    'dojo/_base/lang',
    'dojo/dom',
    'dojo/aspect',
    'dijit/_WidgetsInTemplateMixin',
    'jimu/BaseWidget',
    'esri/dijit/Legend'
  ],
  function(
    declare,
    array,
    html,
    lang,
    dom,
    aspect,
    _WidgetsInTemplateMixin,
    BaseWidget,
    Legend) {
    var clazz = declare([BaseWidget, _WidgetsInTemplateMixin], {

      name: 'Legend',
      baseClass: 'jimu-widget-legend',
      layerInfos: [],
      legend: null,
      startup: function() {
        this.inherited(arguments);
        this.config.legend.map = this.map;
        this.config.legend.respectCurrentMapScale = false;
        this.legend = new Legend(this.config.legend, this.legendDiv);
        this.legend.startup();
        this.removeLegendOfBasemap();

        if (this.legend && this.legend._createLegend){
          aspect.after(this.legend, '_createLegend', lang.hitch(this, 'removeLegendOfBasemap'));
        }
      },

      _getBasemap: function() {
        var basemapLayerIds = [];
        var basemapInMap = this.map.getBasemap();

        if (this.map.itemInfo && this.map.itemInfo.itemData){ // created using arcgisUtils.createMap
          array.forEach(this.map.itemInfo.itemData.baseMap.baseMapLayers, function(basemapLayer){
            basemapLayerIds.push(basemapLayer.id);
          });

          array.forEach(this.map.layerIds, lang.hitch(this, function(layerId){
            var layer = this.map.getLayer(layerId);
            if (layer._basemapGalleryLayerType){ // basemapgallery changed
              basemapLayerIds.push(layerId);
            }
          }));
        }else { // created using esri/Map
          array.forEach(this.map.layerIds, lang.hitch(this, function(layerId){
            var layer = this.map.getLayer(layerId);
            if (!layer.isOperationalLayer){
              basemapLayerIds.push(layerId);
            }
          }));
        }
        
        if(basemapInMap) {
          basemapLayerIds.push(basemapInMap);
        }
        return basemapLayerIds;
      },

      removeLegendOfBasemap: function() {
        array.forEach(this._getBasemap(), function(basemap){
          console.log(basemap);
          var baseNode = dom.byId(this.legend.id + '_' + basemap);
          if (baseNode && baseNode.nodeType === 1){
            this.removedDiv.appendChild(baseNode);
          }
          
        }, this);
      }
    });

    return clazz;
  });

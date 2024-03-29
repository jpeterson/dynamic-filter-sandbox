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
    'dijit/_WidgetsInTemplateMixin',
    'jimu/BaseWidgetSetting',
    'dijit/form/NumberTextBox',
    'dijit/form/CheckBox'
  ],
  function(
    declare,
    _WidgetsInTemplateMixin,
    BaseWidgetSetting) {
    return declare([BaseWidgetSetting, _WidgetsInTemplateMixin], {
      //these two properties is defined in the BaseWidget
      baseClass: 'jimu-widget-mylocation-setting',

      startup: function() {
        this.inherited(arguments);
        if (!this.config.locateButton) {
          this.config.locateButton = {};
        }
        if (!this.config.locateButton.geolocationOptions) {
          this.config.locateButton.geolocationOptions = {};
        }
        this.setConfig(this.config);
      },

      setConfig: function(config) {
        this.config = config;
        if (config.locateButton.geolocationOptions && config.locateButton.geolocationOptions.timeout) {
          this.timeout.set('value', config.locateButton.geolocationOptions.timeout);
        }
        if (config.locateButton.highlightLocation || config.locateButton.highlightLocation === undefined) {
          this.highlightLocation.set('checked', true);
        } else {
          this.highlightLocation.set('checked', false);
        }
      },

      getConfig: function() {
        if (!this.timeout.value) {
          alert(this.nls.warning);
          return false;
        }
        this.config.locateButton.geolocationOptions.timeout = parseInt(this.timeout.value, 10);
        if (!this.config.locateButton.highlightLocatio) {
          this.config.locateButton.highlightLocation = this.highlightLocation.checked;
        }
        return this.config;
      }

    });
  });
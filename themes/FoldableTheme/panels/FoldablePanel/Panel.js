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

define(['dojo/_base/declare',
  'dojo/_base/lang',
  'dojo/_base/html',
  'dojo/_base/array',
  'dojo/_base/fx',
  'dojo/on',
  'dojo/aspect',
  'jimu/BaseWidgetPanel',
  'jimu/BaseWidgetFrame',
  'jimu/utils',
  './FoldableDijit',
  './FoldableWidgetFrame'
],
function(declare, lang, html, array, baseFx, on, aspect, BaseWidgetPanel, BaseWidgetFrame, utils, FoldableDijit, FoldableWidgetFrame) {
  var criticality = 360;
  var currentLh = html.getMarginBox(jimuConfig.layoutId).h; // layout height
  /* global jimuConfig */
  function isFullWindow(){
    var layoutBox = html.getMarginBox(jimuConfig.layoutId);
    if(layoutBox.w * 0.7 <= criticality){
      return true;
    }else{
      return false;
    }
  }

  function changedLh(){
    var layoutBox = html.getMarginBox(jimuConfig.layoutId);
    var changed = currentLh !== layoutBox.h;
    currentLh = layoutBox.h;
    return changed;
  }

  function getPanelWidth(){
    var layoutBox = html.getMarginBox(jimuConfig.layoutId);
    if(layoutBox.w * 0.7 <= criticality){
      return '100%';
    }else{
      return 360;
    }
  }

  function getHeaderHeight(){
    return 35;
  }

  return declare([BaseWidgetPanel, FoldableDijit], {
    baseClass: 'jimu-widget-panel jimu-foldable-dijit jimu-foldable-panel',

    closeTolerance: 30,

    closeBtnHandle: null,

    startup: function(){
      this.titleHeight = getHeaderHeight();
      this.isFull = null;
      this.inherited(arguments);
      this.createCloseBtn();
      this.resize();
    },

    getFullPosition: function (){
      var fullPos = {}, pos = this.position;
      fullPos.left = pos.left? pos.left: '';
      fullPos.right = pos.right? pos.right: '';
      fullPos.top = pos.top? pos.top: '';
      fullPos.bottom = pos.bottom? pos.bottom: '';
      fullPos.height = pos.height? pos.height: '';
      fullPos.width = pos.width? pos.width: getPanelWidth();

      if (this.isFull) {
        fullPos.right = 0;
        fullPos.bottom = 0;
      }
      return fullPos;
    },

    onStateChange: function(){
      var pos;

      this.position.width = getPanelWidth();
      if(this.iframePane){
        this.iframePane.setPosition(this.position);
      }
      // this.modifyCloseBtn();
      if(this.isFull){
        html.place(this.domNode, jimuConfig.layoutId);
        pos = {left: 0, right: 0, top: 0, bottom: 0, width: '', height: ''};
      }else{
        html.place(this.domNode, jimuConfig.mapId);
        pos = {
          left: this.position.left? this.position.left: '',
          right: this.position.right? this.position.right: '',
          top: this.position.top? this.position.top: '',
          bottom: this.position.bottom? this.position.bottom: '',
          width: this.position.width? this.position.width: '',
          height: this.position.height? this.position.height: ''
        };
      }
      html.setStyle(this.domNode, utils.getPositionStyle(pos));
      utils.setVerticalCenter(this.titleNode);
      this.setBorderRadius();
      this.moveTitle();
    },

    setBorderRadius: function(){
      var style;
      if(this.isFull){
        style = {
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0,
          borderBottomLeftRadius: 0,
          borderBottomRightRadius: 0
        };
      }else{
        style = {
          borderTopLeftRadius: '4px',
          borderTopRightRadius: '4px',
          borderBottomLeftRadius: '4px',
          borderBottomRightRadius: '4px'
        };
      }
      html.setStyle(this.domNode, style);
    },

    resize: function(){
      if(this.isFull !== isFullWindow() || changedLh()){
        this.isFull = isFullWindow();
        this.onStateChange();
      }
      html.setStyle(this.domNode, {
        width: getPanelWidth() + 'px'
      });
      this.inherited(arguments);
      if(this.getChildren().length > 1){
        this._setFrameSize();
      }
    },

    reloadWidget: function(widgetConfig){
      this.inherited(arguments);
      if(!this.isWidgetInPanel(widgetConfig)){
        return;
      }
      if(!Array.isArray(this.config.widgets)){
        this.setTitleLabel(widgetConfig.label);
      }
    },

    updateConfig: function(_config){
      this.inherited(arguments);
      this.setTitleLabel(_config.label);
    },

    _setFrameSize: function(){
      var h, box = html.getContentBox(this.containerNode),
      openedPaneCount = 0;

      //openedPaneCount should >= 1
      array.forEach(this.getChildren(), function(frame){
        if(!frame.folded){
          openedPaneCount ++;
        }
      }, this);

      h = (box.h - (this.getChildren().length - openedPaneCount) * this.getChildren()[0].titleHeight) / openedPaneCount ;
      console.log('box.h=' + box.h + ', h=' + h);
      array.forEach(this.getChildren(), function(frame){
        if(frame.folded){
          html.setStyle(frame.domNode, {
            height: frame.titleHeight + 'px'
          });
        }else{
          html.setStyle(frame.domNode, {
            height: h + 'px'
          });
        }
        frame.resize();
      }, this);
    },

    createCloseBtn: function(){
      if(this.isFull){
        this.closeNode = html.create('div', {
          'class': 'fold-btn jimu-vcenter'
        }, this.titleNode);
      }else{
        this.closeNode = html.create('div', {
          'class': 'close-btn jimu-vcenter'
        }, this.titleNode);

        this.closeBtnHandle = on(this.closeNode, 'click', lang.hitch(this, function(evt){
          evt.stopPropagation();
          this.panelManager.closePanel(this);
        }));
      }
      utils.setVerticalCenter(this.titleNode);
    },

    modifyCloseBtn: function(){
      html.removeClass(this.closeNode, 'close-btn');
      html.removeClass(this.closeNode, 'fold-btn');
      if(this.closeBtnHandle){
        this.closeBtnHandle.remove();
      }
      if(this.isFull){
        html.addClass(this.closeNode, 'fold-btn');
      }else{
        html.addClass(this.closeNode, 'close-btn');
        this.closeBtnHandle = on(this.closeNode, 'click', lang.hitch(this, function(evt){
          evt.stopPropagation();
          this.panelManager.closePanel(this);
        }));
      }
    },

    createFrame: function(widgetConfig){
      var frame;
      if(this.config.widgets && this.config.widgets.length === 1 || !this.config.widgets){
        frame = new BaseWidgetFrame();
      }else{
        frame = new FoldableWidgetFrame({
          label: widgetConfig.label,
          widgetManager: this.widgetManager
        });

        aspect.after(frame, 'onFoldStateChanged', (function(){
          var openedPaneCount = 0;

          this._setFrameSize();
          array.forEach(this.getChildren(), function(frame){
            if(!frame.folded){
              openedPaneCount ++;
            }
          }, this);

          array.forEach(this.getChildren(), function(frame){
            if(!frame.folded && openedPaneCount === 1){
              frame.foldEnable = false;
            }else{
              frame.foldEnable = true;
            }
          }, this);

        }).bind(this));
      }

      return frame;
    },

    createFullCloseTip: function(){
      var node;
      node = html.create('div', {
        'class': 'close-tip',
        innerHTML: 'Close',
        style: {
          height: this.titleHeight + 'px',
          lineHeight: this.titleHeight + 'px'
        }
      }, this.domNode);
      return node;
    },

    onTitleClick: function(){
      var ch;
      if(this.folded){
        this.folded = false;
        html.setStyle(this.domNode, utils.getPositionStyle(this.getFullPosition()));
        
        if(this.iframePane){
          html.setStyle(this.iframePane.domNode, utils.getPositionStyle(this.getFullPosition()));
          this.iframePane.resize();
        }
        
        this.moveTitle();
      }else{
        this.folded = true;
        ch = 0;
        html.setStyle(this.domNode, {
          height: this.titleHeight + 'px'
        });
        if(this.iframePane){
          html.setStyle(this.iframePane.domNode, {
            height: this.titleHeight + 'px'
          });
          this.iframePane.resize();
        }
        this.moveTitle();
      }
      
      this.onFoldStateChanged();
    },

    onOpen: function(){
      this.inherited(arguments);
      
      if(isFullWindow() || changedLh()){
        this.isFull = isFullWindow();
        this.onStateChange();
      }
      if (this.folded){
        this.onTitleClick();
      }
    },

    onFoldStateChanged: function(){
      array.forEach(this.getChildren(), function(frame){
        var widget = frame.getWidget();
        if(!widget){
          return;
        }
        if(this.folded){
          this.widgetManager.minimizeWidget(widget);
        }else{
          this.widgetManager.maximizeWidget(widget);
        }
      }, this);
    },

    moveTitle: function(){
      if(this.isFull){
        if(this.folded){
          html.setStyle(this.domNode, {
            top: (html.getMarginBox(jimuConfig.layoutId).h - this.titleHeight) + 'px'
          });
        }else{
          html.setStyle(this.domNode, {
            top: '0px'
          });
        }
      }else{
        html.setStyle(this.domNode, {
          top: this.position.top + 'px'
        });
      }
    }
  });
});
/* global define, d3, _ */

define([
    'dojo/_base/declare',
    'dojo/on',
    'dojo/_base/lang',
    'dojo/_base/array',

    'esri/layers/GraphicsLayer',
    'esri/graphic',
    'esri/symbols/SimpleFillSymbol',

    'jimu/BaseWidget'
  ],
  function(declare, on, lang, array,
    GraphicsLayer, Graphic, SFS,
    BaseWidget) {
    //To create a widget, you need to derive from BaseWidget.
    return declare([BaseWidget], {

      //please note that this property is be set by the framework when widget is loaded.
      //templateString: template,

      baseClass: 'jimu-widget-demo',

      name: 'Filter',

      postCreate: function() {
        window.filterWidget = this;
        this.inherited(arguments);
        this._initLayerSelect();
      },

      startup: function() {
        this.inherited(arguments);
        this.mapIdNode.innerHTML = 'map id:' + this.map.id;
        console.log('startup');
      },

      _initLayerSelect: function() {
        if (!(this.config && this.config.layers)) {
          return;
        }

        for (var i = 0; i < this.config.layers.length; i++) {
          var layer = this.config.layers[i];
          this._setLayer(layer);
        }
      },

      _setLayer: function(layer) {
        this.layer = this.map.getLayer(layer.id);
        console.log(layer);
        window.setTimeout(lang.hitch(this, function() {
          this._initD3();
        }), 100);
      },

      _convertLayer: function(layer) {
        var graphicsLayer = new GraphicsLayer(),
          graphic;
        _.each(layer.graphics, lang.hitch(this, function(g) {

          graphic = this._copyGraphic(g);

          graphicsLayer.add(graphic);
        }));

        this.layer.hide();
        this.filterLayer = graphicsLayer;
        this.map.addLayer(this.filterLayer);
      },

      _copyGraphic: function(g) {
        var graphic = new Graphic(g.toJson());

        var symbol = new SFS({
          'type': 'esriSFS',
          'style': 'esriSFSSolid',
          'color': [g._shape.fillStyle.r, g._shape.fillStyle.g, g._shape.fillStyle.b, 225],
          'outline': {
            'type': 'esriSLS',
            'style': 'esriSLSSolid',
            'color': [255, 255, 255, 0],
            'width': 1
          }
        });

        graphic.setSymbol(symbol);

        return graphic;
      },

      _getLayerStats: function(layer) {
        var min,
          max,
          values = [],
          stats = {};
        array.forEach(layer.graphics, function(graphic) {
          values.push(graphic.attributes.ppov);
          if (!min || graphic.attributes.ppov < min) {
            min = graphic.attributes.ppov;
          }
          if (!max || graphic.attributes.ppov > max) {
            max = graphic.attributes.ppov;
          }
        });

        console.log('min: ' + min);
        console.log('max: ' + max);

        stats.min = min;
        stats.max = max;
        stats.values = values;
        stats.count = layer.graphics.length;
        return stats;
      },

      _initD3: function() {
        this._convertLayer(this.layer);
        var stats = this._getLayerStats(this.layer);
        var xMin = stats.min;
        var xMax = stats.max;
        var snapInt = 1;
        var numPoints = stats.count;
        var totalHeight = 90;
        var totalWidth = 350;

        var data = this.layer.graphics.map(function(d) {
          return d.attributes.ppov;
        });

        function scaleTo100() {
          return (Math.random() * xMax) + xMin;
        }

        var margin = {
          top: 10,
          bottom: 30
        };
        var height = totalHeight - margin.top - margin.bottom;
        var brushWidth = (height < 50) ? ((height / 2) - 2) : (height / 5);

        margin.left = Math.ceil(brushWidth) + 5;
        margin.right = margin.left;

        var width = totalWidth - margin.left - margin.right;

        var x = d3.scale.linear()
          .domain([xMin, xMax]) // this is the original data x values
        .range([0, width]); // this is the viewport width

        var y = d3.random.normal(height / 2, height / 100);

        var brush = d3.svg.brush()
          .x(x)
          .extent([(xMax * 0.3 + xMin), (xMax * 0.5 + xMin)])
          .on('brushstart', brushstart)
          .on('brush', lang.hitch(this, brushmove))
          .on('brushend', brushend);


        function trianglePath(d) {
          console.log('width and height: ' + width + ' ' + height);
          var y = brushWidth;
          var x = (d === 'e') ? brushWidth : (brushWidth * -1);
          var returnPath = 'M' + x + ',' + (-1 * y) +
            'L0' + ',0' +
            'L' + x + ',' + (y) +
            'Z';
          return returnPath;
        }

        var svg = d3.select('.svg-wrapper').append('svg')
          .attr('width', totalWidth)
          .attr('height', totalHeight)
          .append('g')
          .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

        svg.append('g')
          .attr('class', 'x axis')
          .attr('transform', 'translate(0,' + height + ')')
          .call(d3.svg.axis().scale(x).orient('bottom').ticks(5));

        var circle = svg.append('g').selectAll('circle')
          .data(data)
          .enter().append('circle')
          .attr('transform', function(d) {
            return 'translate(' + x(d) + ',' + y() + ')';
          })
          .attr('r', 8);

        var brushg = svg.append('g')
          .attr('class', 'brush')
          .call(brush);

        brushg.selectAll('.resize').append('path')
          .attr('transform', 'translate(0,' + height / 2 + ')')
          .attr('d', trianglePath);

        brushg.selectAll('rect')
          .attr('height', height);

        brushstart();
        lang.hitch(this, brushmove());

        function brushstart() {
          svg.classed('selecting', true);
        }

        function brushmove() {
          console.log('brushmove ' + brush.extent());
          var initExtent = brush.extent();
          var roundedExtent;

          if (initExtent[1] - initExtent[0] >= snapInt) {
            roundedExtent = [
              Math.round(initExtent[0] / snapInt) * snapInt,
              Math.round(initExtent[1] / snapInt) * snapInt
            ];
          } else {
            roundedExtent = [
              Math.floor(initExtent[0] / snapInt) * snapInt,
              Math.ceil(initExtent[1] / snapInt) * snapInt
            ];
          }

          brush.extent(roundedExtent);
          brushg.call(brush);

          circle.classed('selected', function(d) {
            return roundedExtent[0] <= d && d <= roundedExtent[1];
          });
          lang.hitch(this, updateStats(roundedExtent));
        }

        function brushend() {
          svg.classed('selecting', !d3.event.target.empty());
          console.log('brushend. target empty? ' + d3.event.target.empty());

          if (d3.event.target.empty()) {
            d3.event.sourceEvent.stopPropagation();
            brush.extent([xMin, xMax]);
            brushg.call(brush)
              .call(brushmove);
          }
        }

        function updateStats(extent) {
          d3.select('.minstat').attr('value', extent[0]);
          d3.select('.maxstat').attr('value', extent[1]);
          var dataInRange = d3.selectAll('circle').filter(function(d) {
            return d >= extent[0] && d <= extent[1];
          });
          console.log(dataInRange[0].length);
          d3.select('.summary').text('Number of data points in selection: ' + dataInRange[0].length + 'out of ' + numPoints);
          //wtf, scope?
          window.filterWidget.updateFeatureLayer(extent);
        }
      },

      updateFeatureLayer: function(extent) {

        _.each(this.filterLayer.graphics, lang.hitch(this, function(g) {
          if (g.attributes.ppov > extent[0] && g.attributes.ppov < extent[1]) {
            g.show();
          } else {
            g.hide();
          }
        }));

        // var definition = 'ppov > ' + extent[0] + ' AND ppov < ' + extent[1];
        // this.graphicsLayer.setDefinitionExpression(definition);
      },

      onOpen: function() {
        console.log('onOpen');
      },

      onClose: function() {
        console.log('onClose');
      },

      onMinimize: function() {
        console.log('onMinimize');
      },

      onMaximize: function() {
        console.log('onMaximize');
      },

      onSignIn: function(credential) {
        /* jshint unused:false*/
        console.log('onSignIn');
      },

      onSignOut: function() {
        console.log('onSignOut');
      }
    });
  });
var margin = {top: 10, left: 10, bottom: 10, right: 10};

var mapWidth = parseInt(d3.select('#choropleth').style('width'))
  , mapWidth = mapWidth - margin.left - margin.right
  , mapHeight = parseInt(d3.select('#choropleth').style('height'))
  , mapHeight = mapHeight - margin.top - margin.bottom;

var histWidth = parseInt(d3.select('#histogram').style('width'))
  , histWidth = histWidth - margin.left - margin.right
  , histHeight = parseInt(d3.select('#histogram').style('height'))
  , histHeight = histHeight - margin.top - margin.bottom;

// var pieWidth = parseInt(d3.select('#pie').style('width'))
//   , pieWidth = pieWidth - margin.left - margin.right
//   , pieHeight = parseInt(d3.select('#pie').style('height'))
//   , pieHeight = pieHeight - margin.top - margin.bottom;

var parseDate = d3.time.format("%m/%d/%Y %I:%M:%S %p").parse;
var formatDate = d3.time.format("%m/%y");
var formatCount = d3.format(",.0f");


// Thanks to http://colorbrewer2.org/
var colorScale = d3.scale.quantize().range(['rgb(255,255,229)','rgb(247,252,185)','rgb(217,240,163)','rgb(173,221,142)','rgb(120,198,121)','rgb(65,171,93)','rgb(35,132,67)','rgb(0,104,55)','rgb(0,69,41)']);

// Figure out scale and translate for geo projection
// Thanks to http://stackoverflow.com/questions/14492284/center-a-map-in-d3-given-a-geojson-object
// Create a unit projection.
var projection = d3.geo.albers()
    .scale(1)
    .translate([0, 0]);

// Create a path generator.
var path = d3.geo.path()
    .projection(projection);

var choropleth = dc.geoChoroplethChart("#choropleth");
var histogram = dc.barChart("#histogram");
var pie = dc.pieChart("#pie");
var boroughRow = dc.rowChart("#boroughRow");


d3.csv("data/nyc_rodent_complaints.csv", function(error, rawData) {

	rawData.forEach(function(d) {
		d.created_date = parseDate(d["Created Date"]);
		d.month = d3.time.month(d.created_date);
	});

	var data = crossfilter(rawData);
	var all = data.groupAll();

	var zipCodes = data.dimension(function(d) {
		return d["Incident Zip"];
	});
	var zipCodeCounts = zipCodes.group();

	var time = data.dimension(function(d) {
	    return d.created_date;
	});
	var timeCounts = time.group(function(d) {
		return d3.time.month(d);
	}).reduceCount();

	var borough = data.dimension(function(d) {
		return d["Borough"];
	});
	var boroughCounts = borough.group().reduceCount();

	// Determine the first and last dates in the data set
	var monthExtent = d3.extent(rawData, function(d) { return d.created_date; });

	var timeScale = d3.time.scale().domain([d3.time.month.floor(monthExtent[0]),
	                             d3.time.month.ceil(monthExtent[1])]);

	d3.json("data/nyc-zip-code.json", function(nycZipJson) {

		// Compute the bounds of a feature of interest, then derive scale & translate.
		var b = path.bounds(nycZipJson),
		    s = .95 / Math.max((b[1][0] - b[0][0]) / mapWidth, (b[1][1] - b[0][1]) / mapHeight),
		    t = [(mapWidth - s * (b[1][0] + b[0][0])) / 2, (mapHeight - s * (b[1][1] + b[0][1])) / 2];

		// Update the projection to use computed scale & translate.
		projection
		    .scale(s)
		    .translate(t);

		choropleth.width(mapWidth)
			.height(mapHeight)
			.dimension(zipCodes)
			.group(zipCodeCounts, "Rat Sightings by Zip Code")
			.colors(colorScale)
			.colorAccessor(function(d) {
				return d.value;
			})
			.colorCalculator(function(d) {
				return d ? choropleth.colors()(d) : 'lightgray';
			})
			.overlayGeoJson(nycZipJson.features, "zip_code", function(d) {
				return d.properties.ZIP;
			})
			.projection(projection)
			.title(function(d) {
				return "Zip Code: " + d.key + "\nNumber of Sightings: " + d.value;
			});

		choropleth.calculateColorDomain();

		// Create a legend for the choropleth
		// Thanks to http://eyeseast.github.io/visible-data/2013/08/27/responsive-legends-with-d3/
		var legend = d3.select('#legend')
			.append('ul')
		    .attr('class', 'list-inline');

		var keys = legend.selectAll('li.key')
		    .data(colorScale.range());

		keys.enter().append('li')
		    .attr('class', 'key')
		    .style('border-left-color', String)
		    .text(function(d) {
		        var r = colorScale.invertExtent(d);
		        return formatCount(r[0]);
		    });

		histogram.width(histWidth)
			.height(histHeight)
			.margins({top: 10, right: 10, bottom: 20, left: 40})
			.dimension(time)
			.group(timeCounts)
			.x(timeScale)
			.round(d3.time.month.round)
			.xUnits(d3.time.months)
			.elasticY(true)
			.renderHorizontalGridLines(true);


		pie
		// .width(pieWidth)
		// 	.height(pieHeight)
			.dimension(borough)
			.group(boroughCounts)
			.colors(d3.scale.category10())
			.label(function (d) {
	            if (pie.hasFilter() && !pie.hasFilter(d.key))
	                return d.key + " (0%)";
	            var label = d.key;
	            if(all.value())
	                label += " (" + Math.floor(d.value / all.value() * 100) + "%)";
	            return label;
	        });

        boroughRow.dimension(borough)
        	.group(boroughCounts)
        	.elasticX(true)
        	.ordering(function (d) {
        		return -d.value;
        	})
        	;

		boroughRow.xAxis().ticks(5);


		var updateChloroplethScale = function(chart, filter) {
			var domain = [d3.min(choropleth.group().all(), choropleth.colorAccessor()),
						  d3.max(choropleth.group().all(), choropleth.colorAccessor())];
			choropleth.colorDomain(domain);
		}
		pie.on('filtered', updateChloroplethScale);
		histogram.on('filtered', updateChloroplethScale);

		choropleth.renderlet(function(chart) {
			d3.select('#legend').selectAll('li.key')
			    .data(chart.colors().range())
			    .text(function(d) {
			        var r = chart.colors().invertExtent(d);
			        return formatCount(r[0]);
			    });

		});

		dc.renderAll();
	});

});

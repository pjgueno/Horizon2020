L.HexbinLayer = L.Layer.extend({
	_undef (a) { return typeof a === 'undefined' },
	options: {
		radius: 15,
		opacity: 0.6,
		duration: 200,
		onmouseover: undefined,
		onmouseout: undefined,
        click: hexagonClick,
        valueDomain:[],
                
        colorRange: ['powderblue','gray','purple','indigo','blue','green','yellow','orange','red','brown','maroon'],

		lng: function (d) {return d.coo[1]},
		lat: function (d) {return d.coo[0]},
		value: function (d) {
            
//            REVOIR LES DEFINITIONS ICI!!!
            
            if(selector == 'contribution'){return d3.sum(d, (o) => o.o.c)}
            if(selector == 'participation'){return d.length}
//            if(selector == 'ratioconp'){return (d3.sum(d, (o) => o.o.c)/d.length)}
            
            if(selector == 'ratioconp'){return d3.mean(d, (o) => o.o.c)}

            if(selector == 'coordination'){return d3.sum(d, (o) => {if(o.o.cop == true){return 1}})}
            if(selector == 'ratiocoop'){return ((d3.sum(d, (o) => {if(o.o.cop == true){return 1}})/d.length)*100)}
             }
        
    
    },

	initialize (options) {
		L.setOptions(this, options)
		this._data = []
		this._colorScale = d3.scaleLinear()
			.domain(this.options.valueDomain)
			.range(this.options.colorRange)
			.clamp(true)
	},

	onAdd (map) {
		this.map = map
		let _layer = this

		// SVG element
		this._svg = L.svg()
		map.addLayer(this._svg)
		this._rootGroup = d3.select(this._svg._rootGroup).classed('d3-overlay', true)
		this.selection = this._rootGroup
    
		// Init shift/scale invariance helper values
		this._pixelOrigin = map.getPixelOrigin()
		this._wgsOrigin = L.latLng([0, 0])
		this._wgsInitialShift = this.map.latLngToLayerPoint(this._wgsOrigin)
		this._zoom = this.map.getZoom()
		this._shift = L.point(0, 0)
		this._scale = 1

		// Create projection object
		this.projection = {
			latLngToLayerPoint: function (latLng, zoom) {
				zoom = _layer._undef(zoom) ? _layer._zoom : zoom
				let projectedPoint = _layer.map.project(L.latLng(latLng), zoom)._round()
				return projectedPoint._subtract(_layer._pixelOrigin)
			},
			layerPointToLatLng: function (point, zoom) {
				zoom = _layer._undef(zoom) ? _layer._zoom : zoom
				let projectedPoint = L.point(point).add(_layer._pixelOrigin)
				return _layer.map.unproject(projectedPoint, zoom)
			},
			unitsPerMeter: 256 * Math.pow(2, _layer._zoom) / 40075017,
			map: _layer.map,
			layer: _layer,
			scale: 1
		}
		this.projection._projectPoint = function (x, y) {
			let point = _layer.projection.latLngToLayerPoint(new L.LatLng(y, x))
			this.stream.point(point.x, point.y)
		}

		this.projection.pathFromGeojson = d3.geoPath().projection(d3.geoTransform({point: this.projection._projectPoint}))

		// Compatibility with v.1
		this.projection.latLngToLayerFloatPoint = this.projection.latLngToLayerPoint
		this.projection.getZoom = this.map.getZoom.bind(this.map)
		this.projection.getBounds = this.map.getBounds.bind(this.map)
		this.selection = this._rootGroup // ???

		// Initial draw
		this.draw()
	},

	onRemove (map) {
		if (this._container != null)
			this._container.remove()

		// Remove events
		map.off({'moveend': this._redraw}, this)

		this._container = null
		this._map = null

		// Explicitly will leave the data array alone in case the layer will be shown again
		// this._data = [];
	},

	addTo (map) {
		map.addLayer(this)
		return this
	},

	_disableLeafletRounding () {
		this._leaflet_round = L.Point.prototype._round
		L.Point.prototype._round = function () { return this }
	},

	_enableLeafletRounding () {
		L.Point.prototype._round = this._leaflet_round
	},

	draw () {
		this._disableLeafletRounding()
		this._redraw(this.selection, this.projection, this.map.getZoom())
		this._enableLeafletRounding()
	},
	getEvents: function () { return {zoomend: this._zoomChange} },
    
    
	_zoomChange: function () {    
		let mapZoom = map.getZoom()
        let MapCenter = map.getCenter()
		this._disableLeafletRounding()
		let newZoom = this._undef(mapZoom) ? this.map._zoom : mapZoom        
		this._zoomDiff = newZoom - this._zoom
		this._scale = Math.pow(2, this._zoomDiff)
		this.projection.scale = this._scale
		this._shift = this.map.latLngToLayerPoint(this._wgsOrigin)
				._subtract(this._wgsInitialShift.multiplyBy(this._scale))
		let shift = ["translate(", this._shift.x, ",", this._shift.y, ") "]    
		let scale = ["scale(", this._scale, ",", this._scale,") "]
		this._rootGroup.attr("transform", shift.concat(scale).join(""))
		this.draw()
		this._enableLeafletRounding()     
	},
	_redraw(selection, projection, zoom){
        
        
		// Generate the mapped version of the data
		let data = this._data.map( (d) => {
			let lng = this.options.lng(d)
			let lat = this.options.lat(d)
			let point = projection.latLngToLayerPoint([lat, lng])            
			return { o: d, point: point }
		});
        
//        console.log(data)
        
        data.sort((a,b)=> new Date(a.o.d) - new Date(b.o.d))
        
		// Select the hex group for the current zoom level. This has
		// the effect of recreating the group if the zoom level has changed
		let join = selection.selectAll('g.hexbin')
			.data([zoom], (d) => d)
    
		// enter
		join.enter().append('g')
			.attr('class', (d) => 'hexbin zoom-' + d)

		// exit
		join.exit().remove()
        
        d3.selectAll('path.hexbin-hexagon').remove()

		// add the hexagons to the select
		this._createHexagons(join, data, projection)
        
	},

	_createHexagons(g, data, projection) {
		// Create the bins using the hexbin layout
        
		let hexbin = d3.hexbin()
			.radius(this.options.radius / projection.scale)
			.x( (d) => d.point.x )
			.y( (d) => d.point.y )
        
        
        
		let bins = hexbin(data)
//        console.log('redraw')
        this.options.valueDomain = getDomain(bins)
        
//        ICI POUR CHANGER LE GRADIENT POUR LES COORDINATIONS
        
        
        this.initialize(this.options)
//        console.log(this.options.valueDomain)

		// Join - Join the Hexagons to the data
		let join = g.selectAll('path.hexbin-hexagon')
			.data(bins)
        
//        var zoomLevel = map.getZoom()
//        var maxRange = parseInt(100*(1/zoomLevel))
//        
//        console.log(maxRange)
//        
//        var radius = d3.scaleSqrt()
//    .domain([0, radiusDomain(bins)])
//    .range([1, maxRange]);

		// Update - set the fill and opacity on a transition (opacity is re-applied in case the enter transition was cancelled)
		join.transition().duration(this.options.duration)
			.attr('fill', (d) => this._colorScale(this.options.value(d)))
			.attr('fill-opacity', this.options.opacity)
			.attr('stroke-opacity', this.options.opacity)

        
        
//        console.log(this.options.radius)
        
        
        
		// Enter - establish the path, the fill, and the initial opacity
		join.enter().append('path').attr('class', 'hexbin-hexagon')
        
//        SI BESOIN ENLEVER RADIUS
        			.attr('d', (d) => 'M' + d.x + ',' + d.y + hexbin.hexagon())

//			.attr('d', (d) => 'M' + d.x + ',' + d.y + hexbin.hexagon(radius(d.length)))
			.attr('fill', (d) => this._colorScale(this.options.value(d)))
			.attr('fill-opacity', 0.01)
			.attr('stroke-opacity', 0.01)
			.on('mouseover', this.options.mouseover)
			.on('mouseout', this.options.mouseout)
			.on('click', this.options.click)
			.transition().duration(this.options.duration)
				.attr('fill-opacity', this.options.opacity)
				.attr('stroke-opacity', this.options.opacity)

		// Exit
		join.exit().transition().duration(this.options.duration)
			.attr('fill-opacity', 0.01)
			.attr('stroke-opacity', 0.01)
			.remove()
	},
	data (data) {
		this._data = (data != null) ? data : []
		this.draw()
		return this
	}
});

L.hexbinLayer = function(options) {
	return new L.HexbinLayer(options);
};



function getDomain(val){
    
    var arraySum =[];
    var bbox = map.getBounds();
    var unit;

    val.forEach(function(itembin){
                itembin.forEach(function(item){
                        var position = L.latLng(item.o.coo[0],item.o.coo[1]);
                        if (bbox.contains(position)){
                            
                            if (selector == 'contribution'){arraySum.push(d3.sum(itembin, (o) => o.o.c)); unit =' euros';};
                            if (selector == 'participation'){arraySum.push(itembin.length); unit =' participations';};                            
                            if (selector == 'ratioconp'){arraySum.push(parseInt(d3.mean(itembin, (o) => o.o.c))); unit =' euros'; };
                            if (selector == 'coordination'){arraySum.push(d3.sum(itembin, (o) => {if(o.o.cop == true){return 1}}));unit =' coordinations';};
                            if (selector == 'ratiocoop'){arraySum.push(parseInt((d3.sum(itembin, (o) => {if(o.o.cop == true){return 1}})/itembin.length)*100));unit =' %';};
                            
                                   };
                });
            });
        
         
            var max = Math.max(...arraySum);
    
//            var max = d3.max(arraySum);
    
    
        document.getElementById('limitmax').innerHTML= max;
    document.getElementById('limit9').innerHTML= parseInt((90*max)/100);
    document.getElementById('limit8').innerHTML= parseInt((80*max)/100);
    document.getElementById('limit7').innerHTML= parseInt((70*max)/100);
    document.getElementById('limit6').innerHTML= parseInt((60*max)/100);
    document.getElementById('limit5').innerHTML= parseInt((50*max)/100);
    document.getElementById('limit4').innerHTML= parseInt((25*max)/100);
    document.getElementById('limit3').innerHTML= parseInt((10*max)/100);
    document.getElementById('limit2').innerHTML= parseInt((5*max)/100);
    document.getElementById('limit1').innerHTML= parseInt((1*max)/100);
    document.getElementById('limit0').innerHTML= 0 + unit ;
    
    
    
            return [0,parseInt((1*max)/100),parseInt((5*max)/100),parseInt((10*max)/100),parseInt((25*max)/100),parseInt((50*max)/100),parseInt((60*max)/100),parseInt((70*max)/100),parseInt((80*max)/100),parseInt((90*max)/100), max];
                     
                                 };
            
    
function radiusDomain(val){
    
        var arrayRadius =[];
        var bbox = map.getBounds();

      val.forEach(function(itembin){
                itembin.forEach(function(item){
                        var position = L.latLng(item.o.coo[0],item.o.coo[1]);
                        if (bbox.contains(position)){
                                arrayRadius.push(itembin.length)};
                });
            });
    
    
                var max = Math.max(...arrayRadius);
    
    //            var max = d3.max(arrayRadius);


    return max;
    
};
 

function hexagonClick(data){
    
        removeSvg();

//    console.log('click');
        
    var width = window.innerWidth;
    var height = window.innerHeight;

    dataClicked = data;
    
    var debut = "<table id='results'><tr><th class ='titre' onclick='removeDiv()'>Name</th><th class ='titre' onclick='removeDiv()'>Activity</th><th class ='titre' onclick='removeDiv()'>Project</th><th class ='titre' onclick='removeDiv()'>Topic</th><th class ='titre' onclick='removeDiv()'>Contribution</th><th class ='titre' onclick='removeDiv()'>Start Date</th><th class ='titre' onclick='removeDiv()'>End Date</th><th class ='titre' onclick='removeDiv()'>Coordinator</th></tr>";
            
    var lines = "";
    var tabfin = "";
    
    data.forEach(function(item){
                        
         var newline = "<tr><td class='val' id='n' onclick='drawGraph(dataClicked,\""+item.o.n+"\")' >"+item.o.n+"</td><td class='val' id='a' onclick='filterRedraw(this.id, this.innerHTML)'>"+item.o.a+"</td><td class='val' id='pr' onclick='filterRedraw(this.id,"+item.o.pr+")'><a href='http://cordis.europa.eu/project/rcn/"+item.o.pr+"_en.html' target='_blank'>"+item.o.p+"</a></td><td class='val' id='tr' onclick='filterRedraw(this.id,"+item.o.tr+")'><a href='http://cordis.europa.eu/programme/rcn/"+item.o.tr+"_en.html' target='_blank'>"+item.o.t+"</td><td class='val'>"+item.o.c+"</td></td><td class='val' id='d' onclick='filterRedraw(this.id, this.innerHTML)'>"+item.o.d+"</td></td><td class='val' id='f' onclick='filterRedraw(this.id, this.innerHTML)'>"+item.o.f+"</td><td class='val' id='cop' onclick='filterRedraw(this.id,"+item.o.cop+")'>"+item.o.cop+"</td></tr>";
         
         lines += newline;   
        
    });

     tabfin = debut + lines + "</table>";
      div.style("visibility", "visible");    
    div.html(tabfin);
   
    
//      .style("left", (d3.event.pageX-(width/4)) + "px")
//      .style("top", (d3.event.pageY+30) + "px");
  
    
};

function filterRedraw(typ,val){
    
    clicktest = true;
    
    console.log(val);
    
    removeSvg();
    removeDiv();
    
    hmhexafiltered = hmhexa.filter(function(item){if(item[typ] == val){return item}});
    
    reload(hmhexafiltered);  
    
//    if(hexahmtest == true && clicktest == true ){hexagonheatmap.data(hmhexafiltered);}; 
    
//    ON POURRAIT ALLER TOUJOUS EN DESCENDANT LA QUNTITE DE DATA QUAND IN CLIQUE
    
    
    
////    console.log(hmhexa);
//        console.log(dataClicked);
//
//    
//    
//    
//    var inter = dataClicked.map(function(item){if(item.o[typ] == val){return item.o}});   
//    hmhexafiltered = inter.filter(function(item){if(item != undefined){return item}});  
//    console.log(hmhexafiltered);
//    reload(hmhexafiltered);  
//    
    
    
    
};

function drawGraph(data,val){
    
    
    
//    filterRedraw('n',val);
    
    
    
    
    svgtest = true;
    valGraph = val;
      
    console.log(val);

    var parseTime = d3.timeParse("%Y-%m-%d");        
    var arrayName = data.filter(function(d){if(d.o.n == val){return d}});
    arrayName.sort(function(a, b){return parseTime(a.o.d)-parseTime(b.o.d)});

//        console.log(arrayName);
    
    var sumCon = 0;
    var sumPar = 0;
    var sumCoo = 0;
        
    var dataSum = arrayName.map(function(d){
        sumCon += d.o.c;
        sumPar += 1;
        if (d.o.cop == true){sumCoo += 1};
        return {"c": sumCon,"d":d.o.d,"par": sumPar,"cop": sumCoo}
    });
    

    
//REVOIR ICI => CHANGER TOUS LES DATASUM
        
    var dataFin =dataSum.filter(function(d,i,array){
        if (i == 0 && array.length == 1){
            d.d = parseTime(d.d);
            return d};
        
        if ( array.length > 1 && i == array.length-1){
            d.d = parseTime(d.d);
            return d};
        
        if (d.d != array[i+1].d){
            d.d = parseTime(d.d);
//            console.log(d.d + "    " +array[i+1].d);
            return d };        
        
    });
        
            svg.selectAll("*").remove();
    
//    var widthGraph = document.getElementById("linechart").offsetWidth;
//    var heightGraph = document.getElementById("linechart").offsetHeight;
//        var heightLegend = document.getElementById("linechart").getBBox().width;
//    
//    
    
    
    var linechart  = document.getElementById("linechart"); 
var rect = linechart.getBoundingClientRect(); 
    
      var widthGraph = parseInt(rect.width);
    var heightGraph = parseInt(rect.height);
    

    
    console.log(widthGraph);
    console.log(heightGraph);
    
    var margin = {top: 20, right: 80, bottom: 30, left: 70},
    width = widthGraph - margin.left - margin.right,
    height = heightGraph - margin.top - margin.bottom;
    
//     width = 960 - margin.left - margin.right,
//    height = 500 - margin.top - margin.bottom;
//    
    var x = d3.scaleTime().range([0, width]);
var y = d3.scaleLinear().range([height, 0]);

// define the line
var valueline = d3.line()
    .curve(d3.curveBasis)
    .x(function(d) {return x(d.d)})
    .y(function(d) {
        if (selector == 'contribution'){return y(d.c)};
        if (selector == 'participation'){return y(d.par)};                            
        if (selector == 'ratioconp'){return y(parseInt(d.c/d.par))};
        if (selector == 'coordination'){return y(d.cop)};
        if (selector == 'ratiocoop'){return y(parseInt((d.cop/d.par)*100))};
        });

     
    if(dataFin.length == 1){x.domain([dataFin[0].d, new Date])}else{x.domain(d3.extent(dataFin, (d) => d.d))};
    
    if(dataFin.length == 1){dataFin.push({"c": d3.max(dataFin, (i) => i.c),"d":new Date,"par": d3.max(dataFin, (i) => i.par),"cop": d3.max(dataFin, (i) => i.cop)})};
    
    if (selector == 'contribution'){
    y.domain([0,d3.max(dataFin, (i) => i.c)]); 
    console.log([dataFin[0].c,d3.max(dataFin, (i) => i.c)]);
    console.log(d3.extent(dataFin, (d) => d.d));
    console.log([dataFin[0].d, new Date]);        
    };
    
    if (selector == 'participation'){y.domain([0,d3.max(dataFin, (i) => i.par)])};  
    
    if (selector == 'ratioconp'){y.domain([0,d3.max(dataFin, (i) => parseInt(i.c/i.par))])};
    
    if (selector == 'coordination'){y.domain([0,d3.max(dataFin, (i) => i.cop)])};
    
    if (selector == 'ratiocoop'){y.domain([0,d3.max(dataFin, (i) => parseInt((i.cop/i.par)*100))])};
    
     
    svg.style("width", width + margin.left + margin.right)
    .style("height", height + margin.top + margin.bottom)
    .style("background-color","rgba(238,238,238,0.6)")
    .style("top", "10px")
    .style("right", "10px")
    .style("visibility", "visible")
    .append("g")
    .attr("transform",
          "translate(" + margin.left + "," + margin.top + ")");

    
  
  // Add the valueline path.
  svg.append("path")
      .data([dataFin])
      .attr("class", "line")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")")
      .attr("d", valueline);
    
svg.selectAll(".dot")
        .data(dataFin)
        .enter().append("circle")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")")
        .attr("class", "dot")
        .attr("r", 1.5)
        .attr("cx", function(d) {
            return x(d.d);
        })
        .attr("cy", function(d) {
            if (selector == 'contribution'){return y(d.c)};
            if (selector == 'participation'){return y(d.par)};                            
            if (selector == 'ratioconp'){return y(parseInt(d.c/d.par))};
            if (selector == 'coordination'){return y(d.cop)};
            if (selector == 'ratiocoop'){return y(parseInt((d.cop/d.par)*100))};
        });

  // Add the X Axis
  svg.append("g")
//  .attr("transform", "translate(" + margin.left + "," + "470" + ")")
  
    .attr("transform", "translate(" + margin.left + "," + (heightGraph - 30) + ")")

    .attr("class", "axis axis--x")
    .call(d3.axisBottom(x));

  // Add the Y Axis
  svg.append("g")
  .attr("class", "axis axis--y")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")")
      .call(d3.axisLeft(y))
      .append("text")
      .attr("transform", "rotate(-90)")
      .attr("y", 6)
      .attr("dy", "0.71em")
      .attr("fill", "#000")
      .text(function(){
            if (selector == 'contribution'){return "Contributions, Euro"};
            if (selector == 'participation'){return "Participations"};                            
            if (selector == 'ratioconp'){return "Mean Contributions, Euro"};
            if (selector == 'coordination'){return "Coordinations"};
            if (selector == 'ratiocoop'){return "Coordinations/Participations, Percent"}}); 
  };

var map;
var tiles; 
var hexagonheatmap;

var hexahmtest = false;
var clicktest = false;
var svgtest = false;

var hmhexa = []; 

var hmhexafiltered = [];

var selector = 'contribution';
var options;
var testpopup = false;

var dataClicked = [];
var valGraph;



 window.onload = function(){
     
//     IL FAUT FAIRE UN GRADIENT PLUS LONG 
     

     d3.queue()
    .defer(d3.json,"data/orgahexa.js")
    .awaitAll(ready);  
     
     
     map.on('moveend', function() { 
        arraySum = [];

         
         console.log(hexahmtest);
        console.log(clicktest);

//         PEUT ETRE METTRE LES ZOOMCHANGE ICI...
         
    if(hexahmtest == true && clicktest == false ){hexagonheatmap.data(hmhexa);};    
    if(hexahmtest == true && clicktest == true ){hexagonheatmap.data(hmhexafiltered);}; 

});
     
};
     




map = L.map('map').setView([48.8, 9.2 ], 6);
        map.options.minZoom = 2;


tiles = L.tileLayer('https://{s}.tiles.madavi.de/{z}/{x}/{y}.png',{
        attribution: 'Map data © <a href="https://openstreetmap.org">OpenStreetMap</a> contributors',
        maxZoom: 18}).addTo(map);


var div = d3.select("body").append("div")
    .attr("class", "popup")
    .style("visibility", "hidden");



var svg = d3.select("body").append("svg")
            .style("visibility","hidden")
        .attr("id","linechart")
            .attr("onclick","removeSvg()");


function ready (error,data){
     hmhexa = data[0];

        if(hexahmtest == false){
                    hexahmtest = true;
                    hexagonheatmap = L.hexbinLayer(options).addTo(map);
                    hexagonheatmap.data(hmhexa);
            
                };  
};

function reload (data){
    
//    AJOUTER UN INITIALISE SINON MAUVAIS POSITIONNMENT DES HEXAGONS
//    OU BIEN UN ZOOM CHANGE...
    
        hexagonheatmap.data(data);
//        hexagonheatmap._zoomChange();

//    map.setZoom(5);
};





    
function switcher (value){
    
    console.log(value);
    selector = value;
    
    
if(hexahmtest == true && clicktest == false ){hexagonheatmap.data(hmhexa);};    
if(hexahmtest == true && clicktest == true ){hexagonheatmap.data(hmhexafiltered);}; 
 if(svgtest == true){drawGraph(dataClicked,valGraph)};
    
};

function removeDiv(){
    div.style("visibility", "hidden");
};

function removeSvg(){
//        svg.selectAll("*").remove();
    svgtest = false;
    svg.style("visibility", "hidden");
};


function resetData(){
     clicktest = false;
     svgtest = false;
    hexagonheatmap.data(hmhexa);
    removeSvg();
    removeDiv();
};


function show(){
    document.getElementById('explication').style.visibility="visible";  
};

function hide(){
    document.getElementById('explication').style.visibility="hidden";  
};
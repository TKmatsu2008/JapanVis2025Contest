const width = window.innerWidth;
const height = window.innerHeight;
const svg = d3.select("body").append("svg")
  .attr("width", width)
  .attr("height", height);

document.getElementById("toggleMap").addEventListener("change", (e) => {
  localStorage.setItem("showMap", e.target.checked);
  window.location.reload();
});

const showMap = localStorage.getItem("showMap") !== "false";

Promise.all([
  fetch("data/Node_metro.json").then(d => d.json()),
  fetch("data/Edge_metro.json").then(d => d.json()),
  showMap ? d3.json("https://raw.githubusercontent.com/dataofjapan/land/master/japan.geojson") : Promise.resolve(null)
]).then(([nodeData, edgeData, geoData]) => {
  const longitudes = nodeData.nodes.map(d => d.lon);
  const latitudes = nodeData.nodes.map(d => d.lat);
  const lonExtent = d3.extent(longitudes);
  const latExtent = d3.extent(latitudes);

  const projection = d3.geoMercator()
    .center([(lonExtent[0] + lonExtent[1]) / 2, (latExtent[0] + latExtent[1]) / 2])
    .translate([width / 2, height / 2])
    .scale(1);

  const path = d3.geoPath().projection(projection);
  const projectedMin = projection([lonExtent[0], latExtent[0]]);
  const projectedMax = projection([lonExtent[1], latExtent[1]]);
  const dx = projectedMax[0] - projectedMin[0];
  const dy = projectedMax[1] - projectedMin[1];
  const scale = 0.95 / Math.max(dx / width, dy / height);
  projection.scale(scale);

  if (showMap && geoData) {
    svg.append("g")
      .attr("class", "background-map")
      .selectAll("path")
      .data(geoData.features)
      .join("path")
      .attr("d", path)
      .attr("fill", "#f1f1f1")
      .attr("stroke", "#aaa");
  }

  renderNetwork(nodeData, edgeData, projection);
});

function renderNetwork(nodeData, edgeData, projection) {
  const nodes = nodeData.nodes.map(d => {
    const [x, y] = projection([d.lon, d.lat]);
    return { id: d.id, x, y, passengers: d.passengers };
  });

  const nodeMap = new Map(nodes.map(d => [d.id, d]));

  svg.selectAll(".line")
    .data(edgeData.edges)
    .join("line")
    .attr("class", "line")
    .attr("x1", d => nodeMap.get(d.station_a)?.x)
    .attr("y1", d => nodeMap.get(d.station_a)?.y)
    .attr("x2", d => nodeMap.get(d.station_b)?.x)
    .attr("y2", d => nodeMap.get(d.station_b)?.y)
    .attr("stroke", d => d.line_color)
    .attr("stroke-width", d => Math.sqrt(d.count))
    .attr("stroke-linecap", "round")
    .attr("stroke-dasharray", "5 5")
    .transition()
    .duration(2000)
    .ease(d3.easeSinInOut)
    .attr("stroke-dasharray", "20 5")
    .on("end", function repeat() {
      d3.select(this)
        .attr("stroke-dasharray", "5 5")
        .transition()
        .duration(2000)
        .ease(d3.easeSinInOut)
        .attr("stroke-dasharray", "20 5")
        .on("end", repeat);
    });

  svg.selectAll(".station")
    .data(nodes)
    .join("circle")
    .attr("class", "station")
    .attr("cx", d => d.x)
    .attr("cy", d => d.y)
    .attr("r", d => Math.sqrt(d.passengers) / 150)
    .attr("fill", "steelblue")
    .append("title")
    .text(d => d.id);

  const topStations = nodes
    .slice()
    .sort((a, b) => b.passengers - a.passengers)
    .slice(0, 20);

  svg.selectAll(".station-label")
    .data(topStations)
    .join("text")
    .attr("class", "station-label")
    .attr("x", d => d.x + 6)
    .attr("y", d => d.y - 6)
    .text(d => d.id)
    .attr("font-size", "10px")
    .attr("fill", "#333");
}

// 東京メトロ ネットワーク可視化 - 太さの差を調整可能にした点線アニメーション版

const width = window.innerWidth;
const height = window.innerHeight;
const BASE_ANIMATION_TIME = 500;
const DASH_SOLID = 20;
const DASH_GAP = 100;
const FLOW_DISTANCE = 100;
const MIN_WIDTH = 0.3;
const MAX_WIDTH = 6;
const MIN_SPEED = 1000;
const MAX_SPEED = 10000;
const TIME_SLOT_GROUPS = [
  { label: "早朝", hours: ["04", "05", "06"] },
  { label: "朝", hours: ["07", "08", "09"] },
  { label: "日中", hours: ["10", "11", "12", "13", "14", "15"] },
  { label: "夕方", hours: ["16", "17", "18"] },
  { label: "夜", hours: ["19", "20", "21"] },
  { label: "深夜", hours: ["22", "23", "00"] }
];

mapboxgl.accessToken = 'pk.eyJ1IjoidGFrYWthaS1tYXAiLCJhIjoiY21iMXkxMzgyMDFpMjJsczl5NXZ2aHIybCJ9.R1eVrXB5fwLu95hV-BBY7w';
// 共通保持：全マップで同期用の中心とズーム
let globalCenter = [139.76, 35.68];
let globalZoom = 12;
let syncing = false;
const allMaps = [];

Promise.all([
  fetch("data/Node_metro_toei.json").then(res => res.json()),
  fetch("data/Edge_metro_toei_fulltime.json").then(res => res.json())
]).then(([nodeData, edgeData]) => {
  TIME_SLOT_GROUPS.forEach(group => {
    setupMapView(`map-${group.label}`, group.label, group.hours, nodeData, edgeData);
  });
});

function setupMapView(containerId, label, selectedHours, nodeData, edgeData) {
  const showLogo = (label === "深夜");
  const map = new mapboxgl.Map({
    container: containerId,
    style: 'mapbox://styles/mapbox/dark-v10',
    center: globalCenter,
    zoom: globalZoom,
    interactive: true,
    attributionControl: false,
    logoPosition: showLogo ? "bottom-right" : undefined
  });

  allMaps.push(map);

  map.on("load", () => {
    const svg = d3.select(map.getCanvasContainer()).append("svg")
      .attr("width", "100%")
      .attr("height", "100%")
      .style("position", "absolute")
      .style("top", 0)
      .style("left", 0)
      .style("pointer-events", "none");

    renderSingleView(map, svg, nodeData, edgeData, selectedHours);
  });

  map.on("move", () => {
    if (syncing) return;
    syncing = true;
  
    const center = map.getCenter();
    const zoom = map.getZoom();
  
    allMaps.forEach(otherMap => {
      if (otherMap !== map) {
        otherMap.jumpTo({ center, zoom });
      }
    });
  
    setTimeout(() => syncing = false, 20);
  });
}

function project(map, lon, lat) {
  const point = map.project([lon, lat]);
  return [point.x, point.y];
}

function averageFromHours(obj, hours) {
  const values = hours.map(h => obj?.[h]).filter(v => typeof v === 'number');
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function renderSingleView(map, svg, nodeData, edgeData, selectedHours) {
  const filteredEdges = edgeData.edges.filter(d => {
    const fwd = averageFromHours(d.count_by_hour, selectedHours) || 0;
    const rev = averageFromHours(
      edgeData.edges.find(e => e.station_a === d.station_b && e.station_b === d.station_a)?.count_by_hour,
      selectedHours
    ) || 0;
    return fwd + rev > 0;
  });

  const allCounts = edgeData.edges.map(d => {
    const allHours = Object.keys(d.count_by_hour || {});
    const fwd = averageFromHours(d.count_by_hour, allHours) || 0;
    const rev = averageFromHours(
      edgeData.edges.find(e => e.station_a === d.station_b && e.station_b === d.station_a)?.count_by_hour,
      allHours
    ) || 0;
    return fwd + rev;
  });

  const allDurations = edgeData.edges.map(d => {
    const allHours = Object.keys(d.average_time_by_hour || {});
    return averageFromHours(d.average_time_by_hour, allHours);
  }).filter(v => typeof v === 'number');

  const widthScale = d3.scaleLinear().domain(d3.extent(allCounts)).range([MIN_WIDTH, MAX_WIDTH]);
  const speedScale = d3.scaleLinear().domain(d3.extent(allDurations)).range([MIN_SPEED, MAX_SPEED]);
  const moveScale = d3.scaleLinear().domain(d3.extent(allDurations)).range([FLOW_DISTANCE * 0.5, FLOW_DISTANCE * 2]);

  const lines = svg.selectAll(".line")
    .data(filteredEdges)
    .join("line")
    .attr("class", "line")
    .attr("stroke", d => d.line_color)
    .attr("stroke-width", d => {
      const fwd = averageFromHours(d.count_by_hour, selectedHours) || 0;
      const rev = averageFromHours(
        edgeData.edges.find(e => e.station_a === d.station_b && e.station_b === d.station_a)?.count_by_hour,
        selectedHours
      ) || 0;
      return widthScale(fwd + rev);
    })
    .attr("stroke-linecap", "round")
    .attr("stroke-dasharray", `${DASH_SOLID} ${DASH_GAP}`)
    .attr("stroke-opacity", 0.7)
    .each(function animate(d) {
      const avgTime = averageFromHours(d.average_time_by_hour, selectedHours);
      const duration = speedScale(avgTime || 3);
      const move = moveScale(avgTime || 3);
      let offset = -Math.random() * move;
      const line = d3.select(this);
      line.attr("stroke-dashoffset", offset);
      (function repeat() {
        offset -= move;
        line.transition()
          .duration(duration)
          .ease(d3.easeLinear)
          .attr("stroke-dashoffset", offset)
          .on("end", repeat);
      })();
    });

  const circles = svg.selectAll(".station")
    .data(nodeData.nodes)
    .join("circle")
    .attr("class", "station")
    .attr("r", d => Math.max(Math.sqrt(d.passengers || 1000) / 150, 2))
    .attr("fill", "steelblue")
    .attr("stroke", "#333")
    .attr("stroke-width", 1)
    .attr("cx", d => project(map, d.lon, d.lat)[0])
    .attr("cy", d => project(map, d.lon, d.lat)[1]);

  circles.append("title").text(d => d.id);

  function updatePositions() {
    const nodeMap = new Map(nodeData.nodes.map(d => [d.id, [d.lon, d.lat]]));
    lines
      .attr("x1", d => project(map, ...nodeMap.get(d.station_a))[0])
      .attr("y1", d => project(map, ...nodeMap.get(d.station_a))[1])
      .attr("x2", d => project(map, ...nodeMap.get(d.station_b))[0])
      .attr("y2", d => project(map, ...nodeMap.get(d.station_b))[1]);

    circles
      .attr("cx", d => project(map, d.lon, d.lat)[0])
      .attr("cy", d => project(map, d.lon, d.lat)[1]);
  }

  updatePositions();
  map.on("move", updatePositions);
  map.on("zoom", updatePositions);
}
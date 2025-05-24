// 東京メトロ ネットワーク可視化 - 太さの差を調整可能にした点線アニメーション版

const width = window.innerWidth;
const height = window.innerHeight;
const BASE_ANIMATION_TIME = 500;
const DASH_SOLID = 10;
const DASH_GAP = 70;
const FLOW_DISTANCE = 100;
const MIN_WIDTH = 0.3;
const MAX_WIDTH = 8;
const selectedHours = ["06"];// 時間帯指定

mapboxgl.accessToken = 'pk.eyJ1IjoidGFrYWthaS1tYXAiLCJhIjoiY21iMXkxMzgyMDFpMjJsczl5NXZ2aHIybCJ9.R1eVrXB5fwLu95hV-BBY7w';

// スタイルセレクター取得と復元
const styleSelector = document.getElementById("styleSelector");
const savedStyle = localStorage.getItem("mapStyle") || "mapbox/dark-v11";
if (styleSelector) {
  styleSelector.value = savedStyle;
}
// スタイル変更時のイベントリスナー
if (styleSelector) {
  styleSelector.addEventListener("change", (e) => {
    const newStyle = e.target.value;
    localStorage.setItem("mapStyle", newStyle);
    map.setStyle(`mapbox://styles/${newStyle}`); // ← 修正ポイント（テンプレートリテラル）
  });
}
const map = new mapboxgl.Map({
  container: 'map',
  style: `mapbox://styles/${savedStyle}`,
  center: [139.76, 35.68],
  zoom: 10
});

let svg;
let nodeDataGlobal, edgeDataGlobal;

Promise.all([
  fetch("data/Node_metro_toei.json").then(res => res.json()),
  fetch("data/Edge_metro_toei_fulltime.json").then(res => res.json())
]).then(([nodeData, edgeData]) => {
  nodeDataGlobal = nodeData;
  edgeDataGlobal = edgeData;
  setupAndRender();
});

// マップスタイル変更時に再描画する
map.on("style.load", () => {
  if (nodeDataGlobal && edgeDataGlobal) {
    setupAndRender();
  }
});

function setupAndRender() {
  // SVGの再作成
  svg?.remove();
  svg = d3.select(map.getCanvasContainer()).append("svg")
    .attr("width", width)
    .attr("height", height)
    .style("position", "absolute")
    .style("top", 0)
    .style("left", 0)
    .style("pointer-events", "none");

  renderNetwork(nodeDataGlobal, edgeDataGlobal);
}

function project(lon, lat) {
  const point = map.project([lon, lat]);
  return [point.x, point.y];
}

function averageFromHours(obj, hours) {
  const values = hours.map(h => obj?.[h]).filter(v => typeof v === 'number');
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}


function renderNetwork(nodeData, edgeData) {
  // === スケール関数 ===
  const filteredEdges = edgeData.edges.filter(d => {
    const forward = averageFromHours(d.count_by_hour, selectedHours) || 0;
    const reverse = averageFromHours(
      edgeData.edges.find(e => e.station_a === d.station_b && e.station_b === d.station_a)?.count_by_hour,
      selectedHours
    ) || 0;
    return forward + reverse > 0;
  });

  const allEdgeCounts = edgeData.edges.map(d => {
    const forwardAll = averageFromHours(d.count_by_hour, Object.keys(d.count_by_hour || {})) || 0;
    const reverseAll = averageFromHours(
      edgeData.edges.find(e => e.station_a === d.station_b && e.station_b === d.station_a)?.count_by_hour,
      Object.keys(d.count_by_hour || {})
    ) || 0;
    return forwardAll + reverseAll;
  });
  
    const widthScale = d3.scaleLinear()
      .domain(d3.extent(allEdgeCounts))
      .range([MIN_WIDTH, MAX_WIDTH]);

  // === SVG要素を準備（中身は後で更新） ===
  const lines = svg.selectAll(".line")
    .data(filteredEdges)
    .join("line")
    .attr("class", "line")
    .attr("stroke", d => d.line_color)
    .attr("stroke-width", d => {
      const forward = averageFromHours(d.count_by_hour, selectedHours) || 0;
      const reverse = averageFromHours(
        edgeData.edges.find(e => e.station_a === d.station_b && e.station_b === d.station_a)?.count_by_hour,
        selectedHours
      ) || 0;
      return widthScale(forward + reverse);
    })
    .attr("stroke-linecap", "round")
    .attr("stroke-dasharray", `${DASH_SOLID} ${DASH_GAP}`)
    .attr("stroke-opacity", 0.7)
    .each(function animate(d) {
      const line = d3.select(this);
      const avgTime = averageFromHours(d.average_time_by_hour, selectedHours);
      const duration = (avgTime || 3) * BASE_ANIMATION_TIME;
      let offset = -Math.random() * FLOW_DISTANCE;
      line.attr("stroke-dashoffset", offset);
      (function repeat() {
        offset -= FLOW_DISTANCE;
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
    .attr("r", d => Math.max(Math.sqrt(d.passengers || 1000) / 150, 2)) // サイズ保証
    .attr("fill", "steelblue")
    .attr("stroke", "#333")
    .attr("stroke-width", 1)
    .attr("cx", d => project(d.lon, d.lat)[0]) 
    .attr("cy", d => project(d.lon, d.lat)[1]);
    
  circles.append("title")
    .text(d => d.id);

  // === 座標更新関数（初回と地図移動時に呼び出す） ===
  function updatePositions() {
    const nodeMap = new Map(nodeData.nodes.map(d => [d.id, [d.lon, d.lat]]));

    lines
      .attr("x1", d => project(...nodeMap.get(d.station_a))[0])
      .attr("y1", d => project(...nodeMap.get(d.station_a))[1])
      .attr("x2", d => project(...nodeMap.get(d.station_b))[0])
      .attr("y2", d => project(...nodeMap.get(d.station_b))[1]);

    circles
      .attr("cx", d => project(d.lon, d.lat)[0])
      .attr("cy", d => project(d.lon, d.lat)[1]);
  }

  // 初回描画 + 地図操作で更新
  updatePositions();
  map.on("move", updatePositions);
  map.on("zoom", updatePositions);
}